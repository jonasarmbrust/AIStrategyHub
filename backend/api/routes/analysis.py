"""
Document Analysis API routes.
Handles document upload, AI-based analysis, and report retrieval.
"""

from __future__ import annotations

import json
import uuid
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, UploadFile

from database import get_db
from models.schemas import AnalysisResult, AnalysisStatus

router = APIRouter()

UPLOAD_DIR = Path(__file__).parent.parent.parent.parent / "data" / "uploads"


@router.post("/upload")
async def upload_document(file: UploadFile = File(...)):
    """Upload a document for analysis."""
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

    # Validate file type
    allowed_types = {".pdf", ".docx", ".txt", ".md"}
    suffix = Path(file.filename).suffix.lower()
    if suffix not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: {suffix}. Allowed: {', '.join(allowed_types)}",
        )

    # Save file
    doc_id = str(uuid.uuid4())[:8]
    file_path = UPLOAD_DIR / f"{doc_id}{suffix}"
    content = await file.read()
    file_path.write_bytes(content)

    # Store metadata
    db = await get_db()
    try:
        await db.execute(
            """INSERT INTO analyses (id, document_name, file_type, status)
               VALUES (?, ?, ?, ?)""",
            (doc_id, file.filename, suffix, AnalysisStatus.PENDING.value),
        )
        await db.commit()
    finally:
        await db.close()

    return {
        "id": doc_id,
        "filename": file.filename,
        "file_type": suffix,
        "file_size": len(content),
        "status": AnalysisStatus.PENDING.value,
    }


@router.post("/import-url")
async def import_url(url: str = Form(...), title: str = Form("Imported Source")):
    """Import an article or URL as a document for analysis."""
    import httpx
    import re

    # Fetch content
    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=30) as client:
            resp = await client.get(url, headers={"User-Agent": "AI-Strategy-Hub/2.0"})
            resp.raise_for_status()
            raw_content = resp.text
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not fetch URL: {e}")

    # Strip HTML tags
    text_content = re.sub(r'<[^>]+>', ' ', raw_content)
    text_content = re.sub(r'\s+', ' ', text_content).strip()

    if len(text_content) < 100:
        raise HTTPException(status_code=400, detail="URL content too short or empty")

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    doc_id = str(uuid.uuid4())[:8]
    suffix = ".txt"
    file_path = UPLOAD_DIR / f"{doc_id}{suffix}"
    file_path.write_text(text_content, encoding='utf-8')

    db = await get_db()
    try:
        await db.execute(
            """INSERT INTO analyses (id, document_name, file_type, status)
               VALUES (?, ?, ?, ?)""",
            (doc_id, title, suffix, AnalysisStatus.PENDING.value),
        )
        await db.commit()
    finally:
        await db.close()

    return {
        "id": doc_id,
        "filename": title,
        "file_type": suffix,
        "file_size": len(text_content),
        "status": AnalysisStatus.PENDING.value,
    }



@router.post("/{analysis_id}/evaluate")
async def start_evaluation(analysis_id: str, background_tasks: BackgroundTasks):
    """Start AI-based document evaluation against the maturity checklist."""
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT * FROM analyses WHERE id = ?", (analysis_id,)
        )
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Analysis not found")

        if row["status"] == AnalysisStatus.PROCESSING.value:
            raise HTTPException(status_code=409, detail="Analysis already in progress")

        await db.execute(
            "UPDATE analyses SET status = ? WHERE id = ?",
            (AnalysisStatus.PROCESSING.value, analysis_id),
        )
        await db.commit()
    finally:
        await db.close()

    # Run analysis in background
    background_tasks.add_task(_run_analysis, analysis_id)

    return {"id": analysis_id, "status": AnalysisStatus.PROCESSING.value}


async def _run_analysis(analysis_id: str):
    """Background task: run the RAG-based document analysis."""
    try:
        from analyzer.evaluator import evaluate_document

        await evaluate_document(analysis_id)
    except Exception as e:
        db = await get_db()
        try:
            await db.execute(
                "UPDATE analyses SET status = ? WHERE id = ?",
                (AnalysisStatus.FAILED.value, analysis_id),
            )
            await db.commit()
        finally:
            await db.close()
        print(f"Analysis {analysis_id} failed: {e}")


@router.get("/{analysis_id}/status")
async def get_analysis_status(analysis_id: str):
    """Get the current status of an analysis."""
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT id, document_name, status, overall_score, overall_level, created_at, completed_at FROM analyses WHERE id = ?",
            (analysis_id,),
        )
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Analysis not found")

        return dict(row)
    finally:
        await db.close()


