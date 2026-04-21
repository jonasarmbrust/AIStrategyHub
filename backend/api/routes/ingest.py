"""
Source Ingestion API — Analyze external sources and integrate insights
into the OAIMM maturity model.

Workflow:
1. User provides URL or uploads file
2. Gemini extracts key arguments mapped to dimensions
3. User reviews and selectively approves
4. Approved insights become evidence_tags in dimensions.json
"""

from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from pydantic import BaseModel

router = APIRouter()

DIMENSIONS_PATH = Path(__file__).parent.parent / "knowledge_base" / "dimensions.json"

EXTRACT_PROMPT = """You are an AI Strategy Research Analyst. Analyze the following document/content and extract the key arguments and recommendations that are relevant for an AI Maturity Assessment.

## Source Content
Title: {title}
URL: {url}
Content:
{content}

## Task
Extract 5-15 key arguments/recommendations from this source. For each argument:
1. Summarize it in one clear, actionable sentence
2. Map it to one of these maturity dimensions: strategy, data, governance, technology, talent, ethics, processes
3. Suggest which maturity level it applies to (1-5): 1=Exploring, 2=Experimenting, 3=Operationalizing, 4=Scaling, 5=Transforming
4. Rate its importance (0.0-1.0)
5. Extract the specific section/chapter/page reference if available

Respond in valid JSON:
{{
  "source_name": "short name of the source",
  "source_type": "framework|regulation|whitepaper|article|report|tool",
  "arguments": [
    {{
      "text": "clear actionable recommendation",
      "text_de": "German translation of the recommendation",
      "dimension": "strategy|data|governance|technology|talent|ethics|processes",
      "suggested_level": 1-5,
      "importance": 0.0-1.0,
      "reference": "specific section or chapter reference",
      "reasoning": "why this is relevant for AI maturity"
    }}
  ]
}}
"""


class ExtractedArgument(BaseModel):
    text: str
    text_de: str = ""
    dimension: str
    suggested_level: int = 3
    importance: float = 0.5
    reference: str = ""
    reasoning: str = ""


class SourceAnalysisResult(BaseModel):
    source_name: str
    source_type: str = "article"
    source_url: str = ""
    arguments: list[ExtractedArgument] = []


class IntegrateRequest(BaseModel):
    source_name: str
    source_url: str = ""
    arguments: list[dict]  # Selected arguments to integrate


@router.post("/analyze-url")
async def analyze_url(url: str = Form(...), title: str = Form("")):
    """Fetch a URL and extract key arguments using Gemini."""
    import httpx

    # Fetch content
    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=30) as client:
            resp = await client.get(url, headers={"User-Agent": "OAIMM Research Bot/1.0"})
            resp.raise_for_status()
            raw_content = resp.text
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not fetch URL: {e}")

    # Strip HTML tags for cleaner text
    text_content = re.sub(r'<[^>]+>', ' ', raw_content)
    text_content = re.sub(r'\s+', ' ', text_content).strip()

    if len(text_content) < 100:
        raise HTTPException(status_code=400, detail="URL content too short or empty")

    return await _extract_arguments(
        content=text_content[:15000],
        title=title or url,
        url=url,
    )


@router.post("/analyze-file")
async def analyze_file(file: UploadFile = File(...)):
    """Upload a file (PDF, TXT, MD) and extract key arguments."""
    content_bytes = await file.read()
    filename = file.filename or "uploaded_file"

    # Extract text based on file type
    if filename.lower().endswith('.pdf'):
        text_content = _extract_pdf_text(content_bytes)
    elif filename.lower().endswith(('.txt', '.md', '.markdown')):
        text_content = content_bytes.decode('utf-8', errors='ignore')
    elif filename.lower().endswith(('.docx',)):
        text_content = _extract_docx_text(content_bytes)
    else:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {filename}")

    if len(text_content) < 100:
        raise HTTPException(status_code=400, detail="File content too short or empty")

    return await _extract_arguments(
        content=text_content[:15000],
        title=filename,
        url="",
    )


