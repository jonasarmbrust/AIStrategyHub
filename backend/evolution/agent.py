"""
Evolution Agent — Autonomous agent that evolves the Meta-Framework.

Orchestrates the full evolution cycle:
1. Snapshot current framework (for rollback)
2. Deep research scan across all 7 dimensions
3. Quality assessment and checkpoint extraction for qualified sources
4. Redundancy detection and auto-merge of duplicates
5. Framework integration with full audit trail

Uses Gemini 2.5 Flash for evaluations, consistent with the rest of the project.
"""

from __future__ import annotations

import asyncio
import functools
import json
import logging
import os
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import google.generativeai as genai

from config import (
    DIMENSIONS_PATH,
    GEMINI_API_KEY,
    EVOLUTION_AUTO_INTEGRATE,
    EVOLUTION_MIN_QUALITY,
    EVOLUTION_REDUNDANCY_THRESHOLD,
)
from database import get_db
from knowledge_base.checklist_generator import _load_model, clear_cache
from evolution.redundancy_detector import RedundancyDetector

log = logging.getLogger("evolution.agent")

_existing_embeddings_cache: dict[str, list[float]] = {}

def clear_embeddings_cache():
    global _existing_embeddings_cache
    _existing_embeddings_cache.clear()

# Semaphore for rate-limiting concurrent Gemini calls
_gemini_semaphore = asyncio.Semaphore(3)

# ── Dimension-specific search queries for academic/deep research ──────────

_EVOLUTION_QUERIES = {
    "strategy": [
        "AI strategy maturity framework enterprise 2025 2026",
        "site:arxiv.org AI organizational strategy assessment",
        "AI strategic planning maturity model research paper",
    ],
    "data": [
        "AI data governance maturity assessment framework",
        "site:arxiv.org data quality AI pipeline enterprise",
        "data strategy artificial intelligence readiness",
    ],
    "governance": [
        "AI governance risk management framework 2025 2026",
        "EU AI Act compliance maturity assessment",
        "site:arxiv.org AI risk governance enterprise",
    ],
    "technology": [
        "MLOps maturity model enterprise deployment 2025",
        "site:arxiv.org MLOps CI/CD AI production",
        "AI infrastructure scalability assessment framework",
    ],
    "talent": [
        "AI workforce skills maturity assessment enterprise",
        "AI talent development organizational readiness",
        "site:arxiv.org AI literacy training workforce",
    ],
    "ethics": [
        "responsible AI maturity framework assessment 2025",
        "AI ethics fairness transparency accountability",
        "site:arxiv.org responsible AI governance enterprise",
    ],
    "processes": [
        "AI scaling enterprise production maturity 2025",
        "AI change management organizational transformation",
        "site:arxiv.org AI adoption lifecycle enterprise",
    ],
}


# ── Quality Assessment Prompt ─────────────────────────────────────────────

_QUALITY_ASSESSMENT_PROMPT = """You are an AI Strategy Research Quality Assessor.
Evaluate this source for potential integration into an enterprise AI Maturity Framework.

## Source
Title: {title}
URL: {url}
Content (excerpt):
{content}

## Evaluation Criteria (each 0.0 to 1.0):
1. **scientific_rigor**: Is the source peer-reviewed, from a reputable institution, methodologically sound?
2. **practical_applicability**: Does it provide actionable guidelines for enterprises?
3. **novelty**: Does it introduce concepts not already in typical AI maturity frameworks?
4. **source_authority**: Is it from authoritative sources (NIST, EU, Google, Microsoft, IEEE, ACM, etc.)?
5. **recency**: Is it from the last 2 years (2024-2026)?
6. **framework_relevance**: How well does it align with AI maturity assessment for enterprises?

## Current Framework Dimensions
{dimension_context}

Respond in valid JSON:
{{
    "scientific_rigor": 0.0-1.0,
    "practical_applicability": 0.0-1.0,
    "novelty": 0.0-1.0,
    "source_authority": 0.0-1.0,
    "recency": 0.0-1.0,
    "framework_relevance": 0.0-1.0,
    "quality_rationale": "Brief explanation of the overall assessment"
}}"""


# ── Checkpoint Extraction Prompt ──────────────────────────────────────────

