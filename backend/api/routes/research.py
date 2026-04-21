"""
Research Agent API routes.
Triggers research, manages sources, and provides the research feed.
Enhanced with synchronous mode and proper error feedback.
"""

from __future__ import annotations

import json
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query

from database import get_db
from models.schemas import ResearchFeedResponse, ResearchSource, ResearchTriggerRequest

router = APIRouter()


@router.post("/trigger")
async def trigger_research(request: ResearchTriggerRequest):
    """
    Trigger a research search — runs synchronously to provide immediate feedback.
    Returns results directly instead of fire-and-forget.
    """
    try:
        from research.agent import search_and_store, ResearchError

        result = await search_and_store(
            query=request.query,
            dimensions=request.dimensions,
            max_results=request.max_results,
            language=request.language,
            pdf_only=request.pdf_only,
        )

        return {
            "status": "completed",
            "stored": result.get("stored", 0),
            "found": result.get("found", 0),
            "new": result.get("new", 0),
            "skipped_low_relevance": result.get("skipped_low_relevance", 0),
            "errors": result.get("errors", []),
        }
    except Exception as e:
        error_type = type(e).__name__
        error_msg = str(e)
        print(f"[Research API] {error_type}: {error_msg}")

        # Return error as structured response (not 500)
        return {
            "status": "error",
            "stored": 0,
            "found": 0,
            "new": 0,
            "errors": [error_msg],
        }


@router.get("/status")
async def check_api_status():
    """Check which API keys are configured for the Research Agent."""
    from research.agent import _check_api_keys
    keys = _check_api_keys()
    return {
        "tavily_configured": keys["tavily"],
        "gemini_configured": keys["gemini"],
        "ready": keys["tavily"],  # Tavily is required, Gemini is optional
    }


@router.get("/sources")
async def list_sources(
    category: Optional[str] = Query(None),
    dimension: Optional[str] = Query(None),
    unread_only: bool = Query(False),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    """List all research sources with optional filtering."""
    db = await get_db()
    try:
        query = "SELECT * FROM research_sources WHERE 1=1"
        params = []

        if category:
            query += " AND category = ?"
            params.append(category)

        if unread_only:
            query += " AND is_read = 0"

        if dimension:
            query += " AND relevant_dimensions LIKE ?"
            params.append(f"%{dimension}%")

        query += " ORDER BY discovered_at DESC LIMIT ? OFFSET ?"
        params.extend([limit, offset])

        cursor = await db.execute(query, params)
        rows = await cursor.fetchall()

        sources = []
        for row in rows:
            source = dict(row)
            source["relevant_dimensions"] = json.loads(
                source.get("relevant_dimensions", "[]")
            )
            source["is_read"] = bool(source.get("is_read", 0))
            sources.append(source)

        # Counts
        count_cursor = await db.execute(
            "SELECT COUNT(*) as total FROM research_sources"
        )
        total = (await count_cursor.fetchone())["total"]

        new_cursor = await db.execute(
            "SELECT COUNT(*) as new_count FROM research_sources WHERE is_read = 0"
        )
        new_count = (await new_cursor.fetchone())["new_count"]

        return {
            "sources": sources,
            "total_count": total,
            "new_count": new_count,
        }
    finally:
        await db.close()


@router.patch("/sources/{source_id}/read")
async def mark_source_read(source_id: str):
    """Mark a research source as read."""
    db = await get_db()
    try:
        cursor = await db.execute(
            "UPDATE research_sources SET is_read = 1 WHERE id = ?", (source_id,)
        )
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Source not found")
        await db.commit()
        return {"id": source_id, "is_read": True}
    finally:
        await db.close()


@router.delete("/sources/{source_id}")
async def delete_source(source_id: str):
    """Delete a research source."""
    db = await get_db()
    try:
        cursor = await db.execute(
            "DELETE FROM research_sources WHERE id = ?", (source_id,)
        )
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Source not found")
        await db.commit()
        return {"deleted": True, "id": source_id}
    finally:
        await db.close()
