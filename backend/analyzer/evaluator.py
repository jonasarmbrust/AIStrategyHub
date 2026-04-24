"""
Evaluator — Core RAG evaluation logic.
For each checkpoint in the maturity model, searches the document
and uses Gemini to assess coverage and maturity level.

Optimized with batch evaluation (5 checkpoints per LLM call)
to reduce API costs by ~80%.
"""

from __future__ import annotations

import asyncio
import functools
import json
import logging
from datetime import datetime
from pathlib import Path

import google.generativeai as genai

from analyzer.document_parser import chunk_text, extract_text
from analyzer.embedder import delete_collection, search_chunks, store_chunks
from database import get_db
from knowledge_base.checklist_generator import get_maturity_model
from config import UPLOAD_DIR, require_gemini_key

log = logging.getLogger("evaluator")

BATCH_SIZE = 5  # Checkpoints per LLM call

BATCH_EVALUATION_PROMPT = """You are an AI Strategy Maturity Assessor. Evaluate whether the document excerpts address each of the following checkpoints from an AI maturity framework.

## Checkpoints to Evaluate
{checkpoint_list}

## Relevant Document Excerpts
{evidence}

## Instructions
For EACH checkpoint above, assess:
1. Is this checkpoint addressed in the document? (true/false)
2. If addressed, what maturity level (1-5)?
   - Level 1 (Exploring): Mentioned but no concrete plans
   - Level 2 (Experimenting): Early-stage plans or pilots
   - Level 3 (Operationalizing): Established processes in place
   - Level 4 (Scaling): Organization-wide, measured, optimized
   - Level 5 (Transforming): Industry-leading, innovative
3. What specific evidence from the document supports your assessment?
4. Evidence depth (1=briefly mentioned, 2=described in detail, 3=concrete implementation/metrics shown)
5. What recommendation would you give to improve?

Respond with a JSON array, one entry per checkpoint, in the same order as listed above:
[
    {{
        "checkpoint_id": "CP_XX_YY",
        "covered": true/false,
        "level": 0-5,
        "confidence": 0.0-1.0,
        "evidence_depth": 1-3,
        "evidence": "specific quote or summary from document",
        "recommendation": "concrete improvement suggestion"
    }}
]
"""

SINGLE_EVALUATION_PROMPT = """You are an AI Strategy Maturity Assessor. Evaluate whether a company document addresses this checkpoint:

## Checkpoint
ID: {checkpoint_id}
Text: {checkpoint_text}
Minimum Maturity Level: {min_level}

## Relevant Document Excerpts
{evidence}

Respond in valid JSON:
{{
    "covered": true/false,
    "level": 0-5,
    "confidence": 0.0-1.0,
    "evidence_depth": 1-3,
    "evidence": "specific quote or summary",
    "recommendation": "improvement suggestion"
}}
"""


