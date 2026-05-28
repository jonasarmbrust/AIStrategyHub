"""
Evolution Agent API routes.
Provides endpoints for triggering evolution cycles, managing proposals,
scanning redundancies, viewing snapshots, and monitoring scheduler status.
"""

from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from database import get_db
from config import (
    DIMENSIONS_PATH,
    EVOLUTION_ENABLED,
    EVOLUTION_SCHEDULE,
    EVOLUTION_DAY,
    EVOLUTION_HOUR,
    EVOLUTION_AUTO_INTEGRATE,
    EVOLUTION_MIN_QUALITY,
    EVOLUTION_REDUNDANCY_THRESHOLD,
)

router = APIRouter()
log = logging.getLogger("api.evolution")


# ── Request/Response Models ───────────────────────────────────────────────

class BulkApproveRequest(BaseModel):
    """Request body for bulk proposal approval."""
    proposal_ids: list[str]


class MergeRequest(BaseModel):
    """Request body for merging redundant checkpoints."""
    keep_id: str
    remove_id: str


class EvolutionConfigUpdate(BaseModel):
    """Runtime-only configuration update."""
    evolution_enabled: Optional[bool] = None
    evolution_schedule: Optional[str] = None
    evolution_day: Optional[str] = None
    evolution_hour: Optional[int] = None
    auto_integrate: Optional[bool] = None
    min_quality: Optional[float] = None
    redundancy_threshold: Optional[float] = None


# ── Trigger ───────────────────────────────────────────────────────────────

@router.post("/trigger")
async def trigger_evolution():
    """Manually trigger an evolution cycle.

    Returns the run_id immediately; the cycle runs in the background.
    """
    from evolution.agent import EvolutionAgent
    import asyncio

    agent = EvolutionAgent()

    # Run in background so the HTTP request returns immediately
    loop = asyncio.get_event_loop()
    task = loop.create_task(agent.run_evolution_cycle())

    # Wait briefly to capture the run_id from the DB
    await asyncio.sleep(0.5)

    # Find the most recent running evolution run
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT id, status FROM evolution_runs ORDER BY started_at DESC LIMIT 1"
        )
        row = await cursor.fetchone()
        if row:
            return {
                "status": "triggered",
                "run_id": row["id"],
                "message": "Evolution cycle started in background",
            }
    finally:
        pass  # singleton connection, no close needed

    return {"status": "triggered", "message": "Evolution cycle started"}


# ── Runs ──────────────────────────────────────────────────────────────────

@router.get("/runs")
async def list_runs(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    """List all evolution runs with stats."""
    db = await get_db()
    try:
        cursor = await db.execute(
            """SELECT id, started_at, completed_at, status,
                      sources_scanned, sources_qualified,
                      checkpoints_proposed, checkpoints_integrated,
                      redundancies_found, redundancies_resolved,
                      config, error
               FROM evolution_runs
               ORDER BY started_at DESC
               LIMIT ? OFFSET ?""",
            (limit, offset),
        )
        rows = await cursor.fetchall()

        runs = []
        for row in rows:
            run = dict(row)
            try:
                run["config"] = json.loads(run.get("config", "{}"))
            except (json.JSONDecodeError, TypeError):
                run["config"] = {}
            runs.append(run)

        count_cursor = await db.execute("SELECT COUNT(*) as total FROM evolution_runs")
        total = (await count_cursor.fetchone())["total"]

        return {"runs": runs, "total": total}
    finally:
        pass  # singleton connection, no close needed


@router.get("/runs/{run_id}")
async def get_run_detail(run_id: str):
    """Get detailed log of a specific run."""
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT * FROM evolution_runs WHERE id = ?", (run_id,)
        )
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Evolution run not found")

        run = dict(row)
        try:
            run["config"] = json.loads(run.get("config", "{}"))
        except (json.JSONDecodeError, TypeError):
            run["config"] = {}
        try:
            run["log"] = json.loads(run.get("log", "[]"))
        except (json.JSONDecodeError, TypeError):
            run["log"] = []

        # Also fetch proposals for this run
        proposal_cursor = await db.execute(
            """SELECT id, source_title, dimension_id, quality_score,
                      impact_score, novelty_score, status, proposal_type
               FROM evolution_proposals
               WHERE run_id = ?
               ORDER BY quality_score DESC""",
            (run_id,),
        )
        proposals = [dict(r) for r in await proposal_cursor.fetchall()]
        run["proposals"] = proposals

        return run
    finally:
        pass  # singleton connection, no close needed


