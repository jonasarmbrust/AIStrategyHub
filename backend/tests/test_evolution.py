"""Tests for Evolution Agent concurrency safety and redundancy detection caching."""

import pytest
import asyncio
from unittest.mock import patch, MagicMock
from pathlib import Path
import json

from knowledge_base.checklist_generator import safe_read_json, safe_write_json, DIMENSIONS_PATH
from evolution.agent import EvolutionAgent, clear_embeddings_cache, _existing_embeddings_cache


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
async def test_redundancy_check_embeddings_batch_and_caching():
    """Verify that _check_proposal_redundancy batches embedding API calls and uses caching."""
    agent = EvolutionAgent()
    
    # Reset caching state
    clear_embeddings_cache()
    
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
    with patch("knowledge_base.checklist_generator.safe_read_json", return_value=mock_dimensions_data):
        # Mock genai.embed_content
        mock_embed = MagicMock()
        proposal_vector = [1.0] + [0.0] * 767
        first_vector = [0.0, 1.0] + [0.0] * 766
        second_vector = [0.0, 0.0, 1.0] + [0.0] * 765
        
        mock_embed.return_value = {
            "embedding": proposal_vector,
            "embeddings": [
                {"embedding": first_vector},
                {"embedding": second_vector}
            ]
        }
        
        with patch("google.generativeai.embed_content", mock_embed):
            # First check - embeds proposal AND existing checkpoints (2 in total in a batch)
            # Thus, we expect embed_content to be called twice:
            # 1. To embed the proposal text (1 text)
            # 2. To embed the existing checkpoints (batch list of 2 texts)
            result = await agent._check_proposal_redundancy(proposal)
            
            # Since the similarity won't exceed threshold (0.1 * 0.1 dot product etc is low), result should be False
            assert result is False
            
            # Check call count of embedding api (1 for proposal, 1 for batch)
            assert mock_embed.call_count == 2
            
            # Verify caching worked: cache should have 2 existing texts cached
            assert "First existing checkpoint text." in _existing_embeddings_cache
            assert "Second existing checkpoint text." in _existing_embeddings_cache
            
            # Reset call count
            mock_embed.reset_mock()
            
            # Second check - proposal embedding will be requested again (uncached proposal),
            # but existing checkpoints should be resolved fully from cache!
            # So, only 1 call to embed proposal text, and 0 batch calls for existing checkpoints.
            result2 = await agent._check_proposal_redundancy(proposal)
            assert result2 is False
            assert mock_embed.call_count == 1
