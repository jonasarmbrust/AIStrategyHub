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

import json
import logging
import os
import uuid
from datetime import UTC, datetime

import google.generativeai as genai

from config import (
    EVOLUTION_AUTO_INTEGRATE,
    EVOLUTION_MIN_QUALITY,
    EVOLUTION_REDUNDANCY_THRESHOLD,
    GEMINI_API_KEY,
)
from database import get_db
from evolution.checkpoint_extractor import (
    check_proposal_redundancy,
    extract_checkpoints,
    integrate_proposal,
)
from evolution.redundancy_detector import RedundancyDetector
from evolution.research_scanner import assess_quality, fetch_content, get_framework_context, research_scan
from evolution.snapshot_manager import cleanup_old_snapshots, compact_old_run_logs, create_snapshot

log = logging.getLogger("evolution.agent")


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
            ts = datetime.now(UTC).strftime("%H:%M:%S")
            entry = f"[{ts}] {msg}"
            run_log.append(entry)
            log.info(f"[Run {run_id}] {msg}")

        try:
            # ── Create run record ─────────────────────────────────────
            async with get_db() as db:
                await db.execute(
                    """INSERT INTO evolution_runs (id, status, config)
                       VALUES (?, 'running', ?)""",
                    (run_id, json.dumps({
                        "min_quality": EVOLUTION_MIN_QUALITY,
                        "auto_integrate": EVOLUTION_AUTO_INTEGRATE,
                        "redundancy_threshold": EVOLUTION_REDUNDANCY_THRESHOLD,
                    })),
                )

            _log("Evolution cycle started")

            # ── 1. Create framework snapshot ──────────────────────────
            _log("Creating framework snapshot...")
            await create_snapshot(run_id)

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

            all_sources = await research_scan(tavily_key, run_log, stats)
            _log(f"Research scan complete: {stats['sources_scanned']} scanned, {len(all_sources)} new sources")

            # ── 4. Quality assessment and extraction ──────────────────
            _log("Starting quality assessment of new sources...")
            model_context = get_framework_context()

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
                    content = await fetch_content(url)
                    if not content or len(content) < 100:
                        content = source.get("summary", source.get("content", ""))
                    if not content or len(content) < 50:
                        _log(f"  Skipping '{title[:40]}' — insufficient content")
                        continue

                    # Quality assessment via Gemini
                    assessment = await assess_quality(title, url, content, model_context)
                    quality_score = assessment.get("quality_score", 0)
                    impact_score = assessment.get("impact_score", 0)
                    novelty_score = assessment.get("novelty_score", 0)

                    _log(f"  Assessed '{title[:40]}': quality={quality_score:.2f}, impact={impact_score:.2f}")

                    if quality_score < EVOLUTION_MIN_QUALITY:
                        _log(f"  Below quality threshold ({EVOLUTION_MIN_QUALITY}), skipping")
                        continue

                    # Extract novel checkpoints
                    proposals = await extract_checkpoints(title, url, content)
                    if not proposals:
                        _log("  No novel checkpoints found")
                        continue

                    stats["checkpoints_proposed"] += len(proposals)
                    _log(f"  Extracted {len(proposals)} checkpoint proposals")

                    # Store proposals and optionally auto-integrate
                    for proposal in proposals:
                        proposal_id = str(uuid.uuid4())[:8]
                        proposal_status = "pending"

                        # Check for redundancy against existing checkpoints
                        is_redundant = await check_proposal_redundancy(proposal)
                        if is_redundant:
                            _log(f"    Proposal '{proposal['text'][:40]}' is redundant, skipping")
                            proposal_status = "redundant"
                        elif EVOLUTION_AUTO_INTEGRATE:
                            # Auto-integrate
                            cp_id = await integrate_proposal(proposal, source_id, title, url)
                            if cp_id:
                                proposal_status = "integrated"
                                stats["checkpoints_integrated"] += 1
                                _log(f"    Integrated: {cp_id} → {proposal.get('dimension_id', '?')}")

                        # Store proposal in DB
                        async with get_db() as db:
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

            # ── 7. Cleanup old data ───────────────────────────────────
            _log("Running storage cleanup...")
            await cleanup_old_snapshots(keep_count=20)
            await compact_old_run_logs(keep_full=5)

            async with get_db() as db:
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
                        datetime.now(UTC).isoformat(),
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

            return {"run_id": run_id, "status": "completed", **stats}

        except Exception as e:
            log.error(f"Evolution cycle failed: {e}")
            _log(f"FATAL ERROR: {e}")

            # Update run with error status
            try:
                async with get_db() as db:
                    await db.execute(
                        """UPDATE evolution_runs
                           SET status = 'failed',
                               completed_at = ?,
                               error = ?,
                               log = ?
                           WHERE id = ?""",
                        (
                            datetime.now(UTC).isoformat(),
                            str(e),
                            json.dumps(run_log),
                            run_id,
                        ),
                    )
            except Exception:
                log.error("Failed to update run status after error")

            return {"run_id": run_id, "status": "failed", "error": str(e), **stats}

        finally:
            self._running = False