# ── Proposals ─────────────────────────────────────────────────────────────

@router.get("/proposals")
async def list_proposals(
    status: str = Query("all"),
    run_id: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
):
    """List evolution proposals with optional filtering."""
    db = await get_db()
    try:
        query = "SELECT * FROM evolution_proposals WHERE 1=1"
        params: list = []

        if status != "all":
            query += " AND status = ?"
            params.append(status)
        if run_id:
            query += " AND run_id = ?"
            params.append(run_id)

        query += " ORDER BY created_at DESC LIMIT ?"
        params.append(limit)

        cursor = await db.execute(query, params)
        rows = await cursor.fetchall()

        proposals = []
        for row in rows:
            p = dict(row)
            try:
                p["checkpoint_data"] = json.loads(p.get("checkpoint_data", "{}"))
            except (json.JSONDecodeError, TypeError):
                p["checkpoint_data"] = {}
            proposals.append(p)

        return {"proposals": proposals, "count": len(proposals)}
    finally:
        pass  # singleton connection, no close needed


@router.post("/proposals/{proposal_id}/approve")
async def approve_proposal(proposal_id: str):
    """Manually approve and integrate a pending proposal."""
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT * FROM evolution_proposals WHERE id = ?", (proposal_id,)
        )
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Proposal not found")

        proposal = dict(row)
        if proposal["status"] != "pending":
            raise HTTPException(
                status_code=400,
                detail=f"Proposal is already '{proposal['status']}', cannot approve",
            )

        # Integrate the checkpoint
        checkpoint_data = json.loads(proposal.get("checkpoint_data", "{}"))
        from evolution.agent import EvolutionAgent
        agent = EvolutionAgent()
        cp_id = await agent._integrate_proposal(
            proposal=checkpoint_data,
            source_id=proposal.get("source_id", ""),
            source_title=proposal.get("source_title", ""),
            source_url=proposal.get("source_url", ""),
        )

        if cp_id:
            await db.execute(
                """UPDATE evolution_proposals
                   SET status = 'integrated',
                       reviewed_at = ?,
                       integrated_checkpoint_id = ?
                   WHERE id = ?""",
                (datetime.now(timezone.utc).isoformat(), cp_id, proposal_id),
            )
            await db.commit()
            return {"status": "approved", "checkpoint_id": cp_id, "proposal_id": proposal_id}
        else:
            raise HTTPException(status_code=500, detail="Integration failed")
    finally:
        pass  # singleton connection, no close needed


@router.post("/proposals/{proposal_id}/reject")
async def reject_proposal(proposal_id: str):
    """Reject a proposal."""
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT status FROM evolution_proposals WHERE id = ?", (proposal_id,)
        )
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Proposal not found")
        if row["status"] != "pending":
            raise HTTPException(
                status_code=400,
                detail=f"Proposal is already '{row['status']}', cannot reject",
            )

        await db.execute(
            """UPDATE evolution_proposals
               SET status = 'rejected', reviewed_at = ?
               WHERE id = ?""",
            (datetime.now(timezone.utc).isoformat(), proposal_id),
        )
        await db.commit()
        return {"status": "rejected", "proposal_id": proposal_id}
    finally:
        pass  # singleton connection, no close needed


