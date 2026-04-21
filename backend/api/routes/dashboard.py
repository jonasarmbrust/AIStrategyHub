"""
Dashboard API routes.
Provides aggregated statistics and analysis history.
"""

from __future__ import annotations

import json

from fastapi import APIRouter

from database import get_db

router = APIRouter()


@router.get("/stats")
async def get_dashboard_stats():
    """Get aggregated dashboard statistics."""
    db = await get_db()
    try:
        # Total analyses
        cursor = await db.execute("SELECT COUNT(*) as cnt FROM analyses")
        total_analyses = (await cursor.fetchone())["cnt"]

        # Latest completed analysis
        cursor = await db.execute(
            """SELECT overall_score, overall_level, dimension_scores
               FROM analyses WHERE status = 'completed'
               ORDER BY completed_at DESC LIMIT 1"""
        )
        latest = await cursor.fetchone()

        # Latest manual assessment
        cursor = await db.execute(
            """SELECT overall_score, overall_level, dimension_scores
               FROM manual_assessments
               ORDER BY created_at DESC LIMIT 1"""
        )
        latest_manual = await cursor.fetchone()

        # Use whichever is latest (manual or document)
        latest_score = None
        latest_level = None
        dimension_averages = {}

        for source in [latest, latest_manual]:
            if source:
                latest_score = source["overall_score"]
                latest_level = source["overall_level"]
                dim_scores = json.loads(source["dimension_scores"])
                dimension_averages = {
                    ds["dimension_id"]: ds["score"] for ds in dim_scores
                }
                break

        # Research sources
        cursor = await db.execute(
            "SELECT COUNT(*) as cnt FROM research_sources"
        )
        total_sources = (await cursor.fetchone())["cnt"]

        cursor = await db.execute(
            "SELECT COUNT(*) as cnt FROM research_sources WHERE is_read = 0"
        )
        new_sources = (await cursor.fetchone())["cnt"]

        return {
            "total_analyses": total_analyses,
            "latest_score": latest_score,
            "latest_level": latest_level,
            "total_sources": total_sources,
            "new_sources": new_sources,
            "dimension_averages": dimension_averages,
        }
    finally:
        await db.close()


@router.get("/history")
async def get_history():
    """Get combined history of all assessments (manual + document)."""
    db = await get_db()
    try:
        history = []

        # Document analyses
        cursor = await db.execute(
            """SELECT id, document_name, overall_score, overall_level, created_at, 'document' as type
               FROM analyses WHERE status = 'completed'
               ORDER BY created_at DESC LIMIT 20"""
        )
        for row in await cursor.fetchall():
            history.append(dict(row))

        # Manual assessments
        cursor = await db.execute(
            """SELECT id, 'Manual Assessment' as document_name,
                      overall_score, overall_level, created_at, 'manual' as type
               FROM manual_assessments
               ORDER BY created_at DESC LIMIT 20"""
        )
        for row in await cursor.fetchall():
            history.append(dict(row))

        # Sort combined by date
        history.sort(key=lambda x: x.get("created_at", ""), reverse=True)

        return history[:20]
    finally:
        await db.close()
