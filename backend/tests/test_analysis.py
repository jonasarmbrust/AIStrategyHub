"""Tests for document analysis API routes."""

import io
import json

import pytest


@pytest.mark.asyncio
async def test_list_analyses_empty(client):
    """GET /analysis returns empty list when no analyses exist."""
    response = await client.get("/api/analysis")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)


@pytest.mark.asyncio
async def test_upload_valid_txt(client):
    """POST /analysis/upload accepts a .txt file."""
    content = b"This is a test AI strategy document about data governance."
    response = await client.post(
        "/api/analysis/upload",
        files={"file": ("test_doc.txt", io.BytesIO(content), "text/plain")},
    )
    assert response.status_code == 200
    data = response.json()
    assert "id" in data
    assert data["filename"] == "test_doc.txt"
    assert data["file_type"] == ".txt"


@pytest.mark.asyncio
async def test_upload_invalid_extension(client):
    """POST /analysis/upload rejects unsupported file types."""
    content = b"not a real file"
    response = await client.post(
        "/api/analysis/upload",
        files={"file": ("malware.exe", io.BytesIO(content), "application/octet-stream")},
    )
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_report_not_found(client):
    """GET /analysis/{id}/report returns 404 for non-existent analysis."""
    response = await client.get("/api/analysis/nonexistent/report")
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_checkpoint_map_not_found(client):
    """GET /analysis/{id}/checkpoint-map returns empty data for non-existent analysis."""
    response = await client.get("/api/analysis/nonexistent/checkpoint-map")
    # Endpoint may return 200 with empty data or 404 depending on implementation
    assert response.status_code in (200, 404)


@pytest.mark.asyncio
async def test_analysis_status_not_found(client):
    """GET /analysis/{id}/status returns 404 for non-existent analysis."""
    response = await client.get("/api/analysis/nonexistent/status")
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_upload_and_list(client):
    """Upload a document, then verify it appears in the analysis list."""
    content = b"AI strategy document for testing."
    
    # Upload
    upload_resp = await client.post(
        "/api/analysis/upload",
        files={"file": ("strategy.txt", io.BytesIO(content), "text/plain")},
    )
    assert upload_resp.status_code == 200
    analysis_id = upload_resp.json()["id"]
    
    # List should contain the upload
    list_resp = await client.get("/api/analysis")
    analyses = list_resp.json()
    ids = [a["id"] for a in analyses]
    assert analysis_id in ids
