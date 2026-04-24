"""Tests for checklist API routes."""

import pytest


@pytest.mark.asyncio
async def test_get_checklist(client):
    """GET /checklist returns all dimensions and checkpoints."""
    response = await client.get("/api/checklist")
    assert response.status_code == 200
    data = response.json()
    assert "dimensions" in data
    assert "total_checkpoints" in data
    assert data["total_checkpoints"] >= 100
    assert len(data["dimensions"]) == 7


@pytest.mark.asyncio
async def test_get_checklist_filter_dimension(client):
    """GET /checklist?dimension=strategy returns only strategy."""
    response = await client.get("/api/checklist?dimension=strategy")
    assert response.status_code == 200
    data = response.json()
    assert len(data["dimensions"]) == 1
    assert data["dimensions"][0]["id"] == "strategy"


@pytest.mark.asyncio
async def test_get_checklist_filter_level(client):
    """GET /checklist?min_level=3 returns only level 3+ checkpoints."""
    response = await client.get("/api/checklist?min_level=3")
    assert response.status_code == 200
    data = response.json()
    for dim in data["dimensions"]:
        for cp in dim["checkpoints"]:
            assert cp["min_level"] >= 3
