"""
Framework Integration API routes.
Allows extracting missing checkpoints from new research documents
and merging them into the active Meta-Model.

Enhanced with:
- Auto-enrichment of proposals with research evidence (improvement #2)
- Research coverage analysis endpoint (improvement #3)
- Activity logging on integrate (improvement #5)
"""

from __future__ import annotations

import json
import os
import uuid
from pathlib import Path
from typing import List

import google.generativeai as genai
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from database import get_db
from knowledge_base.checklist_generator import _load_model

router = APIRouter()

genai.configure(api_key=os.getenv("GEMINI_API_KEY", ""))

UPLOAD_DIR = Path(__file__).parent.parent.parent.parent / "data" / "uploads"
DIMENSIONS_PATH = Path(__file__).parent.parent.parent / "knowledge_base" / "dimensions.json"


class ExtractRequest(BaseModel):
    document_id: str


class IntegrableCheckpoint(BaseModel):
    dimension_id: str
    id: str
    text: str
    text_de: str
    min_level: int
    category: str
    sources: List[str]
    rationale: str
    # New: optional fields from research enrichment
    research_source_id: str = ""
    research_source_url: str = ""
    research_source_title: str = ""
    evidence_tags: list = []


class IntegrateRequest(BaseModel):
    checkpoints: List[IntegrableCheckpoint]


@router.post("/extract")
async def extract_novel_checkpoints(request: ExtractRequest):
    """Analyze an uploaded document against the meta-model to find new checkpoints."""
    # Find document
    db = await get_db()
    try:
        cursor = await db.execute("SELECT * FROM analyses WHERE id = ?", (request.document_id,))
        doc_row = await cursor.fetchone()
        if not doc_row:
            raise HTTPException(status_code=404, detail="Document not found")
            
        file_path = UPLOAD_DIR / f"{request.document_id}{doc_row['file_type']}"
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="Physical document not found")
            
        if doc_row['file_type'] != '.txt':
            # For simplicity, we assume text imports. If PDF, we'd extract text here.
            # But the Research Agent import guarantees .txt!
            raise HTTPException(status_code=400, detail="Only .txt imports are supported for framework extraction currently.")
            
        doc_text = file_path.read_text(encoding="utf-8")
        doc_name = doc_row["document_name"]
    finally:
        await db.close()

    # Load master model outline (names and categories) to save context
    model = _load_model()
    framework_summary = []
    for dim in model.dimensions:
        cp_summaries = [f"- {cp.text}" for cp in dim.checkpoints]
        framework_summary.append(f"Dimension: {dim.id} ({dim.name})\nExisting Checkpoints:\n" + "\n".join(cp_summaries))
    
    meta_model_context = "\n\n".join(framework_summary)

    prompt = f"""You are a Master Enterprise Architecture and AI Strategy expert.
Your job is to read a newly discovered Industry Framework or Research Article, compare it to our existing Master Meta-Model, and extract NOVEL strategic checkpoints/guidelines that our Meta-Model is currently missing.

EXISTING META-MODEL:
{meta_model_context}

NEW DOCUMENT SOURCE ({doc_name}):
{doc_text}

INSTRUCTIONS:
1. Identify up to 7 distinct, highly-valuable strategic rules, processes, or guidelines mentioned in the document that are NOT covered in our existing checkpoints.
2. Formulate them as formal Checkpoints in English and German.
3. Assign them to the most appropriate existing `dimension_id` (e.g. D1_GOVERNANCE).
4. Give a brief rationale for why this is missing and valuable.

Respond EXACTLY in this JSON format:
{{
  "proposals": [
    {{
      "dimension_id": "D1_GOVERNANCE",
      "text": "English Guideline...",
      "text_de": "German Translation...",
      "min_level": 3,
      "category": "Risk Management",
      "sources": ["{doc_name}"],
      "rationale": "Why we need this..."
    }}
  ]
}}
"""

    try:
        gemini_model = genai.GenerativeModel("gemini-2.5-flash")
        response = gemini_model.generate_content(
            prompt,
            generation_config=genai.GenerationConfig(
                response_mime_type="application/json",
                temperature=0.2,
            ),
        )

        data = json.loads(response.text)
        # Assign unique IDs to the proposals before sending to frontend
        proposals = data.get("proposals", [])
        for p in proposals:
            short_id = str(uuid.uuid4())[:6].upper()
            p["id"] = f"NEW_{short_id}"

        # ── Auto-Enrich: attach matching research sources as evidence_tags ──
        proposals = await _enrich_proposals_with_research(proposals)
            
        return {"proposals": proposals}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI Extraction Error: {str(e)}")


