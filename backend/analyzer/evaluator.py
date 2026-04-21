"""
Evaluator — Core RAG evaluation logic.
For each checkpoint in the maturity model, searches the document
and uses Gemini to assess coverage and maturity level.
"""

from __future__ import annotations

import json
import os
from datetime import datetime
from pathlib import Path

import google.generativeai as genai

from analyzer.document_parser import chunk_text, extract_text
from analyzer.embedder import delete_collection, search_chunks, store_chunks
from database import get_db
from knowledge_base.checklist_generator import get_maturity_model

genai.configure(api_key=os.getenv("GEMINI_API_KEY", ""))

UPLOAD_DIR = Path(__file__).parent.parent.parent / "data" / "uploads"

EVALUATION_PROMPT = """You are an AI Strategy Maturity Assessor. You are evaluating whether a company document addresses a specific checkpoint from an AI maturity framework.

## Checkpoint
ID: {checkpoint_id}
Text: {checkpoint_text}
Minimum Maturity Level: {min_level}
Sources: {sources}

## Relevant Document Excerpts
{evidence}

## Instructions
Based on the document excerpts above, assess:
1. Is this checkpoint addressed in the document? (true/false)
2. If addressed, what maturity level (1-5) does the document suggest?
   - Level 1 (Exploring): Mentioned but no concrete plans
   - Level 2 (Experimenting): Early-stage plans or pilots
   - Level 3 (Operationalizing): Established processes in place
   - Level 4 (Scaling): Organization-wide, measured, optimized
   - Level 5 (Transforming): Industry-leading, innovative
3. What specific evidence from the document supports your assessment?
4. What recommendation would you give to improve?

Respond in valid JSON format:
{{
    "covered": true/false,
    "level": 0-5,
    "confidence": 0.0-1.0,
    "evidence": "specific quote or summary from document",
    "recommendation": "concrete improvement suggestion"
}}
"""


async def evaluate_document(analysis_id: str):
    """
    Run full RAG-based evaluation of a document against all checkpoints.
    Updates the database with results as it progresses.
    """
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT * FROM analyses WHERE id = ?", (analysis_id,)
        )
        row = await cursor.fetchone()
        if not row:
            raise ValueError(f"Analysis {analysis_id} not found")

        document_name = row["document_name"]
        file_type = row["file_type"]
    finally:
        await db.close()

    # 1. Extract text from document
    file_path = UPLOAD_DIR / f"{analysis_id}{file_type}"
    if not file_path.exists():
        raise FileNotFoundError(f"Document file not found: {file_path}")

    text = extract_text(file_path)

    # 2. Chunk the document
    chunks = chunk_text(text)

    # 3. Store chunks in ChromaDB
    collection_name = f"doc_{analysis_id}"
    await store_chunks(collection_name, chunks)

    # 4. Evaluate each checkpoint
    model = get_maturity_model()
    all_checkpoints = []
    for dim in model.dimensions:
        for cp in dim.checkpoints:
            all_checkpoints.append((dim, cp))

    import asyncio

    gemini_model = genai.GenerativeModel("gemini-2.5-flash")
    semaphore = asyncio.Semaphore(5)  # Max 5 concurrent API calls

    async def evaluate_single(dim, cp):
        async with semaphore:
            try:
                # Semantic search for relevant chunks
                relevant = await search_chunks(
                    collection_name,
                    cp.text,
                    n_results=3,
                )

                evidence_text = "\n---\n".join(
                    [f"[Section: {r['section']}]\n{r['text']}" for r in relevant]
                )

                if not evidence_text.strip():
                    evidence_text = "(No relevant sections found in the document)"

                # LLM evaluation
                prompt = EVALUATION_PROMPT.format(
                    checkpoint_id=cp.id,
                    checkpoint_text=cp.text,
                    min_level=cp.min_level,
                    sources=", ".join(cp.sources),
                    evidence=evidence_text,
                )

                # Run sync Gemini call in thread pool to not block event loop
                import functools
                loop = asyncio.get_event_loop()
                response = await loop.run_in_executor(
                    None,
                    functools.partial(
                        gemini_model.generate_content,
                        prompt,
                        generation_config=genai.GenerationConfig(
                            response_mime_type="application/json",
                            temperature=0.1,
                        ),
                    )
                )

                result = json.loads(response.text)

                evaluation = {
                    "checkpoint_id": cp.id,
                    "checkpoint_text": cp.text,
                    "dimension_id": dim.id,
                    "covered": result.get("covered", False),
                    "level": result.get("level", 0),
                    "confidence": result.get("confidence", 0.0),
                    "evidence": result.get("evidence", ""),
                    "recommendation": result.get("recommendation", ""),
                    "relevant_chunks": [r["text"][:200] for r in relevant],
                }

                # Track for scoring
                if result.get("covered", False):
                    assessment_dict[cp.id] = {
                        "fulfilled": True,
                        "level": result.get("level", cp.min_level),
                    }

                return evaluation

            except Exception as e:
                return {
                    "checkpoint_id": cp.id,
                    "checkpoint_text": cp.text,
                    "dimension_id": dim.id,
                    "covered": False,
                    "level": 0,
                    "confidence": 0.0,
                    "evidence": f"Evaluation error: {str(e)}",
                    "recommendation": "Manual review required",
                    "relevant_chunks": [],
                }

    # Run all evaluations concurrently (bounded by semaphore)
    tasks = [evaluate_single(dim, cp) for dim, cp in all_checkpoints]
    evaluations = await asyncio.gather(*tasks)

    # 5. Calculate scores
    from knowledge_base.checklist_generator import calculate_maturity_score

    score_result = calculate_maturity_score(assessment_dict)

    # 6. Generate recommendations
    gaps = [e for e in evaluations if not e["covered"]]
    recommendations = [
        e["recommendation"]
        for e in gaps
        if e.get("recommendation") and e["recommendation"] != "Manual review required"
    ][:10]

    # 7. Store results
    db = await get_db()
    try:
        await db.execute(
            """UPDATE analyses SET
                status = 'completed',
                overall_score = ?,
                overall_level = ?,
                dimension_scores = ?,
                strengths = ?,
                gaps = ?,
                recommendations = ?,
                evaluations = ?,
                completed_at = ?
               WHERE id = ?""",
            (
                score_result["overall_score"],
                score_result["overall_level"],
                json.dumps(score_result["dimension_scores"]),
                json.dumps(score_result["strengths"]),
                json.dumps(score_result["gaps"]),
                json.dumps(recommendations),
                json.dumps(evaluations),
                datetime.now().isoformat(),
                analysis_id,
            ),
        )
        await db.commit()
    finally:
        await db.close()

    # Cleanup: optionally keep embeddings for future queries
    # delete_collection(collection_name)
