"""
SQLite database initialization and access for the AI Strategy Hub.
Stores analysis history, research sources, and manual assessments.
"""

from __future__ import annotations

import aiosqlite
import os
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / "data" / "strategy_hub.db"


async def get_db() -> aiosqlite.Connection:
    """Get an async SQLite connection."""
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    db = await aiosqlite.connect(str(DB_PATH))
    db.row_factory = aiosqlite.Row
    return db


async def init_db():
    """Initialize database tables."""
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    async with aiosqlite.connect(str(DB_PATH)) as db:
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
        """)
        await db.commit()
