"""Initial schema

Revision ID: 001
Create Date: 2026-04-23
"""

from alembic import op

revision = "001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    """Create initial tables."""
    op.execute("""
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
    """)

    op.execute("""
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
    """)

    op.execute("""
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

    op.execute("""
        CREATE TABLE IF NOT EXISTS framework_activity (
            id TEXT PRIMARY KEY,
            action TEXT NOT NULL,
            source_id TEXT,
            checkpoint_id TEXT,
            dimension_id TEXT,
            details TEXT DEFAULT '{}',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)


def downgrade():
    """Drop all tables."""
    op.execute("DROP TABLE IF EXISTS framework_activity;")
    op.execute("DROP TABLE IF EXISTS manual_assessments;")
    op.execute("DROP TABLE IF EXISTS research_sources;")
    op.execute("DROP TABLE IF EXISTS analyses;")