async def evaluate_document(analysis_id: str):
    """
    Run full RAG-based evaluation of a document against all checkpoints.
    Uses batch evaluation (5 CPs per call) to reduce API costs by ~80%.
    """
    log.info(f"Starting evaluation for {analysis_id}")
    api_key = require_gemini_key()

    db = await get_db()
    try:
        cursor = await db.execute("SELECT * FROM analyses WHERE id = ?", (analysis_id,))
        row = await cursor.fetchone()
    finally:
        pass

    if not row:
        raise ValueError(f"Analysis {analysis_id} not found")

    document_name = row["document_name"]
    file_type = row["file_type"]

    # 1. Extract text
    file_path = UPLOAD_DIR / f"{analysis_id}{file_type}"
    if not file_path.exists():
        raise FileNotFoundError(f"Document file not found: {file_path}")

    text = extract_text(file_path)
    log.info(f"Extracted {len(text)} chars from {file_path.name}")

    # 2. Chunk
    chunks = chunk_text(text)
    log.info(f"Created {len(chunks)} chunks")

    # 3. Store embeddings
    collection_name = f"doc_{analysis_id}"
    await store_chunks(collection_name, chunks)

    # 4. Group checkpoints into batches
    model = get_maturity_model()
    all_checkpoints = []
    for dim in model.dimensions:
        for cp in dim.checkpoints:
            all_checkpoints.append((dim, cp))

    genai.configure(api_key=api_key)
    gemini_model = genai.GenerativeModel("gemini-2.5-flash")
    semaphore = asyncio.Semaphore(3)

    assessment_dict = {}
    all_evaluations = []

    batches = [all_checkpoints[i:i + BATCH_SIZE] for i in range(0, len(all_checkpoints), BATCH_SIZE)]
    log.info(f"Evaluating {len(all_checkpoints)} checkpoints in {len(batches)} batches")

    async def evaluate_batch(batch):
        async with semaphore:
            try:
                # Gather evidence for batch
                checkpoint_metadata = []
                all_evidence = []
                for dim, cp in batch:
                    relevant = await search_chunks(collection_name, cp.text, n_results=2)
                    evidence_text = "\n".join([f"[{r['section']}] {r['text']}" for r in relevant])
                    all_evidence.append(evidence_text)
                    checkpoint_metadata.append({"dim": dim, "cp": cp, "relevant": relevant})

                # Build batch prompt
                cp_list = "\n".join([
                    f"- ID: {m['cp'].id} | Text: {m['cp'].text} | Min Level: {m['cp'].min_level}"
                    for m in checkpoint_metadata
                ])
                combined = "\n---\n".join([
                    f"[Evidence for {m['cp'].id}]\n{ev}"
                    for m, ev in zip(checkpoint_metadata, all_evidence)
                ]) or "(No relevant sections found)"

                prompt = BATCH_EVALUATION_PROMPT.format(checkpoint_list=cp_list, evidence=combined)

                # LLM call with retry
                loop = asyncio.get_event_loop()
                response = None
                for attempt in range(4):
                    try:
                        response = await loop.run_in_executor(None, functools.partial(
                            gemini_model.generate_content, prompt,
                            generation_config=genai.GenerationConfig(response_mime_type="application/json", temperature=0.1),
                        ))
                        break
                    except Exception as e:
                        if ("429" in str(e) or "Resource" in str(e)) and attempt < 3:
                            wait = 2 ** (attempt + 1)
                            log.warning(f"Rate limited, retry {attempt+1}/3 in {wait}s...")
                            await asyncio.sleep(wait)
                        else:
                            raise

                results = json.loads(response.text)
                if isinstance(results, dict):
                    results = [results]

                evaluations = []
                for idx, meta in enumerate(checkpoint_metadata):
                    result = results[idx] if idx < len(results) else {}
                    if not result:
                        for r in results:
                            if r.get("checkpoint_id") == meta["cp"].id:
                                result = r
                                break

                    ev = {
                        "checkpoint_id": meta["cp"].id,
                        "checkpoint_text": meta["cp"].text,
                        "dimension_id": meta["dim"].id,
                        "dimension_name": meta["dim"].name,
                        "covered": result.get("covered", False),
                        "level": result.get("level", 0),
                        "confidence": result.get("confidence", 0.0),
                        "evidence_depth": result.get("evidence_depth", 1),
                        "evidence": result.get("evidence", ""),
                        "recommendation": result.get("recommendation", ""),
                        "relevant_chunks": [r["text"][:200] for r in meta["relevant"]],
                        "min_level": meta["cp"].min_level,
                        "sources": meta["cp"].sources,
                    }
                    if result.get("covered"):
                        assessment_dict[meta["cp"].id] = {
                            "fulfilled": True,
                            "level": result.get("level", meta["cp"].min_level),
                            "confidence": result.get("confidence", 0.5),
                            "evidence_depth": result.get("evidence_depth", 1),
                        }
                    evaluations.append(ev)
                return evaluations

            except Exception as e:
                log.warning(f"Batch failed, falling back to individual: {e}")
                fallback = []
                for dim, cp in batch:
                    fallback.append(await _evaluate_single(gemini_model, collection_name, dim, cp, assessment_dict))
                return fallback

    # Run batches
    tasks = [evaluate_batch(b) for b in batches]
    results = await asyncio.gather(*tasks)
    for batch_evals in results:
        all_evaluations.extend(batch_evals)

    # 5. Calculate scores
    from knowledge_base.checklist_generator import calculate_maturity_score
    score_result = calculate_maturity_score(assessment_dict)
    log.info(f"Score: {score_result['overall_score']:.1f}, Level: {score_result['overall_level']}")

    # 6. Recommendations
    recommendations = [
        e["recommendation"] for e in all_evaluations
        if not e["covered"] and e.get("recommendation") and e["recommendation"] != "Manual review required"
    ][:10]

    # 7. Executive Summary
    executive_summary = ""
    try:
        covered = sum(1 for e in all_evaluations if e["covered"])
        total = len(all_evaluations)
        strengths = [e for e in all_evaluations if e["covered"] and e.get("confidence", 0) >= 0.7]
        gaps = [e for e in all_evaluations if not e["covered"]][:5]

        summary_prompt = f"""You are an AI Strategy consultant. Write a concise Executive Summary (3-4 paragraphs) based on:

Overall Score: {score_result['overall_score']:.1f}% (Level {score_result['overall_level']}/5)
Covered: {covered}/{total}

Strengths:
{chr(10).join(f'- {s["checkpoint_text"]} (L{s["level"]}, {s["confidence"]:.0%})' for s in strengths[:5])}

Gaps:
{chr(10).join(f'- {g["checkpoint_text"]}: {g["recommendation"]}' for g in gaps)}

Dimensions:
{chr(10).join(f'- {ds["dimension_name"]}: {ds["score"]:.0f}%' for ds in score_result['dimension_scores'])}

Include: current maturity assessment, strongest areas, critical gaps, 3 strategic next steps. Professional tone, no JSON."""

        loop = asyncio.get_event_loop()
        resp = await loop.run_in_executor(None, functools.partial(
            gemini_model.generate_content, summary_prompt,
            generation_config=genai.GenerationConfig(temperature=0.3),
        ))
        executive_summary = resp.text.strip()
        log.info(f"Executive summary: {len(executive_summary)} chars")
    except Exception as e:
        log.warning(f"Executive summary failed: {e}")

    # 8. Store results
    db = await get_db()
    await db.execute(
        """UPDATE analyses SET
            status = 'completed', overall_score = ?, overall_level = ?,
            dimension_scores = ?, strengths = ?, gaps = ?,
            recommendations = ?, evaluations = ?, executive_summary = ?,
            completed_at = ?
           WHERE id = ?""",
        (
            score_result["overall_score"], score_result["overall_level"],
            json.dumps(score_result["dimension_scores"]),
            json.dumps(score_result["strengths"]), json.dumps(score_result["gaps"]),
            json.dumps(recommendations), json.dumps(all_evaluations),
            executive_summary, datetime.now().isoformat(), analysis_id,
        ),
    )
    await db.commit()
    log.info(f"Evaluation complete: {len(batches)} LLM calls (was {len(all_checkpoints)})")


