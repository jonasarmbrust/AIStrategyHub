"""
Shared test fixtures for AI Strategy Hub backend tests.
"""

import asyncio
import sys
from pathlib import Path

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport

# Ensure backend is importable
sys.path.insert(0, str(Path(__file__).parent.parent))

# Override DB to use in-memory SQLite BEFORE importing app
import config
config.DB_PATH = Path(":memory:")  # won't actually be used — we override get_db

import aiosqlite
from main import app
from database import init_db, get_db, _db_lock


@pytest.fixture(scope="session")
def event_loop():
    """Create a session-scoped event loop."""
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture
async def test_db(tmp_path):
    """Create a fresh test database for each test."""
    import database
    db_path = tmp_path / "test.db"
    
    # Override the module-level connection
    database._db_connection = None
    config.DB_PATH = db_path
    
    await init_db()
    
    yield await get_db()
    
    # Cleanup
    if database._db_connection:
        await database._db_connection.close()
        database._db_connection = None


@pytest_asyncio.fixture
async def client(test_db):
    """Async HTTP client for testing FastAPI endpoints."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
