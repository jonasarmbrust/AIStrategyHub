"""
Shared test fixtures for AI Strategy Hub backend tests.
"""

import asyncio
import sys
from pathlib import Path

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

# Ensure backend is importable
sys.path.insert(0, str(Path(__file__).parent.parent))

# Override DB to use a temp directory BEFORE importing app
import config


@pytest.fixture(scope="session")
def event_loop():
    """Create a session-scoped event loop."""
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture
async def test_db(tmp_path):
    """Create a fresh test database for each test."""
    db_path = tmp_path / "test.db"
    config.DB_PATH = db_path

    from database import get_db, init_db

    await init_db()

    async with get_db() as db:
        yield db


@pytest_asyncio.fixture
async def client(test_db):
    """Async HTTP client for testing FastAPI endpoints."""
    from main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