@router.post("/integrate")
async def integrate_arguments(request: IntegrateRequest):
    """Integrate selected arguments as evidence_tags into the maturity model."""
    if not request.arguments:
        raise HTTPException(status_code=400, detail="No arguments to integrate")

    # Load current dimensions.json
    with open(DIMENSIONS_PATH, 'r', encoding='utf-8') as f:
        model = json.load(f)

    integrated = 0
    affected_checkpoints = []
    for arg in request.arguments:
        dim_id = arg.get("dimension", "strategy")
        text = arg.get("text", "")
        reference = arg.get("reference", "")
        suggested_level = arg.get("suggested_level", 3)

        # Find the dimension
        dim = next((d for d in model["dimensions"] if d["id"] == dim_id), None)
        if not dim:
            continue

        # Find the best matching checkpoint (by level proximity)
        best_cp = None
        best_score = float('inf')
        for cp in dim["checkpoints"]:
            level_diff = abs(cp["min_level"] - suggested_level)
            if level_diff < best_score:
                best_score = level_diff
                best_cp = cp

        if not best_cp:
            continue

        # Add evidence tag
        new_tag = {
            "source": request.source_name,
            "reference": reference or text[:80],
            "url": request.source_url,
        }

        # Check for duplicates
        existing_tags = best_cp.get("evidence_tags", [])
        is_duplicate = any(
            t.get("source") == new_tag["source"] and t.get("reference") == new_tag["reference"]
            for t in existing_tags
        )

        if not is_duplicate:
            if "evidence_tags" not in best_cp:
                best_cp["evidence_tags"] = []
            best_cp["evidence_tags"].append(new_tag)

            # Also add source to sources list if not already there
            if request.source_name not in best_cp.get("sources", []):
                if "sources" not in best_cp:
                    best_cp["sources"] = []
                best_cp["sources"].append(request.source_name)

            integrated += 1
            affected_checkpoints.append({
                "id": best_cp["id"],
                "dimension": dim_id,
                "text": best_cp.get("text", "")[:60],
            })

    # Save updated model
    if integrated > 0:
        with open(DIMENSIONS_PATH, 'w', encoding='utf-8') as f:
            json.dump(model, f, indent=2, ensure_ascii=False)

    return {
        "integrated": integrated,
        "total_requested": len(request.arguments),
        "source": request.source_name,
        "affected_checkpoints": affected_checkpoints,
    }


class RemoveEvidenceRequest(BaseModel):
    checkpoint_id: str
    source: str
    reference: str

@router.delete("/evidence")
async def remove_evidence(request: RemoveEvidenceRequest):
    """Remove a specific evidence tag from the framework model."""
    with open(DIMENSIONS_PATH, 'r', encoding='utf-8') as f:
        model = json.load(f)

    target_cp = None
    for dim in model["dimensions"]:
        for cp in dim["checkpoints"]:
            if cp["id"] == request.checkpoint_id:
                target_cp = cp
                break
        if target_cp:
            break

    if not target_cp:
        raise HTTPException(status_code=404, detail="Checkpoint not found")

    if "evidence_tags" not in target_cp:
        raise HTTPException(status_code=404, detail="No evidence tags in this checkpoint")

    initial_len = len(target_cp["evidence_tags"])
    target_cp["evidence_tags"] = [
        t for t in target_cp["evidence_tags"] 
        if not (t.get("source") == request.source and t.get("reference") == request.reference)
    ]

    if len(target_cp["evidence_tags"]) == initial_len:
        raise HTTPException(status_code=404, detail="Evidence tag not found")

    # Clean up sources array if the source is no longer referenced in this checkpoint
    if "sources" in target_cp:
        still_referenced = any(t.get("source") == request.source for t in target_cp["evidence_tags"])
        if not still_referenced and request.source in target_cp["sources"]:
            target_cp["sources"].remove(request.source)

    # Save
    with open(DIMENSIONS_PATH, 'w', encoding='utf-8') as f:
        json.dump(model, f, indent=2, ensure_ascii=False)

    return {"status": "success", "removed_from": request.checkpoint_id}


@router.get("/preview-model")
async def preview_model_stats():
    """Get current model statistics for the integration preview."""
    with open(DIMENSIONS_PATH, 'r', encoding='utf-8') as f:
        model = json.load(f)

    dims = {}
    total_tags = 0
    total_cps = 0
    for dim in model["dimensions"]:
        cp_count = len(dim["checkpoints"])
        tag_count = sum(len(cp.get("evidence_tags", [])) for cp in dim["checkpoints"])
        dims[dim["id"]] = {"name": dim["name"], "checkpoints": cp_count, "evidence_tags": tag_count}
        total_tags += tag_count
        total_cps += cp_count

    return {
        "version": model.get("version", "?"),
        "total_checkpoints": total_cps,
        "total_evidence_tags": total_tags,
        "dimensions": dims,
    }


class PersonalizeRequest(BaseModel):
    dimension_scores: dict
    gaps: list[dict] = []


