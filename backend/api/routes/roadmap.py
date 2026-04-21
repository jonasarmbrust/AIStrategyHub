"""
Roadmap API routes — Gap analysis and prioritized action items.
Calculates the delta between current assessment state and target maturity level,
generating a weighted, prioritized list of next steps with full traceability.
"""

from __future__ import annotations

import json
from typing import Optional

from fastapi import APIRouter, Query

from database import get_db
from knowledge_base.checklist_generator import get_maturity_model, calculate_maturity_score
from models.schemas import (
    EffortLevel,
    EvidenceTag,
    RoadmapItem,
    RoadmapRequest,
    RoadmapResponse,
)

router = APIRouter()


def _estimate_effort(min_level: int) -> EffortLevel:
    """Heuristic: higher maturity levels require more effort."""
    if min_level <= 2:
        return EffortLevel.LOW
    elif min_level <= 3:
        return EffortLevel.MEDIUM
    else:
        return EffortLevel.HIGH


def _calculate_priority(dim_weight: float, min_level: int, target_level: int) -> float:
    """
    Priority = dimension weight × (target accessibility).
    Lower min_level items that are closer to target get higher priority (quick wins).
    """
    level_proximity = max(0, target_level - min_level + 1) / target_level
    return round(dim_weight * level_proximity * 100, 1)


def generate_roadmap(
    assessments: dict[str, dict],
    target_level: int = 3,
    focus_dimensions: list[str] | None = None,
) -> RoadmapResponse:
    """
    Generate a prioritized roadmap based on gap analysis.

    For each unfulfilled checkpoint where min_level <= target_level,
    create a roadmap item sorted by priority (weight × accessibility).
    """
    model = get_maturity_model()

    # Calculate current score
    score_result = calculate_maturity_score(assessments) if assessments else {
        "overall_score": 0, "overall_level": 1, "dimension_scores": []
    }

    items: list[RoadmapItem] = []
    dimension_gaps: dict[str, int] = {}

    for dim in model.dimensions:
        if focus_dimensions and dim.id not in focus_dimensions:
            continue

        gap_count = 0

        for cp in dim.checkpoints:
            # Only include checkpoints relevant to target level
            if cp.min_level > target_level:
                continue

            # Check if already fulfilled
            assessment = assessments.get(cp.id, {})
            if assessment.get("fulfilled", False):
                continue

            # This is a gap — create roadmap item
            gap_count += 1
            priority = _calculate_priority(dim.weight, cp.min_level, target_level)
            effort = _estimate_effort(cp.min_level)

            # Parse evidence tags
            evidence_tags = []
            for tag in cp.evidence_tags:
                evidence_tags.append(EvidenceTag(
                    source=tag.source,
                    reference=tag.reference,
                    url=tag.url,
                ))

            items.append(RoadmapItem(
                checkpoint_id=cp.id,
                checkpoint_text=cp.text,
                checkpoint_text_de=cp.text_de,
                dimension_id=dim.id,
                dimension_name=dim.name,
                dimension_icon=dim.icon,
                current_level=assessment.get("level", 0),
                target_level=target_level,
                min_level=cp.min_level,
                priority_score=priority,
                effort=effort,
                evidence_tags=evidence_tags,
                category=cp.category,
            ))

        dimension_gaps[dim.id] = gap_count

    # Sort by priority (highest first)
    items.sort(key=lambda x: x.priority_score, reverse=True)

    # Quick wins: high priority + low effort
    quick_wins = [
        item for item in items
        if item.effort == EffortLevel.LOW and item.priority_score >= 5.0
    ][:5]

    return RoadmapResponse(
        target_level=target_level,
        current_level=score_result.get("overall_level", 1),
        current_score=score_result.get("overall_score", 0),
        total_gaps=len(items),
        quick_wins=quick_wins,
        items=items,
        dimension_gaps=dimension_gaps,
    )


@router.post("/generate", response_model=RoadmapResponse)
async def generate_roadmap_endpoint(request: RoadmapRequest):
    """Generate a prioritized roadmap based on current assessment and target level."""
    return generate_roadmap(
        assessments=request.assessments,
        target_level=request.target_level,
        focus_dimensions=request.focus_dimensions if request.focus_dimensions else None,
    )


@router.get("/from-latest", response_model=RoadmapResponse)
async def roadmap_from_latest_assessment(
    target_level: int = Query(default=3, ge=1, le=5),
):
    """Generate roadmap from the latest saved assessment."""
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT assessments FROM manual_assessments ORDER BY created_at DESC LIMIT 1"
        )
        row = await cursor.fetchone()
        if row:
            assessments = json.loads(row["assessments"])
        else:
            assessments = {}
    finally:
        await db.close()

    return generate_roadmap(assessments=assessments, target_level=target_level)