@router.get("/{analysis_id}/report")
async def get_analysis_report(analysis_id: str):
    """Get the full analysis report with evaluations and recommendations."""
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT * FROM analyses WHERE id = ?", (analysis_id,)
        )
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Analysis not found")

        if row["status"] != AnalysisStatus.COMPLETED.value:
            raise HTTPException(
                status_code=400,
                detail=f"Analysis is not completed. Current status: {row['status']}",
            )

        return {
            "id": row["id"],
            "document_name": row["document_name"],
            "overall_score": row["overall_score"],
            "overall_level": row["overall_level"],
            "dimension_scores": json.loads(row["dimension_scores"]),
            "strengths": json.loads(row["strengths"]),
            "gaps": json.loads(row["gaps"]),
            "recommendations": json.loads(row["recommendations"]),
            "evaluations": json.loads(row["evaluations"]),
            "created_at": row["created_at"],
            "completed_at": row["completed_at"],
        }
    finally:
        await db.close()


@router.get("")
async def list_analyses():
    """List all analyses with basic info."""
    db = await get_db()
    try:
        cursor = await db.execute(
            """SELECT id, document_name, file_type, overall_score, overall_level, status, created_at
               FROM analyses ORDER BY created_at DESC"""
        )
        rows = await cursor.fetchall()
        return [dict(row) for row in rows]
    finally:
        await db.close()

from pydantic import BaseModel
import os

class DeepDiveRequest(BaseModel):
    text: str
    context: str = "Framework Explorer Checkpoint"

DEEP_DIVE_PROMPT = """You are an Enterprise AI Strategy expert. The user wants a detailed deep-dive on the following AI strategy point (which is currently just a 1-sentence summary):

**Strategy Point:** "{text}"
**Context:** {context}

Please provide a structured, detailed markdown response providing actionable depth. Include:
1. **Background & Rationale:** Why is this crucial for AI maturity? What happens if it's ignored?
2. **Implementation Guide:** High-level steps or best practices to actually implement this.
3. **Common Pitfalls:** Anti-patterns or mistakes organizations make regarding this point.
4. **Key Metrics/KPIs:** How can an organization measure success for this specific point?

Keep it professional, highly actionable, and avoid generic fluff.
"""

@router.post("/deep-dive")
async def generate_deep_dive(request: DeepDiveRequest):
    """Generate a detailed markdown deep-dive for a 1-sentence strategy checkpoint."""
    gemini_key = os.getenv("GEMINI_API_KEY", "")
    if not gemini_key:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY not configured")

    try:
        import google.generativeai as genai
        genai.configure(api_key=gemini_key)
        model = genai.GenerativeModel("gemini-3.1-pro-preview")

        prompt = DEEP_DIVE_PROMPT.format(text=request.text, context=request.context)
        
        response = model.generate_content(
            prompt,
            generation_config=genai.GenerationConfig(temperature=0.3)
        )
        return {"markdown": response.text}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gemini deep-dive failed: {e}")


@router.get("/suggestions")
async def get_assessment_suggestions():
    """Return checkpoints that were found 'covered' by the latest completed document analysis.
    This allows the Manual Assessment to pre-fill checkpoints the AI already confirmed."""
    db = await get_db()
    try:
        cursor = await db.execute(
            """SELECT evaluations, document_name FROM analyses
               WHERE status = 'completed'
               ORDER BY completed_at DESC LIMIT 1"""
        )
        row = await cursor.fetchone()
        if not row:
            return {"suggestions": [], "source": None}

        evaluations = json.loads(row["evaluations"])
        suggestions = {}
        for ev in evaluations:
            if ev.get("covered", False):
                suggestions[ev["checkpoint_id"]] = {
                    "fulfilled": True,
                    "level": ev.get("level", 3),
                    "confidence": ev.get("confidence", 0),
                    "evidence": ev.get("evidence", "")[:120],
                }

        return {
            "suggestions": suggestions,
            "source": row["document_name"],
            "count": len(suggestions),
        }
    finally:
        await db.close()


@router.get("/evidence")
async def get_evidence():
    """Return full evaluation evidence from the latest completed analysis.
    Used by the Evidence Chain feature for checkpoint traceability."""
    db = await get_db()
    try:
        cursor = await db.execute(
            """SELECT evaluations, document_name, completed_at FROM analyses
               WHERE status = 'completed'
               ORDER BY completed_at DESC LIMIT 1"""
        )
        row = await cursor.fetchone()
        if not row:
            return {"evidence": {}, "source": None}

        evaluations = json.loads(row["evaluations"])
        evidence = {}
        for ev in evaluations:
            evidence[ev["checkpoint_id"]] = {
                "covered": ev.get("covered", False),
                "confidence": ev.get("confidence", 0),
                "evidence": ev.get("evidence", ""),
                "recommendation": ev.get("recommendation", ""),
                "relevant_chunks": ev.get("relevant_chunks", []),
                "level": ev.get("level", 0),
            }

        return {
            "evidence": evidence,
            "source": row["document_name"],
            "analyzed_at": row["completed_at"],
        }
    finally:
        await db.close()