@router.post("/proposals/bulk-approve")
async def bulk_approve(request: BulkApproveRequest):
    """Approve multiple proposals at once."""
    results = []
    for pid in request.proposal_ids:
        try:
            result = await approve_proposal(pid)
            results.append({"proposal_id": pid, "status": "approved", **result})
        except HTTPException as e:
            results.append({"proposal_id": pid, "status": "error", "detail": e.detail})
        except Exception as e:
            results.append({"proposal_id": pid, "status": "error", "detail": str(e)})

    approved_count = sum(1 for r in results if r["status"] == "approved")
    return {"approved": approved_count, "total": len(request.proposal_ids), "results": results}


# ── Redundancies ──────────────────────────────────────────────────────────

@router.get("/redundancies")
async def scan_redundancies():
    """Scan for redundant checkpoints across the entire framework."""
    from evolution.redundancy_detector import RedundancyDetector

    detector = RedundancyDetector()
    try:
        pairs = await detector.find_redundancies()
        return {
            "redundancies": pairs,
            "count": len(pairs),
            "threshold": detector.threshold,
        }
    except Exception as e:
        log.error(f"Redundancy scan failed: {e}")
        raise HTTPException(status_code=500, detail=f"Redundancy scan failed: {e}")


@router.post("/redundancies/merge")
async def merge_redundancies(request: MergeRequest):
    """Merge two redundant checkpoints."""
    from evolution.redundancy_detector import RedundancyDetector

    detector = RedundancyDetector()

    # First validate via LLM
    try:
        from knowledge_base.checklist_generator import safe_read_json
        data = await safe_read_json()

        cp1_text = ""
        cp2_text = ""
        for dim in data.get("dimensions", []):
            for cp in dim.get("checkpoints", []):
                if cp["id"] == request.keep_id:
                    cp1_text = cp["text"]
                if cp["id"] == request.remove_id:
                    cp2_text = cp["text"]

        if not cp1_text or not cp2_text:
            raise HTTPException(status_code=404, detail="One or both checkpoints not found")

        validation = await detector.validate_redundancy(cp1_text, cp2_text)
        result = await detector.execute_merge(
            keep_id=request.keep_id,
            remove_id=request.remove_id,
            merged_data=validation,
        )

        if result.get("success"):
            return {
                "status": "merged",
                "kept": request.keep_id,
                "removed": request.remove_id,
                "validation": validation,
            }
        else:
            raise HTTPException(status_code=500, detail=result.get("error", "Merge failed"))

    except HTTPException:
        raise
    except Exception as e:
        log.error(f"Merge failed: {e}")
        raise HTTPException(status_code=500, detail=f"Merge failed: {e}")


# ── Configuration ─────────────────────────────────────────────────────────

@router.get("/config")
async def get_config():
    """Get current evolution configuration."""
    return {
        "evolution_enabled": EVOLUTION_ENABLED,
        "evolution_schedule": EVOLUTION_SCHEDULE,
        "evolution_day": EVOLUTION_DAY,
        "evolution_hour": EVOLUTION_HOUR,
        "auto_integrate": EVOLUTION_AUTO_INTEGRATE,
        "min_quality": EVOLUTION_MIN_QUALITY,
        "redundancy_threshold": EVOLUTION_REDUNDANCY_THRESHOLD,
    }


@router.put("/config")
async def update_config(config: EvolutionConfigUpdate):
    """Update evolution configuration (runtime only, not persisted to .env)."""
    import config as cfg

    updated = {}
    if config.evolution_enabled is not None:
        cfg.EVOLUTION_ENABLED = config.evolution_enabled
        updated["evolution_enabled"] = config.evolution_enabled
    if config.evolution_schedule is not None:
        cfg.EVOLUTION_SCHEDULE = config.evolution_schedule
        updated["evolution_schedule"] = config.evolution_schedule
    if config.evolution_day is not None:
        cfg.EVOLUTION_DAY = config.evolution_day
        updated["evolution_day"] = config.evolution_day
    if config.evolution_hour is not None:
        cfg.EVOLUTION_HOUR = config.evolution_hour
        updated["evolution_hour"] = config.evolution_hour
    if config.auto_integrate is not None:
        cfg.EVOLUTION_AUTO_INTEGRATE = config.auto_integrate
        updated["auto_integrate"] = config.auto_integrate
    if config.min_quality is not None:
        cfg.EVOLUTION_MIN_QUALITY = config.min_quality
        updated["min_quality"] = config.min_quality
    if config.redundancy_threshold is not None:
        cfg.EVOLUTION_REDUNDANCY_THRESHOLD = config.redundancy_threshold
        updated["redundancy_threshold"] = config.redundancy_threshold

    return {"status": "updated", "changes": updated}


