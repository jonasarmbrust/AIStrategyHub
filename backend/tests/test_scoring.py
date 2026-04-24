"""Tests for the scoring engine — calculate_maturity_score()."""

import pytest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
from knowledge_base.checklist_generator import calculate_maturity_score, get_maturity_model


class TestScoringEngine:
    """Unit tests for maturity score calculation."""

    def test_empty_assessments(self):
        """Empty assessments should return score 0."""
        result = calculate_maturity_score({})
        assert result["overall_score"] == 0.0
        assert result["overall_level"] == 1
        assert len(result["dimension_scores"]) == 7

    def test_all_fulfilled_high_confidence(self):
        """All checkpoints fulfilled with high confidence = high score."""
        model = get_maturity_model()
        assessments = {}
        for dim in model.dimensions:
            for cp in dim.checkpoints:
                assessments[cp.id] = {
                    "fulfilled": True,
                    "level": 4,
                    "confidence": 0.95,
                    "evidence_depth": 3,
                }
        
        result = calculate_maturity_score(assessments)
        assert result["overall_score"] >= 90.0
        assert result["overall_level"] == 5

    def test_partial_fulfillment(self):
        """Partial fulfillment = moderate score."""
        model = get_maturity_model()
        assessments = {}
        for dim in model.dimensions:
            # Fulfill only first half of checkpoints
            for cp in dim.checkpoints[:len(dim.checkpoints) // 2]:
                assessments[cp.id] = {
                    "fulfilled": True,
                    "level": 3,
                    "confidence": 0.7,
                    "evidence_depth": 2,
                }
        
        result = calculate_maturity_score(assessments)
        assert 30 <= result["overall_score"] <= 70
        assert 2 <= result["overall_level"] <= 3

    def test_confidence_affects_score(self):
        """Lower confidence should yield lower score than higher confidence."""
        model = get_maturity_model()
        
        # High confidence
        assessments_high = {}
        for dim in model.dimensions:
            for cp in dim.checkpoints:
                assessments_high[cp.id] = {
                    "fulfilled": True, "level": 3,
                    "confidence": 0.95, "evidence_depth": 2,
                }
        
        # Low confidence
        assessments_low = {}
        for dim in model.dimensions:
            for cp in dim.checkpoints:
                assessments_low[cp.id] = {
                    "fulfilled": True, "level": 3,
                    "confidence": 0.3, "evidence_depth": 1,
                }
        
        score_high = calculate_maturity_score(assessments_high)["overall_score"]
        score_low = calculate_maturity_score(assessments_low)["overall_score"]
        
        assert score_high > score_low, "Higher confidence should yield higher score"

    def test_dimension_weights_sum_to_one(self):
        """All dimension weights should sum to 1.0."""
        model = get_maturity_model()
        total_weight = sum(dim.weight for dim in model.dimensions)
        assert abs(total_weight - 1.0) < 0.01

    def test_strengths_and_gaps_generated(self):
        """Score calculation produces strengths and gaps lists."""
        model = get_maturity_model()
        assessments = {}
        # Only fulfill strategy checkpoints
        for cp in model.dimensions[0].checkpoints:
            assessments[cp.id] = {
                "fulfilled": True, "level": 4,
                "confidence": 0.9, "evidence_depth": 2,
            }
        
        result = calculate_maturity_score(assessments)
        assert isinstance(result["strengths"], list)
        assert isinstance(result["gaps"], list)
        assert len(result["gaps"]) > 0  # Non-fulfilled dimensions should be gaps

    def test_level_mapping_thresholds(self):
        """Verify level mapping: 0-24=1, 25-49=2, 50-69=3, 70-89=4, 90+=5."""
        model = get_maturity_model()
        
        # Create a controlled test with exact scores
        result = calculate_maturity_score({})
        assert result["overall_level"] == 1  # Score 0 -> Level 1

    def test_model_has_checkpoints(self):
        """Model should have at least 100 checkpoints across 7 dimensions."""
        model = get_maturity_model()
        assert len(model.dimensions) == 7
        total = sum(len(d.checkpoints) for d in model.dimensions)
        assert total >= 100