PERSONALIZE_PROMPT = """You are an AI Strategy Consultant analyzing an organization's AI maturity assessment results.

## Current Assessment Results
{scores_json}

## Identified Gaps (dimensions scoring below 70%)
{gaps_json}

## Task
Based on these assessment results, generate personalized, actionable recommendations. Consider:
1. Which dimensions need the most urgent attention?
2. What are quick wins vs. strategic investments?
3. How do the gaps relate to each other (e.g., governance gaps amplify ethics risks)?

Respond in valid JSON:
{{
  "executive_summary": "2-3 sentence overview of the organization's AI maturity status and key priorities",
  "recommendations": [
    {{
      "action": "specific, actionable recommendation",
      "dimension": "strategy|data|governance|technology|talent|ethics|processes",
      "priority": "critical|high|medium",
      "timeframe": "immediate|1-3 months|3-6 months|6-12 months",
      "reasoning": "why this is important given the current scores",
      "expected_impact": "what improvement to expect"
    }}
  ]
}}

Generate 7-10 recommendations, ordered by priority. Be specific and actionable, not generic.
"""


@router.post("/personalize")
async def personalize_recommendations(request: PersonalizeRequest):
    """Generate AI-powered personalized recommendations based on assessment scores."""
    gemini_key = os.getenv("GEMINI_API_KEY", "")
    if not gemini_key:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY not configured")

    try:
        import google.generativeai as genai
        genai.configure(api_key=gemini_key)
        model = genai.GenerativeModel("gemini-3.1-pro-preview")

        prompt = PERSONALIZE_PROMPT.format(
            scores_json=json.dumps(request.dimension_scores, indent=2),
            gaps_json=json.dumps(request.gaps, indent=2),
        )

        response = model.generate_content(
            prompt,
            generation_config=genai.GenerationConfig(
                response_mime_type="application/json",
                temperature=0.3,
            ),
        )

        return json.loads(response.text)

    except json.JSONDecodeError as e:
        raise HTTPException(status_code=500, detail=f"Gemini returned invalid JSON: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gemini analysis failed: {e}")


async def _extract_arguments(content: str, title: str, url: str) -> dict:
    """Use Gemini to extract key arguments from content."""
    gemini_key = os.getenv("GEMINI_API_KEY", "")
    if not gemini_key:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY not configured")

    try:
        import google.generativeai as genai
        genai.configure(api_key=gemini_key)
        model = genai.GenerativeModel("gemini-2.5-pro")

        prompt = EXTRACT_PROMPT.format(
            title=title,
            url=url,
            content=content,
        )

        response = model.generate_content(
            prompt,
            generation_config=genai.GenerationConfig(
                response_mime_type="application/json",
                temperature=0.2,
            ),
        )

        result = json.loads(response.text)
        result["source_url"] = url

        return result

    except json.JSONDecodeError as e:
        raise HTTPException(status_code=500, detail=f"Gemini returned invalid JSON: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gemini analysis failed: {e}")


def _extract_pdf_text(content_bytes: bytes) -> str:
    """Extract text from PDF bytes."""
    try:
        import io
        from reportlab.lib.pagesizes import letter
        # Try PyPDF2 or pdfplumber
        try:
            import PyPDF2
            reader = PyPDF2.PdfReader(io.BytesIO(content_bytes))
            text = ""
            for page in reader.pages:
                text += page.extract_text() or ""
            return text
        except ImportError:
            pass

        try:
            import pdfplumber
            with pdfplumber.open(io.BytesIO(content_bytes)) as pdf:
                return "\n".join(page.extract_text() or "" for page in pdf.pages)
        except ImportError:
            pass

        # Fallback: basic extraction
        text = content_bytes.decode('latin-1', errors='ignore')
        # Remove binary noise
        text = re.sub(r'[^\x20-\x7E\n\r\t\xC0-\xFF]', '', text)
        return text

    except Exception as e:
        return f"PDF extraction failed: {e}"


def _extract_docx_text(content_bytes: bytes) -> str:
    """Extract text from DOCX bytes."""
    try:
        import io
        import zipfile

        with zipfile.ZipFile(io.BytesIO(content_bytes)) as z:
            with z.open('word/document.xml') as f:
                content = f.read().decode('utf-8')
                text = re.sub(r'<[^>]+>', ' ', content)
                return re.sub(r'\s+', ' ', text).strip()
    except Exception as e:
        return f"DOCX extraction failed: {e}"