# ── Snapshots ─────────────────────────────────────────────────────────────

@router.get("/snapshots")
async def list_snapshots(limit: int = Query(10, ge=1, le=50)):
    """List framework snapshots."""
    db = await get_db()
    try:
        cursor = await db.execute(
            """SELECT id, run_id, checkpoint_count, version_tag, created_at
               FROM framework_snapshots
               ORDER BY created_at DESC
               LIMIT ?""",
            (limit,),
        )
        rows = await cursor.fetchall()
        snapshots = [dict(r) for r in rows]
        return {"snapshots": snapshots, "count": len(snapshots)}
    finally:
        pass  # singleton connection, no close needed


@router.post("/snapshots/{snapshot_id}/rollback")
async def rollback_to_snapshot(snapshot_id: str):
    """Rollback framework to a specific snapshot."""
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT * FROM framework_snapshots WHERE id = ?", (snapshot_id,)
        )
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Snapshot not found")

        snapshot = dict(row)
        snapshot_data = json.loads(snapshot["snapshot_data"])

        # Write snapshot data back to dimensions.json
        from knowledge_base.checklist_generator import safe_write_json
        await safe_write_json(snapshot_data)

        # Log the rollback activity
        activity_id = str(uuid.uuid4())[:8]
        await db.execute(
            """INSERT INTO framework_activity (id, action, details)
               VALUES (?, ?, ?)""",
            (
                activity_id,
                "framework_rollback",
                json.dumps({
                    "snapshot_id": snapshot_id,
                    "version_tag": snapshot.get("version_tag", ""),
                    "checkpoint_count": snapshot.get("checkpoint_count", 0),
                }),
            ),
        )
        await db.commit()

        return {
            "status": "rolled_back",
            "snapshot_id": snapshot_id,
            "version_tag": snapshot.get("version_tag", ""),
            "checkpoint_count": snapshot.get("checkpoint_count", 0),
        }
    finally:
        pass  # singleton connection, no close needed


# ── Statistics ────────────────────────────────────────────────────────────

