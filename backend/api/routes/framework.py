"""
Framework Integration API routes.
Allows extracting missing checkpoints from new research documents
and merging them into the active Meta-Model.
"""

from __future__ import annotations

import json
import os
import uuid
from pathlib import Path
from typing import List

import google.generativeai as genai
from fastapi import APIRouter, HTTPException
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
        gemini_model = genai.GenerativeModel("gemini-3.1-pro-preview")
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
    for new_cp in request.checkpoints:
        # Find the targeted dimension
        target_dim = next((d for d in data.get("dimensions", []) if d["id"] == new_cp.dimension_id), None)
        if target_dim:
            # Generate final ID: CP_{DIMENSION}_{COUNT+1}
            cp_count = len(target_dim.get("checkpoints", []))
            final_id = f"CP_{target_dim['id'][:2]}_{cp_count + 1:02d}"
            
            from datetime import datetime, timezone
            checkpoint_obj = {
                "id": final_id,
                "text": new_cp.text,
                "text_de": new_cp.text_de,
                "min_level": new_cp.min_level,
                "category": new_cp.category,
                "sources": new_cp.sources,
                "evidence_tags": [],
                "added_at": datetime.now(timezone.utc).isoformat(),
                "added_by": "framework_builder"
            }
            target_dim["checkpoints"].append(checkpoint_obj)
            added_count += 1

    if added_count > 0:
        with open(DIMENSIONS_PATH, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
            
        # Invalidate internal cache
        from knowledge_base.checklist_generator import clear_cache
        clear_cache()

    return {"status": "success", "added": added_count}
