"""
Checklist API routes.
Provides endpoints for retrieving and customizing the AI maturity checklist,
and for submitting manual assessments.
"""

from __future__ import annotations

import json
import uuid
from typing import Optional

from fastapi import APIRouter, Query

from database import get_db
from knowledge_base.checklist_generator import (
    calculate_maturity_score,
    get_checklist_response,
    get_maturity_model,
)
from models.schemas import (
    ChecklistResponse,
    ManualAssessmentRequest,
    MaturityReport,
)

router = APIRouter()


@router.get("", response_model=ChecklistResponse)
async def get_checklist(
    dimension: Optional[str] = Query(None, description="Filter by dimension ID"),
    min_level: Optional[int] = Query(None, ge=1, le=5, description="Min maturity level"),
    max_level: Optional[int] = Query(None, ge=1, le=5, description="Max maturity level"),
    category: Optional[str] = Query(None, description="Filter by checkpoint category"),
):
    """Retrieve the full or filtered AI maturity checklist."""
    return get_checklist_response(dimension, min_level, max_level, category)


@router.get("/model")
async def get_model():
    """Retrieve the full maturity model definition."""
    model = get_maturity_model()
    return model.model_dump()


@router.post("/assess")
async def submit_manual_assessment(request: ManualAssessmentRequest):
    """
    Submit a manual assessment and calculate maturity scores.
    Stores the result in the database for history tracking.
    """
    # Build assessment dict
    assessment_dict = {}
    for a in request.assessments:
        assessment_dict[a.checkpoint_id] = {
            "fulfilled": a.fulfilled,
            "level": a.level,
            "notes": a.notes,
        }

    # Calculate scores
    result = calculate_maturity_score(assessment_dict)

    # Store in database
    assessment_id = str(uuid.uuid4())[:8]
    db = await get_db()
    try:
        await db.execute(
            """INSERT INTO manual_assessments
               (id, assessments, overall_score, overall_level, dimension_scores, strengths, gaps)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (
                assessment_id,
                json.dumps(assessment_dict),
                result["overall_score"],
                result["overall_level"],
                json.dumps(result["dimension_scores"]),
                json.dumps(result["strengths"]),
                json.dumps(result["gaps"]),
            ),
        )
        await db.commit()
    finally:
        await db.close()

    return {
        "id": assessment_id,
        **result,
    }


@router.get("/history")
async def get_assessment_history():
    """Retrieve all past manual assessments."""
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT * FROM manual_assessments ORDER BY created_at DESC"
        )
        rows = await cursor.fetchall()
        return [
            {
                "id": row["id"],
                "overall_score": row["overall_score"],
                "overall_level": row["overall_level"],
                "dimension_scores": json.loads(row["dimension_scores"]),
                "strengths": json.loads(row["strengths"]),
                "gaps": json.loads(row["gaps"]),
                "created_at": row["created_at"],
            }
            for row in rows
        ]
    finally:
        await db.close()
