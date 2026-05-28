"""
Checklist Generator — Loads the maturity model and generates
filtered checklists from the structured dimensions.json.
"""

from __future__ import annotations

import json
import os
import asyncio
from pathlib import Path
from typing import Optional

from models.schemas import Checkpoint, ChecklistResponse, Dimension, MaturityModel
from config import DIMENSIONS_PATH

try:
    import msvcrt
    has_msvcrt = True
except ImportError:
    has_msvcrt = False

try:
    import fcntl
    has_fcntl = True
except ImportError:
    has_fcntl = False


class CrossProcessFileLock:
    """A cross-platform file locking class using standard libraries."""
    def __init__(self, path: str):
        self.lock_path = path + ".lock"
        self.fd = None

    def acquire(self):
        try:
            self.fd = os.open(self.lock_path, os.O_CREAT | os.O_RDWR)
            if has_msvcrt:
                # Seek to 0 and lock 1 byte
                msvcrt.locking(self.fd, msvcrt.LK_LOCK, 1)
            elif has_fcntl:
                fcntl.flock(self.fd, fcntl.LOCK_EX)
        except Exception as e:
            # Fallback if locking fails
            print(f"[CrossProcessFileLock] Warning: Failed to acquire lock: {e}")

    def release(self):
        if self.fd is not None:
            try:
                if has_msvcrt:
                    os.lseek(self.fd, 0, os.SEEK_SET)
                    msvcrt.locking(self.fd, msvcrt.LK_UNLCK, 1)
                elif has_fcntl:
                    fcntl.flock(self.fd, fcntl.LOCK_UN)
            except Exception:
                pass
            try:
                os.close(self.fd)
            except Exception:
                pass
            self.fd = None


_dimensions_lock = asyncio.Lock()
_model_cache: Optional[MaturityModel] = None


async def safe_read_json() -> dict:
    """Safely read dimensions.json using both event-loop lock and file lock."""
    async with _dimensions_lock:
        lock = CrossProcessFileLock(str(DIMENSIONS_PATH))
        lock.acquire()
        try:
            with open(DIMENSIONS_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        finally:
            lock.release()


async def safe_write_json(data: dict) -> None:
    """Safely write dimensions.json using both event-loop lock and file lock."""
    async with _dimensions_lock:
        lock = CrossProcessFileLock(str(DIMENSIONS_PATH))
        lock.acquire()
        try:
            with open(DIMENSIONS_PATH, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
        finally:
            lock.release()
        
        global _model_cache
        _model_cache = None


def safe_read_json_sync() -> dict:
    """Synchronously read dimensions.json with file lock."""
    lock = CrossProcessFileLock(str(DIMENSIONS_PATH))
    lock.acquire()
    try:
        with open(DIMENSIONS_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    finally:
        lock.release()


def safe_write_json_sync(data: dict) -> None:
    """Synchronously write dimensions.json with file lock."""
    lock = CrossProcessFileLock(str(DIMENSIONS_PATH))
    lock.acquire()
    try:
        with open(DIMENSIONS_PATH, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
    finally:
        lock.release()
    
    global _model_cache
    _model_cache = None


def _load_model() -> MaturityModel:
    """Load and cache the maturity model from dimensions.json."""
    global _model_cache
    if _model_cache is None:
        data = safe_read_json_sync()
        _model_cache = MaturityModel(**data)
    return _model_cache


def clear_cache():
    """Invalidate the model cache so it reloads from disk."""
    global _model_cache
    _model_cache = None
    try:
        from evolution.agent import clear_embeddings_cache
        clear_embeddings_cache()
    except Exception:
        pass


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