@router.get("/stats")
async def get_evolution_stats():
    """Aggregated evolution statistics."""
    db = await get_db()
    try:
        # Total runs
        cursor = await db.execute("SELECT COUNT(*) as total FROM evolution_runs")
        total_runs = (await cursor.fetchone())["total"]

        # Completed runs
        cursor = await db.execute(
            "SELECT COUNT(*) as total FROM evolution_runs WHERE status = 'completed'"
        )
        completed_runs = (await cursor.fetchone())["total"]

        # Total integrated checkpoints
        cursor = await db.execute(
            "SELECT COALESCE(SUM(checkpoints_integrated), 0) as total FROM evolution_runs"
        )
        total_integrated = (await cursor.fetchone())["total"]

        # Total proposals
        cursor = await db.execute("SELECT COUNT(*) as total FROM evolution_proposals")
        total_proposals = (await cursor.fetchone())["total"]

        # Pending proposals
        cursor = await db.execute(
            "SELECT COUNT(*) as total FROM evolution_proposals WHERE status = 'pending'"
        )
        pending_proposals = (await cursor.fetchone())["total"]

        # Average quality score
        cursor = await db.execute(
            "SELECT AVG(quality_score) as avg_quality FROM evolution_proposals WHERE quality_score > 0"
        )
        row = await cursor.fetchone()
        avg_quality = round(row["avg_quality"], 3) if row["avg_quality"] else 0

        # Total redundancies resolved
        cursor = await db.execute(
            "SELECT COALESCE(SUM(redundancies_resolved), 0) as total FROM evolution_runs"
        )
        total_redundancies_resolved = (await cursor.fetchone())["total"]

        # Proposals by dimension
        cursor = await db.execute(
            """SELECT dimension_id, COUNT(*) as count
               FROM evolution_proposals
               GROUP BY dimension_id
               ORDER BY count DESC"""
        )
        dimension_distribution = {row["dimension_id"]: row["count"] for row in await cursor.fetchall()}

        # Proposals by status
        cursor = await db.execute(
            """SELECT status, COUNT(*) as count
               FROM evolution_proposals
               GROUP BY status"""
        )
        status_distribution = {row["status"]: row["count"] for row in await cursor.fetchall()}

        # Recent runs (last 5)
        cursor = await db.execute(
            """SELECT id, started_at, status, checkpoints_integrated, sources_scanned
               FROM evolution_runs
               ORDER BY started_at DESC
               LIMIT 5"""
        )
        recent_runs = [dict(r) for r in await cursor.fetchall()]

        return {
            "total_runs": total_runs,
            "completed_runs": completed_runs,
            "total_integrated": total_integrated,
            "total_proposals": total_proposals,
            "pending_proposals": pending_proposals,
            "avg_quality_score": avg_quality,
            "total_redundancies_resolved": total_redundancies_resolved,
            "dimension_distribution": dimension_distribution,
            "status_distribution": status_distribution,
            "recent_runs": recent_runs,
        }
    finally:
        pass  # singleton connection, no close needed


# ── Scheduler Status ──────────────────────────────────────────────────────

@router.get("/status")
async def get_scheduler_status():
    """Get scheduler status: next run time, is_running, etc."""
    from evolution.scheduler import scheduler

    jobs = scheduler.get_jobs() if scheduler.running else []
    job_info = []
    for job in jobs:
        job_info.append({
            "id": job.id,
            "name": job.name,
            "next_run_time": str(job.next_run_time) if job.next_run_time else None,
            "trigger": str(job.trigger),
        })

    # Check if a cycle is currently running
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT id FROM evolution_runs WHERE status = 'running' LIMIT 1"
        )
        running_row = await cursor.fetchone()
        is_cycle_running = running_row is not None
        running_run_id = running_row["id"] if running_row else None
    finally:
        pass  # singleton connection, no close needed

    return {
        "scheduler_running": scheduler.running if hasattr(scheduler, "running") else False,
        "evolution_enabled": EVOLUTION_ENABLED,
        "schedule": EVOLUTION_SCHEDULE,
        "schedule_day": EVOLUTION_DAY,
        "schedule_hour": EVOLUTION_HOUR,
        "jobs": job_info,
        "cycle_running": is_cycle_running,
        "running_run_id": running_run_id,
    }


# ── Playbook Generator ────────────────────────────────────────────────────