@router.post("/integrate")
async def integrate_checkpoints(request: IntegrateRequest):
    """Write approved checkpoints into dimensions.json."""
    if not request.checkpoints:
        return {"status": "success", "added": 0}

    with open(DIMENSIONS_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)

    added_count = 0
    added_details = []
    for new_cp in request.checkpoints:
        # Find the targeted dimension
        target_dim = next((d for d in data.get("dimensions", []) if d["id"] == new_cp.dimension_id), None)
        if target_dim:
            # Generate final ID: CP_{DIMENSION}_{COUNT+1}
            cp_count = len(target_dim.get("checkpoints", []))
            final_id = f"CP_{target_dim['id'][:2]}_{cp_count + 1:02d}"
            
            from datetime import datetime, timezone
            
            # Build evidence tags from research enrichment
            evidence_tags = []
            if new_cp.evidence_tags:
                evidence_tags = [
                    {"source": t.get("source", ""), "reference": t.get("reference", ""), "url": t.get("url", "")}
                    for t in new_cp.evidence_tags
                    if t.get("source")
                ]
            
            checkpoint_obj = {
                "id": final_id,
                "text": new_cp.text,
                "text_de": new_cp.text_de,
                "min_level": new_cp.min_level,
                "category": new_cp.category,
                "sources": new_cp.sources,
                "evidence_tags": evidence_tags,
                "added_at": datetime.now(timezone.utc).isoformat(),
                "added_by": "framework_builder"
            }
            target_dim["checkpoints"].append(checkpoint_obj)
            added_count += 1
            added_details.append({
                "id": final_id,
                "dimension": new_cp.dimension_id,
                "text": new_cp.text[:60],
                "research_source": new_cp.research_source_title or "",
            })

    if added_count > 0:
        with open(DIMENSIONS_PATH, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
            
        # Invalidate internal cache
        from knowledge_base.checklist_generator import clear_cache
        clear_cache()

        # ── Log activity for each integrated checkpoint ──
        for detail in added_details:
            await _log_activity(
                action="checkpoint_integrated",
                checkpoint_id=detail["id"],
                dimension_id=detail["dimension"],
                details=json.dumps({
                    "text": detail["text"],
                    "research_source": detail.get("research_source", ""),
                }),
            )

    return {"status": "success", "added": added_count, "details": added_details}


# ── Research Coverage Analysis (improvement #3) ───────────────────────────

@router.get("/coverage")
async def coverage_analysis():
    """
    Analyze research coverage per dimension.
    Shows which dimensions have the most/least research backing,
    helping users focus their research efforts.
    """
    # Load model
    model = _load_model()
    
    # Count research sources per dimension from DB
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT relevant_dimensions, relevance_score FROM research_sources"
        )
        rows = await cursor.fetchall()
    finally:
        await db.close()

    # Parse and aggregate
    dim_source_counts = {}
    dim_avg_relevance = {}
    for row in rows:
        dims = json.loads(row["relevant_dimensions"] or "[]")
        score = row["relevance_score"] or 0
        for d in dims:
            dim_source_counts[d] = dim_source_counts.get(d, 0) + 1
            if d not in dim_avg_relevance:
                dim_avg_relevance[d] = []
            dim_avg_relevance[d].append(score)

    # Build coverage report
    coverage = []
    for dim in model.dimensions:
        cp_count = len(dim.checkpoints)
        source_count = dim_source_counts.get(dim.id, 0)
        avg_rel = 0
        if dim.id in dim_avg_relevance and dim_avg_relevance[dim.id]:
            avg_rel = sum(dim_avg_relevance[dim.id]) / len(dim_avg_relevance[dim.id])
        
        # Coverage ratio: sources per checkpoint (normalized)
        ratio = min(source_count / max(cp_count, 1), 1.0)
        
        if ratio >= 0.6:
            status = "well-covered"
        elif ratio >= 0.3:
            status = "moderate"
        else:
            status = "under-researched"

        # Count framework_builder additions
        fb_count = 0
        with open(DIMENSIONS_PATH, "r", encoding="utf-8") as f:
            raw = json.load(f)
        for raw_dim in raw.get("dimensions", []):
            if raw_dim["id"] == dim.id:
                fb_count = sum(1 for cp in raw_dim.get("checkpoints", []) if cp.get("added_by") == "framework_builder")

        coverage.append({
            "dimension_id": dim.id,
            "dimension_name": dim.name,
            "icon": dim.icon,
            "checkpoints": cp_count,
            "research_sources": source_count,
            "framework_builder_additions": fb_count,
            "avg_relevance": round(avg_rel, 2),
            "coverage_ratio": round(ratio, 2),
            "status": status,
        })

    # Sort by coverage ratio ascending (most gaps first)
    coverage.sort(key=lambda x: x["coverage_ratio"])

    return {
        "coverage": coverage,
        "total_checkpoints": sum(c["checkpoints"] for c in coverage),
        "total_sources": sum(c["research_sources"] for c in coverage),
        "total_fb_additions": sum(c["framework_builder_additions"] for c in coverage),
    }


# ── Helper: Auto-enrich proposals with research evidence ──────────────────

async def _enrich_proposals_with_research(proposals: list) -> list:
    """
    Cross-reference proposed checkpoints with existing research sources
    to auto-attach relevant evidence tags.
    """
    if not proposals:
        return proposals

    db = await get_db()
    try:
        for p in proposals:
            dim_id = p.get("dimension_id", "")
            if not dim_id:
                continue
            
            cursor = await db.execute(
                "SELECT title, url, relevance_score FROM research_sources "
                "WHERE relevant_dimensions LIKE ? AND relevance_score >= 0.5 "
                "ORDER BY relevance_score DESC LIMIT 3",
                (f"%{dim_id}%",),
            )
            matches = await cursor.fetchall()
            
            if matches:
                evidence_tags = p.get("evidence_tags", [])
                for m in matches:
                    evidence_tags.append({
                        "source": m["title"],
                        "reference": f"Research Agent (relevance: {m['relevance_score']:.0%})",
                        "url": m["url"],
                    })
                p["evidence_tags"] = evidence_tags
    finally:
        await db.close()

    return proposals


# ── Helper: Activity logging ──────────────────────────────────────────────

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
        await db.close()
