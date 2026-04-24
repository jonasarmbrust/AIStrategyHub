"""
Research Agent API routes.
Triggers research, manages sources, and provides the research feed.
Enhanced with synchronous mode, proper error feedback, and Framework Builder integration.
"""

from __future__ import annotations

import json
import os
import uuid
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

        # Log activity for each stored source
        if result.get("stored", 0) > 0:
            await _log_activity(
                action="research_completed",
                details=json.dumps({
                    "query": request.query or "auto",
                    "stored": result.get("stored", 0),
                    "found": result.get("found", 0),
                }),
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
        pass  # singleton connection, no close needed


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
        pass  # singleton connection, no close needed


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
        pass  # singleton connection, no close needed


# ── One-Click Pipeline: Research Source → Framework Extraction ─────────────

@router.post("/sources/{source_id}/extract-for-framework")
async def extract_source_for_framework(source_id: str):
    """
    One-Click Pipeline: Takes a research source, fetches its full content,
    and extracts novel checkpoint proposals for the Framework Builder.
    Bridges the gap between Research Agent and Framework Builder.
    """
    # 1. Load the research source from DB
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT * FROM research_sources WHERE id = ?", (source_id,)
        )
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Research source not found")
        source = dict(row)
    finally:
        pass  # singleton connection, no close needed

    title = source.get("title", "Unknown")
    url = source.get("url", "")
    summary = source.get("summary", "")

    # 2. Fetch full content from URL
    content = ""
    if url:
        try:
            import httpx
            import re
            async with httpx.AsyncClient(follow_redirects=True, timeout=30) as client:
                resp = await client.get(url, headers={"User-Agent": "AI-Strategy-Hub/2.0"})
                resp.raise_for_status()
                raw = resp.text
                # Strip HTML tags
                content = re.sub(r'<[^>]+>', ' ', raw)
                content = re.sub(r'\s+', ' ', content).strip()
        except Exception as e:
            print(f"[Research→Framework] Could not fetch URL {url}: {e}")
            # Fall back to using the summary
            content = summary

    if not content or len(content) < 50:
        content = summary or title

    if len(content) < 50:
        raise HTTPException(
            status_code=400,
            detail="Not enough content available for this source. Try using Source Ingestion with the URL directly."
        )

    # 3. Extract novel checkpoints via Gemini
    gemini_key = os.getenv("GEMINI_API_KEY", "")
    if not gemini_key:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY not configured")

    try:
        import google.generativeai as genai
        genai.configure(api_key=gemini_key)

        # Load meta-model context for comparison
        from knowledge_base.checklist_generator import _load_model
        model = _load_model()
        framework_summary = []
        for dim in model.dimensions:
            cp_summaries = [f"- {cp.text}" for cp in dim.checkpoints]
            framework_summary.append(
                f"Dimension: {dim.id} ({dim.name})\nExisting Checkpoints:\n" + "\n".join(cp_summaries)
            )
        meta_model_context = "\n\n".join(framework_summary)

        dim_ids = ", ".join([d.id for d in model.dimensions])
        prompt = f"""You are a Master Enterprise Architecture and AI Strategy expert.
Your job is to read a newly discovered Industry Framework or Research Article, compare it to our existing Master Meta-Model, and extract NOVEL strategic checkpoints/guidelines that our Meta-Model is currently missing.

EXISTING META-MODEL:
{meta_model_context}

NEW RESEARCH SOURCE ({title}):
URL: {url}
Content:
{content[:12000]}

INSTRUCTIONS:
1. Identify up to 7 distinct, highly-valuable strategic rules, processes, or guidelines mentioned in the document that are NOT covered in our existing checkpoints.
2. Formulate them as formal Checkpoints in English and German.
3. Assign them to the most appropriate existing dimension_id: {dim_ids}.
4. Give a brief rationale for why this is missing and valuable.

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
}}
"""
        gemini_model = genai.GenerativeModel("gemini-2.5-flash")
        response = gemini_model.generate_content(
            prompt,
            generation_config=genai.GenerationConfig(
                response_mime_type="application/json",
                temperature=0.2,
            ),
        )

        data = json.loads(response.text)
        proposals = data.get("proposals", [])

        # Assign unique IDs and enrich with research source link
        for p in proposals:
            short_id = str(uuid.uuid4())[:6].upper()
            p["id"] = f"NEW_{short_id}"
            p["research_source_id"] = source_id
            p["research_source_url"] = url
            p["research_source_title"] = title

        # Auto-enrich proposals with related research sources as evidence_tags
        db = await get_db()
        try:
            for p in proposals:
                dim_id = p.get("dimension_id", "")
                cursor = await db.execute(
                    "SELECT title, url FROM research_sources "
                    "WHERE relevant_dimensions LIKE ? AND relevance_score >= 0.5 AND id != ?",
                    (f"%{dim_id}%", source_id),
                )
                matches = await cursor.fetchall()
                p["evidence_tags"] = [
                    {"source": title, "reference": "Research Agent — One-Click Extraction", "url": url}
                ]
                for m in list(matches)[:2]:
                    p["evidence_tags"].append({
                        "source": m["title"],
                        "reference": "Related Research Source",
                        "url": m["url"],
                    })
        finally:
            pass  # singleton connection, no close needed

        # Log the extraction activity
        await _log_activity(
            action="extracted_for_framework",
            source_id=source_id,
            details=json.dumps({
                "title": title,
                "proposals_count": len(proposals),
            }),
        )

        return {
            "source": {"id": source_id, "title": title, "url": url},
            "proposals": proposals,
        }

    except json.JSONDecodeError as e:
        raise HTTPException(status_code=500, detail=f"AI returned invalid JSON: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Extraction failed: {e}")


# ── Activity Feed ──────────────────────────────────────────────────────────

@router.get("/activity")
async def get_activity_feed(limit: int = Query(30, ge=1, le=100)):
    """Get the unified activity feed for Research ↔ Framework lifecycle."""
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT * FROM framework_activity ORDER BY created_at DESC LIMIT ?",
            (limit,),
        )
        rows = await cursor.fetchall()
        activities = []
        for row in rows:
            activity = dict(row)
            try:
                activity["details"] = json.loads(activity.get("details", "{}"))
            except (json.JSONDecodeError, TypeError):
                activity["details"] = {}
            activities.append(activity)
        return {"activities": activities}
    finally:
        pass  # singleton connection, no close needed


# ── Helper ─────────────────────────────────────────────────────────────────

async def _log_activity(
    action: str,
    source_id: str = None,
    checkpoint_id: str = None,
    dimension_id: str = None,
    details: str = "{}",
):
    """Log an activity to the framework_activity table."""
    activity_id = str(uuid.uuid4())[:8]
    db = await get_db()
    try:
        await db.execute(
            """INSERT INTO framework_activity (id, action, source_id, checkpoint_id, dimension_id, details)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (activity_id, action, source_id, checkpoint_id, dimension_id, details),
        )
        await db.commit()
    except Exception as e:
        print(f"[Activity] Failed to log: {e}")
    finally:
        pass  # singleton connection, no close needed