async def _evaluate_single(gemini_model, collection_name, dim, cp, assessment_dict):
    """Fallback: evaluate single checkpoint."""
    try:
        relevant = await search_chunks(collection_name, cp.text, n_results=3)
        evidence = "\n---\n".join([f"[{r['section']}] {r['text']}" for r in relevant]) or "(None)"

        prompt = SINGLE_EVALUATION_PROMPT.format(
            checkpoint_id=cp.id, checkpoint_text=cp.text, min_level=cp.min_level, evidence=evidence,
        )
        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(None, functools.partial(
            gemini_model.generate_content, prompt,
            generation_config=genai.GenerationConfig(response_mime_type="application/json", temperature=0.1),
        ))
        result = json.loads(response.text)

        if result.get("covered"):
            assessment_dict[cp.id] = {
                "fulfilled": True, "level": result.get("level", cp.min_level),
                "confidence": result.get("confidence", 0.5), "evidence_depth": result.get("evidence_depth", 1),
            }

        return {
            "checkpoint_id": cp.id, "checkpoint_text": cp.text,
            "dimension_id": dim.id, "dimension_name": dim.name,
            "covered": result.get("covered", False), "level": result.get("level", 0),
            "confidence": result.get("confidence", 0.0), "evidence_depth": result.get("evidence_depth", 1),
            "evidence": result.get("evidence", ""), "recommendation": result.get("recommendation", ""),
            "relevant_chunks": [r["text"][:200] for r in relevant],
            "min_level": cp.min_level, "sources": cp.sources,
        }
    except Exception as e:
        return {
            "checkpoint_id": cp.id, "checkpoint_text": cp.text,
            "dimension_id": dim.id, "dimension_name": dim.name,
            "covered": False, "level": 0, "confidence": 0.0, "evidence_depth": 0,
            "evidence": f"Error: {e}", "recommendation": "Manual review required",
            "relevant_chunks": [], "min_level": cp.min_level, "sources": cp.sources,
        }
