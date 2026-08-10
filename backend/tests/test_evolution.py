"""Tests for Evolution Agent concurrency safety and redundancy detection caching."""

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from evolution.agent import EvolutionAgent
from evolution.checkpoint_extractor import _get_cached_embedding, check_proposal_redundancy, clear_embeddings_cache
from knowledge_base.checklist_generator import safe_read_json, safe_write_json


@pytest.mark.asyncio
async def test_dimensions_safe_read_write(tmp_path):
    """Verify that safe_read_json and safe_write_json work correctly with file locks."""
    test_dimensions_path = tmp_path / "dimensions.json"
    test_data = {"test_key": "test_value"}

    # Mock DIMENSIONS_PATH to use our temp path
    with patch("knowledge_base.checklist_generator.DIMENSIONS_PATH", test_dimensions_path):
        # Initial write
        await safe_write_json(test_data)
        assert test_dimensions_path.exists()

        # Read back
        read_data = await safe_read_json()
        assert read_data == test_data


@pytest.mark.asyncio
async def test_dimensions_concurrent_access(tmp_path):
    """Test concurrent reads and writes using safe helpers to ensure no corruption."""
    test_dimensions_path = tmp_path / "dimensions.json"
    test_data = {"dimensions": []}

    with patch("knowledge_base.checklist_generator.DIMENSIONS_PATH", test_dimensions_path):
        await safe_write_json(test_data)

        # Run multiple reads and writes concurrently
        async def writer(val):
            await safe_write_json({"dimensions": [{"id": f"dim_{val}"}]})

        async def reader():
            return await safe_read_json()

        tasks = [
            writer(1),
            reader(),
            writer(2),
            reader(),
            writer(3),
            reader()
        ]

        results = await asyncio.gather(*tasks, return_exceptions=True)
        # Ensure no task raised an exception (like FileNotFoundError or PermissionError)
        for r in results:
            if isinstance(r, Exception):
                raise r


@pytest.mark.asyncio
async def test_redundancy_check_embeddings_with_sqlite_cache(test_db):
    """Verify that _check_proposal_redundancy uses SQLite embedding cache.

    With the new persistent cache, the flow is:
    1. First call: embeds proposal (1 API call) + embeds each existing checkpoint
       individually with cache miss (N API calls), stores them in SQLite.
    2. Second call: embeds proposal again (1 API call), but existing checkpoints
       are resolved from SQLite cache (0 additional API calls).
    """
    agent = EvolutionAgent()

    # Reset caching state (now async)
    await clear_embeddings_cache()

    proposal = {
        "dimension_id": "strategy",
        "text": "Optimize Enterprise AI strategy roadmap alignment.",
        "text_de": "Optimiere die strategische Ausrichtung der AI-Roadmap.",
    }

    mock_dimensions_data = {
        "dimensions": [
            {
                "id": "strategy",
                "name": "Strategy",
                "checkpoints": [
                    {"id": "CP_ST_01", "text": "First existing checkpoint text."},
                    {"id": "CP_ST_02", "text": "Second existing checkpoint text."}
                ]
            }
        ]
    }

    # Mock safe_read_json to return our mock dimensions
    with patch("knowledge_base.checklist_generator.safe_read_json", new_callable=AsyncMock, return_value=mock_dimensions_data):
        # Mock genai.embed_content
        mock_embed = MagicMock()
        proposal_vector = [1.0] + [0.0] * 767
        first_vector = [0.0, 1.0] + [0.0] * 766
        second_vector = [0.0, 0.0, 1.0] + [0.0] * 765

        # embed_content is called once per text (proposal, cp1, cp2)
        mock_embed.side_effect = [
            {"embedding": proposal_vector},    # proposal
            {"embedding": first_vector},       # CP_ST_01 (cache miss)
            {"embedding": second_vector},      # CP_ST_02 (cache miss)
        ]

        with patch("google.generativeai.embed_content", mock_embed):
            # First check — embeds proposal + 2 existing checkpoints (3 API calls)
            result = await check_proposal_redundancy(proposal)

            # Similarity is low (orthogonal vectors), so result should be False
            assert result is False

            # 3 calls: 1 for proposal + 2 for existing checkpoints (cache miss)
            assert mock_embed.call_count == 3

            # Verify SQLite cache has the existing checkpoint embeddings
            cached_1 = await _get_cached_embedding("CP_ST_01", "First existing checkpoint text.")
            cached_2 = await _get_cached_embedding("CP_ST_02", "Second existing checkpoint text.")
            assert cached_1 is not None, "CP_ST_01 should be cached"
            assert cached_2 is not None, "CP_ST_02 should be cached"

            # Reset call count and side_effect for second run
            mock_embed.reset_mock()
            mock_embed.side_effect = [
                {"embedding": proposal_vector},  # Only proposal needs embedding
            ]

            # Second check — proposal embedding requested again (uncached proposal),
            # but existing checkpoints resolved from SQLite cache (0 API calls for them).
            result2 = await check_proposal_redundancy(proposal)
            assert result2 is False
            assert mock_embed.call_count == 1  # Only the proposal was re-embedded
