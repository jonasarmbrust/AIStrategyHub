"""Tests for API Key authentication middleware."""

import pytest
from unittest.mock import patch
import config


@pytest.mark.asyncio
async def test_auth_exempt_paths(client):
    """Exempt paths should bypass authentication regardless of config."""
    with patch("config.AUTH_ENABLED", True), patch("config.API_AUTH_KEY", "secret_key"):
        # OpenAPI schema is exempt
        response = await client.get("/openapi.json")
        assert response.status_code == 200


@pytest.mark.asyncio
async def test_auth_missing_api_key(client):
    """API endpoints should return 401 if key is missing and auth is enabled."""
    with patch("config.AUTH_ENABLED", True), patch("config.API_AUTH_KEY", "secret_key"):
        response = await client.get("/api/health")
        assert response.status_code == 401
        data = response.json()
        assert data["error"] == "API key required"
        assert data["code"] == "AUTH_MISSING_KEY"


@pytest.mark.asyncio
async def test_auth_invalid_api_key(client):
    """API endpoints should return 403 if key is incorrect."""
    with patch("config.AUTH_ENABLED", True), patch("config.API_AUTH_KEY", "secret_key"):
        headers = {"X-API-Key": "wrong_key"}
        response = await client.get("/api/health", headers=headers)
        assert response.status_code == 403
        data = response.json()
        assert data["error"] == "Invalid API key"
        assert data["code"] == "AUTH_INVALID_KEY"


@pytest.mark.asyncio
async def test_auth_valid_api_key(client):
    """API endpoints should return 200 if correct key is provided."""
    with patch("config.AUTH_ENABLED", True), patch("config.API_AUTH_KEY", "secret_key"):
        headers = {"X-API-Key": "secret_key"}
        response = await client.get("/api/health", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"


@pytest.mark.asyncio
async def test_auth_disabled(client):
    """API endpoints should bypass check if auth is disabled."""
    with patch("config.AUTH_ENABLED", False):
        response = await client.get("/api/health")
        assert response.status_code == 200
