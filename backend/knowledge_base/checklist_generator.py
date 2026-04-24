"""
Checklist Generator — Loads the maturity model and generates
filtered checklists from the structured dimensions.json.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Optional

from models.schemas import Checkpoint, ChecklistResponse, Dimension, MaturityModel
from config import DIMENSIONS_PATH

_model_cache: Optional[MaturityModel] = None


def _load_model() -> MaturityModel:
    """Load and cache the maturity model from dimensions.json."""
    global _model_cache
    if _model_cache is None:
        with open(DIMENSIONS_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        _model_cache = MaturityModel(**data)
    return _model_cache


def clear_cache():
    """Invalidate the model cache so it reloads from disk."""
    global _model_cache
    _model_cache = None


def get_maturity_model() -> MaturityModel:
    """Return the full maturity model."""
    return _load_model()


def get_dimensions(
    dimension_id: Optional[str] = None,
    min_level: Optional[int] = None,
    max_level: Optional[int] = None,
    category: Optional[str] = None,
) -> list[Dimension]:
    """
    Get dimensions with optional filtering.

    Args:
        dimension_id: Filter to a specific dimension
        min_level: Only include checkpoints >= this maturity level
        max_level: Only include checkpoints <= this maturity level
        category: Filter checkpoints by category
    """
    model = _load_model()
    dimensions = model.dimensions

    if dimension_id:
        dimensions = [d for d in dimensions if d.id == dimension_id]

    if min_level is not None or max_level is not None or category is not None:
        filtered = []
        for dim in dimensions:
            filtered_checkpoints = dim.checkpoints
            if min_level is not None:
                filtered_checkpoints = [
                    c for c in filtered_checkpoints if c.min_level >= min_level
                ]
            if max_level is not None:
                filtered_checkpoints = [
                    c for c in filtered_checkpoints if c.min_level <= max_level
                ]
            if category is not None:
                filtered_checkpoints = [
                    c
                    for c in filtered_checkpoints
                    if c.category.lower() == category.lower()
                ]
            if filtered_checkpoints:
                filtered.append(
                    Dimension(
                        id=dim.id,
                        name=dim.name,
                        name_de=dim.name_de,
                        icon=dim.icon,
                        weight=dim.weight,
                        description=dim.description,
                        sources=dim.sources,
                        checkpoints=filtered_checkpoints,
                    )
                )
        dimensions = filtered

    return dimensions


def get_checklist_response(
    dimension_id: Optional[str] = None,
    min_level: Optional[int] = None,
    max_level: Optional[int] = None,
    category: Optional[str] = None,
) -> ChecklistResponse:
    """Generate a ChecklistResponse with optional filters."""
    model = _load_model()
    dimensions = get_dimensions(dimension_id, min_level, max_level, category)
    total = sum(len(d.checkpoints) for d in dimensions)

    return ChecklistResponse(
        dimensions=dimensions,
        total_checkpoints=total,
        model_version=model.version,
    )


def calculate_maturity_score(
    assessments: dict[str, dict],
) -> dict:
    """
    Calculate maturity scores from checkpoint assessments.

    Args:
        assessments: Dict of checkpoint_id -> { fulfilled: bool, level: int }

    Returns:
        Dict with overall_score, overall_level, and per-dimension breakdown.
    """
    model = _load_model()
    dimension_scores = []

    for dim in model.dimensions:
        fulfilled = 0
        total = len(dim.checkpoints)
        level_sum = 0
        weighted_score_sum = 0

        for cp in dim.checkpoints:
            assessment = assessments.get(cp.id, {})
            if assessment.get("fulfilled", False):
                confidence = assessment.get("confidence", 0.5)
                evidence_depth = assessment.get("evidence_depth", 1)
                # Weight: confidence (0-1) * depth bonus (1.0/1.15/1.3)
                depth_bonus = 1.0 + (evidence_depth - 1) * 0.15
                weight = min(confidence * depth_bonus, 1.0)
                fulfilled += 1
                weighted_score_sum += weight
                level_sum += assessment.get("level", cp.min_level)

        # Weighted score: considers confidence/depth, not just binary
        score = (weighted_score_sum / total * 100) if total > 0 else 0
        avg_level = (level_sum / fulfilled) if fulfilled > 0 else 1

        # Determine dimension maturity level based on score
        if score >= 90:
            dim_level = 5
        elif score >= 70:
            dim_level = 4
        elif score >= 50:
            dim_level = 3
        elif score >= 25:
            dim_level = 2
        else:
            dim_level = 1

        dimension_scores.append(
            {
                "dimension_id": dim.id,
                "dimension_name": dim.name,
                "icon": dim.icon,
                "weight": dim.weight,
                "score": round(score, 1),
                "level": dim_level,
                "fulfilled_count": fulfilled,
                "total_count": total,
            }
        )

    # Weighted overall score
    overall_score = sum(
        ds["score"] * ds["weight"] for ds in dimension_scores
    )

    # Overall level
    if overall_score >= 90:
        overall_level = 5
    elif overall_score >= 70:
        overall_level = 4
    elif overall_score >= 50:
        overall_level = 3
    elif overall_score >= 25:
        overall_level = 2
    else:
        overall_level = 1

    # Generate strengths and gaps
    sorted_dims = sorted(dimension_scores, key=lambda x: x["score"], reverse=True)
    strengths = [
        f"{d['icon']} {d['dimension_name']}: {d['score']}% (Level {d['level']})"
        for d in sorted_dims
        if d["score"] >= 60
    ]
    gaps = [
        f"{d['icon']} {d['dimension_name']}: {d['score']}% — needs improvement"
        for d in sorted_dims
        if d["score"] < 60
    ]

    return {
        "overall_score": round(overall_score, 1),
        "overall_level": overall_level,
        "dimension_scores": dimension_scores,
        "strengths": strengths[:5],
        "gaps": gaps[:5],
    }