_PHASE_META = {
    1: {
        "name": "Foundation",
        "name_de": "Fundament",
        "level_name": "Exploring",
        "level_name_de": "Erkunden",
        "description": (
            "Establish baseline awareness and initial governance structures. "
            "Focus on understanding your current AI landscape, documenting "
            "existing practices, and building foundational knowledge across "
            "your organization."
        ),
        "description_de": (
            "Schaffen Sie ein grundlegendes Bewusstsein und erste "
            "Governance-Strukturen. Verstehen Sie Ihre aktuelle AI-Landschaft, "
            "dokumentieren Sie bestehende Praktiken und bauen Sie grundlegendes "
            "Wissen in der Organisation auf."
        ),
        "estimated_duration": "2-4 weeks",
        "key_focus": "Awareness & Documentation",
        "key_focus_de": "Bewusstsein & Dokumentation",
    },
    2: {
        "name": "Experimentation",
        "name_de": "Experimentieren",
        "level_name": "Experimenting",
        "level_name_de": "Experimentieren",
        "description": (
            "Move from awareness to action. Launch pilot AI projects, "
            "establish data quality baselines, and begin formalizing your "
            "AI strategy. This is where theory meets practice."
        ),
        "description_de": (
            "Vom Bewusstsein zum Handeln. Starten Sie Pilot-AI-Projekte, "
            "etablieren Sie Datenqualitäts-Baselines und beginnen Sie Ihre "
            "AI-Strategie zu formalisieren. Hier trifft Theorie auf Praxis."
        ),
        "estimated_duration": "1-3 months",
        "key_focus": "Pilots & Strategy Formalization",
        "key_focus_de": "Pilotprojekte & Strategieformalisierung",
    },
    3: {
        "name": "Operationalization",
        "name_de": "Operationalisierung",
        "level_name": "Operationalizing",
        "level_name_de": "Operationalisieren",
        "description": (
            "Scale what works. Implement MLOps pipelines, establish "
            "cross-functional AI governance boards, and embed AI into core "
            "business processes. This phase transforms experiments into "
            "production systems."
        ),
        "description_de": (
            "Skalieren Sie was funktioniert. Implementieren Sie "
            "MLOps-Pipelines, etablieren Sie funktionsübergreifende "
            "AI-Governance-Boards und integrieren Sie AI in "
            "Kerngeschäftsprozesse."
        ),
        "estimated_duration": "3-6 months",
        "key_focus": "Production & Process Integration",
        "key_focus_de": "Produktion & Prozessintegration",
    },
    4: {
        "name": "Scaling",
        "name_de": "Skalierung",
        "level_name": "Scaling",
        "level_name_de": "Skalieren",
        "description": (
            "Achieve enterprise-wide AI adoption. Establish centers of "
            "excellence, implement advanced monitoring and feedback loops, "
            "and create a self-sustaining AI culture."
        ),
        "description_de": (
            "Unternehmensweite AI-Adoption erreichen. Etablieren Sie "
            "Centers of Excellence, implementieren Sie fortgeschrittenes "
            "Monitoring und Feedback-Loops."
        ),
        "estimated_duration": "6-12 months",
        "key_focus": "Enterprise Scale & Culture",
        "key_focus_de": "Unternehmensskalierung & Kultur",
    },
    5: {
        "name": "Transformation",
        "name_de": "Transformation",
        "level_name": "Transforming",
        "level_name_de": "Transformieren",
        "description": (
            "Become an AI-first organization. Drive industry innovation, "
            "implement continuous model improvement, and achieve measurable "
            "competitive advantage through AI across all business functions."
        ),
        "description_de": (
            "Werden Sie eine AI-First-Organisation. Treiben Sie "
            "Brancheninnovation, implementieren Sie kontinuierliche "
            "Modellverbesserung und erreichen Sie messbaren "
            "Wettbewerbsvorteil."
        ),
        "estimated_duration": "12+ months",
        "key_focus": "Innovation & Competitive Advantage",
        "key_focus_de": "Innovation & Wettbewerbsvorteil",
    },
}

_LOW_EFFORT_CATEGORIES = {"documentation", "planning", "assessment"}
_MEDIUM_EFFORT_CATEGORIES = {"training", "policy", "process"}
_HIGH_EFFORT_CATEGORIES = {
    "implementation", "infrastructure", "integration", "technology",
}


def _priority_for_weight(weight: float) -> str:
    """Derive checkpoint priority label from its dimension weight."""
    if weight >= 0.20:
        return "critical"
    if weight >= 0.15:
        return "high"
    if weight >= 0.10:
        return "medium"
    return "standard"


def _effort_for_category(category: str) -> str:
    """Estimate effort level from the checkpoint category name."""
    cat_lower = category.lower()
    if cat_lower in _LOW_EFFORT_CATEGORIES:
        return "low"
    if cat_lower in _MEDIUM_EFFORT_CATEGORIES:
        return "medium"
    if cat_lower in _HIGH_EFFORT_CATEGORIES:
        return "high"
    return "medium"