_CHECKPOINT_EXTRACTION_PROMPT = """You are a Master Enterprise Architecture and AI Strategy expert.
Your job is to read a newly discovered Industry Framework or Research Article, compare it to our existing Master Meta-Model, and extract NOVEL strategic checkpoints/guidelines that our Meta-Model is currently missing.

EXISTING META-MODEL:
{meta_model_context}

NEW RESEARCH SOURCE ({title}):
URL: {url}
Content:
{content}

INSTRUCTIONS:
1. Identify up to 5 distinct, highly-valuable strategic rules, processes, or guidelines mentioned in the document that are NOT covered in our existing checkpoints.
2. Formulate them as formal Checkpoints in English and German.
3. Assign them to the most appropriate existing dimension_id: {dim_ids}.
4. Give a brief rationale for why this is missing and valuable.
5. Only propose truly novel checkpoints — skip anything already covered.

Respond EXACTLY in this JSON format:
{{
  "proposals": [
    {{
      "dimension_id": "governance",
      "text": "English Guideline...",
      "text_de": "German Translation...",
      "min_level": 3,
      "category": "Risk Management",
      "sources": ["{title}"],
      "rationale": "Why we need this..."
    }}
  ]
}}"""


class EvolutionAgent:
    """Autonomous agent that evolves the Meta-Framework."""

    def __init__(self):
        """Initialize the Evolution Agent."""
        self._running = False

    async def run_evolution_cycle(self) -> dict:
        """Execute a complete evolution cycle.

        Complete weekly evolution cycle:
        1. Create framework snapshot (for rollback)
        2. Deep research scan across all 7 dimensions
        3. For each high-quality source (relevance >= 0.5):
           a. Fetch full content via httpx
           b. Assess quality & impact via Gemini (multi-criteria scoring)
           c. If quality_score >= EVOLUTION_MIN_QUALITY:
              - Extract novel checkpoint proposals
              - Run redundancy detection against existing CPs
              - Auto-integrate non-redundant proposals
              - Log everything to evolution_proposals table
        4. Run global redundancy scan across ALL existing checkpoints
        5. Auto-merge highly redundant checkpoint pairs
        6. Update evolution_runs with final stats

        Returns:
            dict with run_id and statistics
        """
        if self._running:
            log.warning("Evolution cycle already running, skipping")
            return {"status": "already_running"}

        self._running = True
        run_id = str(uuid.uuid4())[:8]
        run_log: list[str] = []
        stats = {
            "sources_scanned": 0,
            "sources_qualified": 0,
            "checkpoints_proposed": 0,
            "checkpoints_integrated": 0,
            "redundancies_found": 0,
            "redundancies_resolved": 0,
        }

        def _log(msg: str):
            """Append timestamped message to run log."""
            ts = datetime.now(timezone.utc).strftime("%H:%M:%S")
            entry = f"[{ts}] {msg}"
            run_log.append(entry)
            log.info(f"[Run {run_id}] {msg}")

        try:
            # ── Create run record ─────────────────────────────────────
            db = await get_db()
            try:
                await db.execute(
                    """INSERT INTO evolution_runs (id, status, config)
                       VALUES (?, 'running', ?)""",
                    (run_id, json.dumps({
                        "min_quality": EVOLUTION_MIN_QUALITY,
                        "auto_integrate": EVOLUTION_AUTO_INTEGRATE,
                        "redundancy_threshold": EVOLUTION_REDUNDANCY_THRESHOLD,
                    })),
                )
                await db.commit()
            finally:
                pass  # singleton connection, no close needed

            _log("Evolution cycle started")

            # ── 1. Create framework snapshot ──────────────────────────
            _log("Creating framework snapshot...")
            await self._create_snapshot(run_id)

            # ── 2. Check API keys ────────────────────────────────────
            if not GEMINI_API_KEY:
                _log("ERROR: No GEMINI_API_KEY configured, aborting")
                raise RuntimeError("GEMINI_API_KEY is required for evolution cycle")

            tavily_key = os.getenv("TAVILY_API_KEY", "").strip()
            if not tavily_key:
                _log("ERROR: No TAVILY_API_KEY configured, aborting")
                raise RuntimeError("TAVILY_API_KEY is required for evolution cycle")

            # ── 3. Deep research scan ─────────────────────────────────
            _log("Starting deep research scan across all dimensions...")
            genai.configure(api_key=GEMINI_API_KEY)

            all_sources = await self._research_scan(tavily_key, run_log, stats)
            _log(f"Research scan complete: {stats['sources_scanned']} scanned, {len(all_sources)} new sources")

            # ── 4. Quality assessment and extraction ──────────────────
            _log("Starting quality assessment of new sources...")
            model_context = self._get_framework_context()

            for source in all_sources:
                try:
                    # Skip low-relevance sources
                    if source.get("relevance_score", 0) < 0.5:
                        continue

                    stats["sources_qualified"] += 1
                    title = source.get("title", "Unknown")
                    url = source.get("url", "")
                    source_id = source.get("id", str(uuid.uuid4())[:8])

                    # Fetch full content
                    content = await self._fetch_content(url)
                    if not content or len(content) < 100:
                        content = source.get("summary", source.get("content", ""))
                    if not content or len(content) < 50:
                        _log(f"  Skipping '{title[:40]}' — insufficient content")
                        continue

                    # Quality assessment via Gemini
                    assessment = await self._assess_quality(title, url, content, model_context)
                    quality_score = assessment.get("quality_score", 0)
                    impact_score = assessment.get("impact_score", 0)
                    novelty_score = assessment.get("novelty_score", 0)

                    _log(f"  Assessed '{title[:40]}': quality={quality_score:.2f}, impact={impact_score:.2f}")

                    if quality_score < EVOLUTION_MIN_QUALITY:
                        _log(f"  Below quality threshold ({EVOLUTION_MIN_QUALITY}), skipping")
                        continue

                    # Extract novel checkpoints
                    proposals = await self._extract_checkpoints(title, url, content)
                    if not proposals:
                        _log(f"  No novel checkpoints found")
                        continue

                    stats["checkpoints_proposed"] += len(proposals)
                    _log(f"  Extracted {len(proposals)} checkpoint proposals")

                    # Store proposals and optionally auto-integrate
                    for proposal in proposals:
                        proposal_id = str(uuid.uuid4())[:8]
                        proposal_status = "pending"

                        # Check for redundancy against existing checkpoints
                        is_redundant = await self._check_proposal_redundancy(proposal)
                        if is_redundant:
                            _log(f"    Proposal '{proposal['text'][:40]}' is redundant, skipping")
                            proposal_status = "redundant"
                        elif EVOLUTION_AUTO_INTEGRATE:
                            # Auto-integrate
                            cp_id = await self._integrate_proposal(proposal, source_id, title, url)
                            if cp_id:
                                proposal_status = "integrated"
                                stats["checkpoints_integrated"] += 1
                                _log(f"    Integrated: {cp_id} → {proposal.get('dimension_id', '?')}")

                        # Store proposal in DB
                        db = await get_db()
                        try:
                            await db.execute(
                                """INSERT INTO evolution_proposals
                                   (id, run_id, source_id, source_title, source_url,
                                    proposal_type, dimension_id, checkpoint_data,
                                    quality_score, impact_score, novelty_score, status,
                                    integrated_checkpoint_id)
                                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                                (
                                    proposal_id, run_id, source_id, title, url,
                                    "new_checkpoint",
                                    proposal.get("dimension_id", ""),
                                    json.dumps(proposal),
                                    quality_score, impact_score, novelty_score,
                                    proposal_status,
                                    proposal.get("integrated_checkpoint_id"),
                                ),
                            )
                            await db.commit()
                        finally:
                            pass  # singleton connection, no close needed

                except Exception as e:
                    _log(f"  Error processing source: {e}")
                    continue

            # ── 5. Global redundancy scan ─────────────────────────────
            _log("Running global redundancy scan...")
            try:
                detector = RedundancyDetector(threshold=EVOLUTION_REDUNDANCY_THRESHOLD)
                redundancies = await detector.find_redundancies()
                stats["redundancies_found"] = len(redundancies)
                _log(f"Found {len(redundancies)} redundant checkpoint pairs")

                # Auto-merge top redundancies (limit to 3 per run for safety)
                for pair in redundancies[:3]:
                    try:
                        cp1 = pair["cp1"]
                        cp2 = pair["cp2"]
                        validation = await detector.validate_redundancy(cp1["text"], cp2["text"])
                        if validation.get("is_redundant"):
                            result = await detector.execute_merge(
                                keep_id=cp1["id"],
                                remove_id=cp2["id"],
                                merged_data=validation,
                            )
                            if result.get("success"):
                                stats["redundancies_resolved"] += 1
                                _log(f"  Merged: {cp2['id']} → {cp1['id']}")
                    except Exception as e:
                        _log(f"  Merge failed: {e}")
            except Exception as e:
                _log(f"Redundancy scan failed: {e}")

            # ── 6. Finalize ───────────────────────────────────────────
            _log(f"Evolution cycle complete. Stats: {json.dumps(stats)}")

            db = await get_db()
            try:
                await db.execute(
                    """UPDATE evolution_runs
                       SET status = 'completed',
                           completed_at = ?,
                           sources_scanned = ?,
                           sources_qualified = ?,
                           checkpoints_proposed = ?,
                           checkpoints_integrated = ?,
                           redundancies_found = ?,
                           redundancies_resolved = ?,
                           log = ?
                       WHERE id = ?""",
                    (
                        datetime.now(timezone.utc).isoformat(),
                        stats["sources_scanned"],
                        stats["sources_qualified"],
                        stats["checkpoints_proposed"],
                        stats["checkpoints_integrated"],
                        stats["redundancies_found"],
                        stats["redundancies_resolved"],
                        json.dumps(run_log),
                        run_id,
                    ),
                )
                await db.commit()
            finally:
                pass  # singleton connection, no close needed

            return {"run_id": run_id, "status": "completed", **stats}

        except Exception as e:
            log.error(f"Evolution cycle failed: {e}")
            _log(f"FATAL ERROR: {e}")

            # Update run with error status
            try:
                db = await get_db()
                try:
                    await db.execute(
                        """UPDATE evolution_runs
                           SET status = 'failed',
                               completed_at = ?,
                               error = ?,
                               log = ?
                           WHERE id = ?""",
                        (
                            datetime.now(timezone.utc).isoformat(),
                            str(e),
                            json.dumps(run_log),
                            run_id,
                        ),
                    )
                    await db.commit()
                finally:
                    pass  # singleton connection, no close needed
            except Exception:
                log.error("Failed to update run status after error")

            return {"run_id": run_id, "status": "failed", "error": str(e), **stats}

        finally:
            self._running = False

    # ── Private helpers ───────────────────────────────────────────────────

    async def _create_snapshot(self, run_id: str) -> str:
        """Create a snapshot of the current framework for rollback."""
        snapshot_id = str(uuid.uuid4())[:8]
        try:
            from knowledge_base.checklist_generator import safe_read_json
            data = await safe_read_json()

            # Count total checkpoints
            cp_count = sum(
                len(dim.get("checkpoints", []))
                for dim in data.get("dimensions", [])
            )

            # Generate version tag
            version_tag = f"v{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}"

            db = await get_db()
            try:
                await db.execute(
                    """INSERT INTO framework_snapshots (id, run_id, snapshot_data, checkpoint_count, version_tag)
                       VALUES (?, ?, ?, ?, ?)""",
                    (snapshot_id, run_id, json.dumps(data), cp_count, version_tag),
                )
                await db.commit()
            finally:
                pass  # singleton connection, no close needed

            log.info(f"Framework snapshot created: {snapshot_id} ({cp_count} checkpoints)")
        except Exception as e:
            log.error(f"Failed to create snapshot: {e}")

        return snapshot_id

    async def _research_scan(
        self,
        tavily_key: str,
        run_log: list[str],
        stats: dict,
    ) -> list[dict]:
        """Execute deep research scan across all dimensions using Tavily.

        Returns list of new (not yet in DB) research sources with evaluations.
        """
        try:
            from tavily import TavilyClient
            tavily_client = TavilyClient(api_key=tavily_key)
        except ImportError:
            run_log.append("ERROR: tavily-python not installed")
            return []

        gemini_model = genai.GenerativeModel("gemini-2.5-flash")
        all_new_sources = []

        for dim_id, queries in _EVOLUTION_QUERIES.items():
            for query in queries:
                try:
                    response = tavily_client.search(
                        query=query,
                        search_depth="basic",
                        max_results=5,
                        include_answer=False,
                        include_raw_content=False,
                    )
                    results = response.get("results", [])
                    stats["sources_scanned"] += len(results)

                    # Deduplicate against existing DB sources
                    db = await get_db()
                    try:
                        cursor = await db.execute("SELECT url FROM research_sources")
                        existing_urls = {row["url"] for row in await cursor.fetchall()}
                    finally:
                        pass  # singleton connection, no close needed

                    for result in results:
                        url = result.get("url", "")
                        if not url or url in existing_urls:
                            continue

                        title = result.get("title", "Untitled")
                        content = result.get("content", "")[:2000]

                        # Evaluate relevance with Gemini
                        evaluation = {
                            "relevance_score": 0.5,
                            "category": "article",
                            "relevant_dimensions": [dim_id],
                            "summary": content[:200] + "..." if len(content) > 200 else content,
                        }

                        try:
                            from research.agent import RELEVANCE_PROMPT
                            async with _gemini_semaphore:
                                prompt = RELEVANCE_PROMPT.format(
                                    title=title, url=url, content=content,
                                )
                                resp = gemini_model.generate_content(
                                    prompt,
                                    generation_config=genai.GenerationConfig(
                                        response_mime_type="application/json",
                                        temperature=0.1,
                                    ),
                                )
                                llm_eval = json.loads(resp.text)
                                evaluation.update(llm_eval)
                        except Exception as e:
                            log.debug(f"Gemini eval fallback for '{title[:30]}': {e}")

                        # Skip very low relevance
                        if evaluation.get("relevance_score", 0) < 0.2:
                            continue

                        # Store in research_sources DB
                        source_id = str(uuid.uuid4())[:8]
                        db = await get_db()
                        try:
                            await db.execute(
                                """INSERT OR IGNORE INTO research_sources
                                   (id, title, url, summary, category, relevant_dimensions,
                                    published_date, relevance_score)
                                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                                (
                                    source_id, title, url,
                                    evaluation.get("summary", ""),
                                    evaluation.get("category", "article"),
                                    json.dumps(evaluation.get("relevant_dimensions", [dim_id])),
                                    result.get("published_date"),
                                    evaluation.get("relevance_score", 0.5),
                                ),
                            )
                            await db.commit()
                        finally:
                            pass  # singleton connection, no close needed

                        existing_urls.add(url)
                        all_new_sources.append({
                            "id": source_id,
                            "title": title,
                            "url": url,
                            "content": content,
                            "summary": evaluation.get("summary", ""),
                            "relevance_score": evaluation.get("relevance_score", 0.5),
                            "relevant_dimensions": evaluation.get("relevant_dimensions", [dim_id]),
                        })

                except Exception as e:
                    log.warning(f"Search failed for '{query[:40]}': {e}")
                    continue

                # Small delay between Tavily calls
                await asyncio.sleep(0.5)

        return all_new_sources

    def _get_framework_context(self) -> str:
        """Build a compact framework context string for LLM prompts."""
        try:
            model = _load_model()
            parts = []
            for dim in model.dimensions:
                cp_texts = [f"  - {cp.text}" for cp in dim.checkpoints[:10]]
                parts.append(
                    f"Dimension: {dim.id} ({dim.name})\n"
                    + "\n".join(cp_texts)
                )
            return "\n\n".join(parts)
        except Exception as e:
            log.error(f"Failed to load framework context: {e}")
            return "Framework context unavailable"

    async def _fetch_content(self, url: str) -> str:
        """Fetch and clean web page content from a URL."""
        if not url:
            return ""

        try:
            import httpx
            async with httpx.AsyncClient(follow_redirects=True, timeout=30) as client:
                resp = await client.get(url, headers={"User-Agent": "AI-Strategy-Hub/2.0"})
                resp.raise_for_status()
                raw = resp.text
                # Strip HTML tags
                content = re.sub(r'<[^>]+>', ' ', raw)
                content = re.sub(r'\s+', ' ', content).strip()
                return content[:15000]  # Cap at 15k chars for LLM context
        except Exception as e:
            log.debug(f"Could not fetch URL {url}: {e}")
            return ""

    async def _assess_quality(
        self,
        title: str,
        url: str,
        content: str,
        dimension_context: str,
    ) -> dict:
        """Assess source quality using multi-criteria Gemini evaluation.

        Returns dict with quality_score, impact_score, novelty_score, and rationale.
        """
        try:
            async with _gemini_semaphore:
                model = genai.GenerativeModel("gemini-2.5-flash")
                prompt = _QUALITY_ASSESSMENT_PROMPT.format(
                    title=title,
                    url=url,
                    content=content[:8000],
                    dimension_context=dimension_context[:4000],
                )
                response = model.generate_content(
                    prompt,
                    generation_config=genai.GenerationConfig(
                        response_mime_type="application/json",
                        temperature=0.1,
                    ),
                )
                scores = json.loads(response.text)

            # Calculate composite scores
            scientific = scores.get("scientific_rigor", 0)
            practical = scores.get("practical_applicability", 0)
            novelty = scores.get("novelty", 0)
            authority = scores.get("source_authority", 0)
            recency = scores.get("recency", 0)
            relevance = scores.get("framework_relevance", 0)

            # quality_score = weighted average of all 6 criteria
            quality_score = (
                scientific * 0.15
                + practical * 0.25
                + novelty * 0.15
                + authority * 0.15
                + recency * 0.10
                + relevance * 0.20
            )
            # impact_score = practical * 0.5 + novelty * 0.3 + authority * 0.2
            impact_score = practical * 0.5 + novelty * 0.3 + authority * 0.2
            # novelty_score = novelty criterion
            novelty_score = novelty

            return {
                "quality_score": round(quality_score, 3),
                "impact_score": round(impact_score, 3),
                "novelty_score": round(novelty_score, 3),
                "quality_rationale": scores.get("quality_rationale", ""),
                "raw_scores": scores,
            }

        except Exception as e:
            log.error(f"Quality assessment failed for '{title[:40]}': {e}")
            return {"quality_score": 0, "impact_score": 0, "novelty_score": 0}

    async def _extract_checkpoints(
        self,
        title: str,
        url: str,
        content: str,
    ) -> list[dict]:
        """Extract novel checkpoint proposals from a source via Gemini."""
        try:
            model_data = _load_model()
            framework_summary = []
            for dim in model_data.dimensions:
                cp_summaries = [f"- {cp.text}" for cp in dim.checkpoints]
                framework_summary.append(
                    f"Dimension: {dim.id} ({dim.name})\nExisting Checkpoints:\n"
                    + "\n".join(cp_summaries)
                )
            meta_model_context = "\n\n".join(framework_summary)
            dim_ids = ", ".join([d.id for d in model_data.dimensions])

            async with _gemini_semaphore:
                gemini_model = genai.GenerativeModel("gemini-2.5-flash")
                prompt = _CHECKPOINT_EXTRACTION_PROMPT.format(
                    meta_model_context=meta_model_context[:8000],
                    title=title,
                    url=url,
                    content=content[:12000],
                    dim_ids=dim_ids,
                )
                response = gemini_model.generate_content(
                    prompt,
                    generation_config=genai.GenerationConfig(
                        response_mime_type="application/json",
                        temperature=0.2,
                    ),
                )
                data = json.loads(response.text)
                return data.get("proposals", [])

        except Exception as e:
            log.error(f"Checkpoint extraction failed for '{title[:40]}': {e}")
            return []

    async def _check_proposal_redundancy(self, proposal: dict) -> bool:
        """Check if a proposal is redundant against existing checkpoints.

        Uses simple text embedding similarity as a fast pre-check.
        """
        try:
            proposal_text = proposal.get("text", "")
            dim_id = proposal.get("dimension_id", "")
            if not proposal_text or not dim_id:
                return False

            # Load existing checkpoints for this dimension safely
            from knowledge_base.checklist_generator import safe_read_json
            data = await safe_read_json()

            target_dim = next(
                (d for d in data.get("dimensions", []) if d["id"] == dim_id), None
            )
            if not target_dim:
                return False

            existing_texts = [cp["text"] for cp in target_dim.get("checkpoints", [])]
            if not existing_texts:
                return False

            loop = asyncio.get_event_loop()
            genai.configure(api_key=GEMINI_API_KEY)

            # Get embedding for proposal
            proposal_emb = await loop.run_in_executor(
                None,
                functools.partial(
                    genai.embed_content,
                    model="models/gemini-embedding-2-preview",
                    content=proposal_text,
                    task_type="retrieval_document",
                ),
            )
            proposal_vec = proposal_emb["embedding"]

            # Get embeddings for existing texts (batch and cache)
            existing_vecs = []
            uncached_texts = []
            uncached_indices = []

            for i, text in enumerate(existing_texts):
                if text in _existing_embeddings_cache:
                    existing_vecs.append(_existing_embeddings_cache[text])
                else:
                    existing_vecs.append(None)
                    uncached_texts.append(text)
                    uncached_indices.append(i)

            if uncached_texts:
                try:
                    # Call batch embedding API
                    batch_response = await loop.run_in_executor(
                        None,
                        functools.partial(
                            genai.embed_content,
                            model="models/gemini-embedding-2-preview",
                            content=uncached_texts,
                            task_type="retrieval_document",
                        )
                    )
                    
                    # Parse response safely
                    if "embeddings" in batch_response:
                        batch_embs = [item["embedding"] for item in batch_response["embeddings"]]
                    elif "embedding" in batch_response:
                        batch_embs = batch_response["embedding"]
                        if batch_embs and not isinstance(batch_embs[0], list):
                            batch_embs = [batch_embs]
                    else:
                        batch_embs = []
                except Exception as e:
                    log.warning(f"Batch embedding failed: {e}. Falling back to single requests.")
                    batch_embs = []

                # Fallback if batch embedding failed or returned empty list
                if not batch_embs:
                    batch_embs = []
                    for t in uncached_texts:
                        try:
                            single_emb = await loop.run_in_executor(
                                None,
                                functools.partial(
                                    genai.embed_content,
                                    model="models/gemini-embedding-2-preview",
                                    content=t,
                                    task_type="retrieval_document",
                                )
                            )
                            batch_embs.append(single_emb["embedding"])
                            await asyncio.sleep(0.1)
                        except Exception:
                            batch_embs.append(None)

                # Fill the results back and update cache
                for idx, emb in zip(uncached_indices, batch_embs):
                    if emb:
                        existing_vecs[idx] = emb
                        _existing_embeddings_cache[existing_texts[idx]] = emb

            # Perform cosine similarity checks
            for existing_vec in existing_vecs:
                if not existing_vec:
                    continue
                try:
                    dot = sum(a * b for a, b in zip(proposal_vec, existing_vec))
                    norm_a = sum(a * a for a in proposal_vec) ** 0.5
                    norm_b = sum(b * b for b in existing_vec) ** 0.5
                    if norm_a > 0 and norm_b > 0:
                        sim = dot / (norm_a * norm_b)
                        if sim >= EVOLUTION_REDUNDANCY_THRESHOLD:
                            return True
                except Exception:
                    continue

            return False

        except Exception as e:
            log.debug(f"Redundancy check failed: {e}")
            return False  # Err on the side of not blocking

    async def _integrate_proposal(
        self,
        proposal: dict,
        source_id: str,
        source_title: str,
        source_url: str,
    ) -> Optional[str]:
        """Integrate a single checkpoint proposal into dimensions.json.

        Reuses the integration logic from framework.py.

        Returns:
            The final checkpoint ID if integrated, or None on failure.
        """
        try:
            from knowledge_base.checklist_generator import safe_read_json
            data = await safe_read_json()

            dim_id = proposal.get("dimension_id", "")
            target_dim = next(
                (d for d in data.get("dimensions", []) if d["id"] == dim_id), None
            )
            if not target_dim:
                log.warning(f"Dimension '{dim_id}' not found for proposal integration")
                return None

            # Generate final ID
            cp_count = len(target_dim.get("checkpoints", []))
            final_id = f"CP_{target_dim['id'][:2]}_{cp_count + 1:02d}"

            checkpoint_obj = {
                "id": final_id,
                "text": proposal.get("text", ""),
                "text_de": proposal.get("text_de", ""),
                "min_level": proposal.get("min_level", 3),
                "category": proposal.get("category", "General"),
                "sources": proposal.get("sources", [source_title]),
                "evidence_tags": [{
                    "source": source_title,
                    "reference": "Evolution Agent — Auto-Integration",
                    "url": source_url,
                }],
                "added_at": datetime.now(timezone.utc).isoformat(),
                "added_by": "evolution_agent",
            }

            target_dim["checkpoints"].append(checkpoint_obj)

            from knowledge_base.checklist_generator import safe_write_json
            await safe_write_json(data)

            # Log activity
            db = await get_db()
            try:
                activity_id = str(uuid.uuid4())[:8]
                await db.execute(
                    """INSERT INTO framework_activity
                       (id, action, source_id, checkpoint_id, dimension_id, details)
                       VALUES (?, ?, ?, ?, ?, ?)""",
                    (
                        activity_id,
                        "evolution_integrated",
                        source_id,
                        final_id,
                        dim_id,
                        json.dumps({
                            "text": proposal.get("text", "")[:80],
                            "source_title": source_title,
                            "rationale": proposal.get("rationale", ""),
                        }),
                    ),
                )
                await db.commit()
            finally:
                pass  # singleton connection, no close needed

            # Store the integrated checkpoint ID in the proposal for reference
            proposal["integrated_checkpoint_id"] = final_id
            return final_id

        except Exception as e:
            log.error(f"Failed to integrate proposal: {e}")
            return None
