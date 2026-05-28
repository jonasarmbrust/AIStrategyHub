"""
SQLite database initialization and access for the AI Strategy Hub.
Stores analysis history, research sources, and manual assessments.

Uses a singleton connection pattern with async lock for thread safety.
"""

from __future__ import annotations

import asyncio
import logging

import aiosqlite

from config import DB_PATH

log = logging.getLogger("database")

_db_connection: aiosqlite.Connection | None = None
_db_lock = asyncio.Lock()


async def get_db() -> aiosqlite.Connection:
    """
    Get a shared async SQLite connection (singleton pattern).
    
    SQLite only supports one writer at a time, so we reuse a single
    connection instead of creating a new one per request.
    The connection is guarded by an asyncio.Lock for thread safety.
    """
    global _db_connection

    async with _db_lock:
        if _db_connection is None or not isinstance(_db_connection, aiosqlite.Connection):
            DB_PATH.parent.mkdir(parents=True, exist_ok=True)
            _db_connection = await aiosqlite.connect(str(DB_PATH))
            _db_connection.row_factory = aiosqlite.Row
            await _db_connection.execute("PRAGMA journal_mode=WAL")
            await _db_connection.execute("PRAGMA busy_timeout=5000")
            await _db_connection.execute("PRAGMA foreign_keys = ON")
            log.info(f"Database connection opened: {DB_PATH}")
        
        # Test connection is alive
        try:
            await _db_connection.execute("SELECT 1")
        except Exception:
            log.warning("Database connection lost, reconnecting...")
            try:
                await _db_connection.close()
            except Exception:
                pass
            _db_connection = await aiosqlite.connect(str(DB_PATH))
            _db_connection.row_factory = aiosqlite.Row
            await _db_connection.execute("PRAGMA journal_mode=WAL")
            await _db_connection.execute("PRAGMA busy_timeout=5000")
            await _db_connection.execute("PRAGMA foreign_keys = ON")

    return _db_connection


async def close_db():
    """Close the database connection (for shutdown)."""
    global _db_connection
    if _db_connection:
        await _db_connection.close()
        _db_connection = None
        log.info("Database connection closed")


async def init_db():
    """Initialize database tables."""
    db = await get_db()
    await db.executescript("""
        CREATE TABLE IF NOT EXISTS analyses (
            id TEXT PRIMARY KEY,
            document_name TEXT NOT NULL,
            file_type TEXT,
            overall_score REAL DEFAULT 0,
            overall_level INTEGER DEFAULT 1,
            dimension_scores TEXT DEFAULT '[]',
            strengths TEXT DEFAULT '[]',
            gaps TEXT DEFAULT '[]',
            recommendations TEXT DEFAULT '[]',
            evaluations TEXT DEFAULT '[]',
            executive_summary TEXT DEFAULT '',
            status TEXT DEFAULT 'pending',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            completed_at TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS research_sources (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            url TEXT UNIQUE NOT NULL,
            summary TEXT,
            category TEXT DEFAULT 'article',
            relevant_dimensions TEXT DEFAULT '[]',
            published_date TEXT,
            discovered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            is_read INTEGER DEFAULT 0,
            relevance_score REAL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS manual_assessments (
            id TEXT PRIMARY KEY,
            assessments TEXT NOT NULL,
            overall_score REAL DEFAULT 0,
            overall_level INTEGER DEFAULT 1,
            dimension_scores TEXT DEFAULT '[]',
            strengths TEXT DEFAULT '[]',
            gaps TEXT DEFAULT '[]',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS framework_activity (
            id TEXT PRIMARY KEY,
            action TEXT NOT NULL,
            source_id TEXT,
            checkpoint_id TEXT,
            dimension_id TEXT,
            details TEXT DEFAULT '{}',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS evolution_runs (
            id TEXT PRIMARY KEY,
            started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            completed_at TIMESTAMP,
            status TEXT DEFAULT 'running',
            sources_scanned INTEGER DEFAULT 0,
            sources_qualified INTEGER DEFAULT 0,
            checkpoints_proposed INTEGER DEFAULT 0,
            checkpoints_integrated INTEGER DEFAULT 0,
            redundancies_found INTEGER DEFAULT 0,
            redundancies_resolved INTEGER DEFAULT 0,
            config TEXT DEFAULT '{}',
            log TEXT DEFAULT '[]',
            error TEXT
        );

        CREATE TABLE IF NOT EXISTS evolution_proposals (
            id TEXT PRIMARY KEY,
            run_id TEXT REFERENCES evolution_runs(id) ON DELETE CASCADE,
            source_id TEXT,
            source_title TEXT,
            source_url TEXT,
            proposal_type TEXT DEFAULT 'new_checkpoint',
            dimension_id TEXT,
            checkpoint_data TEXT DEFAULT '{}',
            quality_score REAL DEFAULT 0,
            impact_score REAL DEFAULT 0,
            novelty_score REAL DEFAULT 0,
            status TEXT DEFAULT 'pending',
            reviewed_at TIMESTAMP,
            integrated_checkpoint_id TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS framework_snapshots (
            id TEXT PRIMARY KEY,
            run_id TEXT REFERENCES evolution_runs(id) ON DELETE CASCADE,
            snapshot_data TEXT,
            checkpoint_count INTEGER,
            version_tag TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)
    await db.commit()
    log.info("Database initialized successfully")