@router.get("/playbook")
async def generate_playbook():
    """Generate a step-by-step AI Strategy Playbook from the evolved framework.

    Groups all checkpoints by maturity level (Phase 1-5), orders them by
    dimension priority and category, and returns a structured implementation
    guide.  Starting from zero, this gives a complete roadmap for building
    AI maturity.
    """
    from knowledge_base.checklist_generator import _load_model

    try:
        model = _load_model()
    except Exception as e:
        log.error(f"Failed to load maturity model for playbook: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Could not load framework data: {e}",
        )

    # Build a lookup: dimension_id -> Dimension for quick access
    dim_lookup: dict[str, object] = {d.id: d for d in model.dimensions}

    # ── 1. Collect every checkpoint with its parent dimension metadata ─────
    all_entries: list[dict] = []
    for dim in model.dimensions:
        for cp in dim.checkpoints:
            all_entries.append({
                "checkpoint": cp,
                "dimension": dim,
            })

    # ── 2. Bucket by min_level (phase) ─────────────────────────────────────
    phase_buckets: dict[int, list[dict]] = {lvl: [] for lvl in range(1, 6)}
    for entry in all_entries:
        lvl = entry["checkpoint"].min_level
        # Clamp to 1-5 just in case
        lvl = max(1, min(5, lvl))
        phase_buckets[lvl].append(entry)

    # ── 3. Sort within each phase: weight DESC, then category ASC ──────────
    for lvl in phase_buckets:
        phase_buckets[lvl].sort(
            key=lambda e: (-e["dimension"].weight, e["checkpoint"].category),
        )

    # ── 4. Build phase objects ─────────────────────────────────────────────
    phases: list[dict] = []
    grand_total = 0

    for lvl in range(1, 6):
        entries = phase_buckets[lvl]
        meta = _PHASE_META[lvl]

        # Per-dimension breakdown
        dim_counts: dict[str, int] = {}
        for entry in entries:
            did = entry["dimension"].id
            dim_counts[did] = dim_counts.get(did, 0) + 1

        dimension_breakdown: dict[str, dict] = {}
        for did, count in dim_counts.items():
            dim = dim_lookup[did]
            dimension_breakdown[did] = {
                "count": count,
                "icon": dim.icon,
                "name": dim.name,
            }

        # Build ordered steps
        steps: list[dict] = []
        for order_idx, entry in enumerate(entries, start=1):
            cp = entry["checkpoint"]
            dim = entry["dimension"]
            evidence_tags = [
                {"source": et.source, "reference": et.reference, "url": et.url}
                for et in cp.evidence_tags
            ]
            steps.append({
                "order": order_idx,
                "checkpoint_id": cp.id,
                "text": cp.text,
                "text_de": cp.text_de,
                "dimension_id": dim.id,
                "dimension_name": dim.name,
                "dimension_icon": dim.icon,
                "category": cp.category,
                "priority": _priority_for_weight(dim.weight),
                "effort": _effort_for_category(cp.category),
                "sources": cp.sources,
                "evidence_tags": evidence_tags,
                "dependencies": [],
                "tip": "",
            })

        total_in_phase = len(steps)
        grand_total += total_in_phase

        phases.append({
            "phase": lvl,
            **meta,
            "total_checkpoints": total_in_phase,
            "dimension_breakdown": dimension_breakdown,
            "steps": steps,
        })

    # ── 5. Dimension summary across all phases ─────────────────────────────
    dimension_summary: list[dict] = []
    for dim in model.dimensions:
        per_phase = [
            sum(
                1
                for e in phase_buckets[lvl]
                if e["dimension"].id == dim.id
            )
            for lvl in range(1, 6)
        ]
        dimension_summary.append({
            "id": dim.id,
            "name": dim.name,
            "icon": dim.icon,
            "weight": dim.weight,
            "total_checkpoints": sum(per_phase),
            "per_phase": per_phase,
        })

    return {
        "model_version": model.version,
        "total_checkpoints": grand_total,
        "phases": phases,
        "dimension_summary": dimension_summary,
    }
