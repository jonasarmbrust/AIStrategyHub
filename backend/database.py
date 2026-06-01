"""
SQLite database initialization and access for the AI Strategy Hub.
Stores analysis history, research sources, and manual assessments.

Uses a connection-per-request pattern with async context manager
for automatic commit/rollback and connection lifecycle management.

Supports two call patterns during migration:
  - New: ``async with get_db() as db:``  (preferred, auto commit/rollback)
  - Legacy: ``db = await get_db()``       (caller must commit/close manually)
"""

from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager

import aiosqlite

from config import DB_PATH

log = logging.getLogger("database")


async def _configure_connection(db: aiosqlite.Connection):
    """Apply PRAGMA settings to a new connection."""
    db.row_factory = aiosqlite.Row
    await db.execute("PRAGMA journal_mode=WAL")
    await db.execute("PRAGMA foreign_keys=ON")
    await db.execute("PRAGMA busy_timeout=5000")
    await db.execute("PRAGMA cache_size=-20000")


class _DBContextManager:
    """Dual-mode helper: works as both ``await get_db()`` and ``async with get_db() as db:``.

    * When used with ``async with``, the connection is automatically committed
      on success, rolled back on exception, and closed on exit.
    * When used with ``await``, the raw connection is returned and the caller
      is responsible for committing and closing it (legacy pattern).
    """

    __slots__ = ("_db",)

    def _ensure_dir(self):
        DB_PATH.parent.mkdir(parents=True, exist_ok=True)

    # ── async-with protocol ───────────────────────────────────────────
    async def __aenter__(self) -> aiosqlite.Connection:
        self._ensure_dir()
        self._db = await aiosqlite.connect(str(DB_PATH))
        await _configure_connection(self._db)
        return self._db

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        try:
            if exc_type is None:
                await self._db.commit()
            else:
                await self._db.rollback()
        finally:
            await self._db.close()
        return False  # never suppress exceptions

    # ── await protocol (legacy) ───────────────────────────────────────
    def __await__(self):
        return self._create_connection().__await__()

    async def _create_connection(self) -> aiosqlite.Connection:
        self._ensure_dir()
        db = await aiosqlite.connect(str(DB_PATH))
        await _configure_connection(db)
        return db


def get_db() -> _DBContextManager:
    """Return a helper that supports both ``async with`` and ``await`` call patterns.

    Preferred (new code)::

        async with get_db() as db:
            await db.execute(...)
            # auto-commit on success, auto-rollback on exception

    Legacy (existing callers)::

        db = await get_db()
        try:
            await db.execute(...)
            await db.commit()
        finally:
            await db.close()
    """
    return _DBContextManager()


async def close_db():
    """Shutdown hook (no-op with connection-per-request pattern).

    Kept for backward compatibility with the lifespan handler.
    """
    log.info("Database shutdown hook called (connection-per-request, nothing to close)")


async def init_db():
    """Initialize database tables."""
    async with get_db() as db:
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
                progress_pct REAL DEFAULT 0,
                progress_step TEXT DEFAULT '',
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

            CREATE TABLE IF NOT EXISTS checkpoint_embeddings (
                checkpoint_id TEXT PRIMARY KEY,
                text_hash TEXT NOT NULL,
                embedding BLOB NOT NULL,
                model TEXT DEFAULT 'gemini-embedding-2',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS document_embeddings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                collection_name TEXT NOT NULL,
                chunk_index INTEGER NOT NULL,
                text TEXT NOT NULL,
                section TEXT DEFAULT '',
                embedding BLOB NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(collection_name, chunk_index)
            );

            CREATE INDEX IF NOT EXISTS idx_doc_emb_collection
                ON document_embeddings(collection_name);

            CREATE INDEX IF NOT EXISTS idx_analyses_status ON analyses(status);
            CREATE INDEX IF NOT EXISTS idx_analyses_created ON analyses(created_at);
            CREATE INDEX IF NOT EXISTS idx_evolution_runs_status ON evolution_runs(status);
            CREATE INDEX IF NOT EXISTS idx_evolution_runs_started ON evolution_runs(started_at);
            CREATE INDEX IF NOT EXISTS idx_research_sources_discovered ON research_sources(discovered_at);
            CREATE INDEX IF NOT EXISTS idx_evolution_proposals_run ON evolution_proposals(run_id);
            CREATE INDEX IF NOT EXISTS idx_evolution_proposals_status ON evolution_proposals(status);
            CREATE INDEX IF NOT EXISTS idx_framework_activity_created ON framework_activity(created_at);
        """)

        # ── Migrations for existing databases ─────────────────────────
        # ALTER TABLE is idempotent-safe: we catch "duplicate column" errors
        migrations = [
            "ALTER TABLE analyses ADD COLUMN progress_pct REAL DEFAULT 0",
            "ALTER TABLE analyses ADD COLUMN progress_step TEXT DEFAULT ''",
        ]
        for sql in migrations:
            try:
                await db.execute(sql)
            except Exception as e:
                if "duplicate column" not in str(e).lower():
                    log.debug(f"Migration skipped: {e}")

    log.info("Database initialized successfully")
