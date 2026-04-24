"""Tests for health and basic API functionality."""

import pytest


@pytest.mark.asyncio
async def test_health_endpoint(client):
    """Health endpoint returns status ok."""
    response = await client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["service"] == "AI Strategy Hub"
    assert "version" in data


@pytest.mark.asyncio
async def test_openapi_schema_exists(client):
    """OpenAPI schema is accessible."""
    response = await client.get("/openapi.json")
    assert response.status_code == 200
    schema = response.json()
    assert "paths" in schema
    assert "/api/health" in schema["paths"]


@pytest.mark.asyncio
async def test_api_routes_registered(client):
    """All core API routes are registered."""
    response = await client.get("/openapi.json")
    paths = response.json()["paths"]
    
    expected_prefixes = [
        "/api/checklist",
        "/api/analysis",
        "/api/research",
        "/api/roadmap",
        "/api/export",
        "/api/dashboard",
        "/api/framework",
        "/api/advisor",
    ]
    
    for prefix in expected_prefixes:
        matching = [p for p in paths if p.startswith(prefix)]
        assert len(matching) > 0, f"No routes found for {prefix}"
