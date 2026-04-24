"""
Central configuration for AI Strategy Hub.
Loads environment variables and defines common paths.
"""

import os
from pathlib import Path
from dotenv import load_dotenv
from fastapi import HTTPException

# ── Paths ─────────────────────────────────────────────────────────────────────

BASE_DIR = Path(__file__).resolve().parent.parent
BACKEND_DIR = BASE_DIR / "backend"
FRONTEND_DIR = BASE_DIR / "frontend"
DATA_DIR = BASE_DIR / "data"

UPLOAD_DIR = DATA_DIR / "uploads"
EMBEDDINGS_DIR = DATA_DIR / "embeddings"
DB_PATH = DATA_DIR / "strategy_hub.db"
DIMENSIONS_PATH = BACKEND_DIR / "knowledge_base" / "dimensions.json"

# Ensure data directories exist
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
EMBEDDINGS_DIR.mkdir(parents=True, exist_ok=True)


# ── Environment Variables ─────────────────────────────────────────────────────

load_dotenv(BASE_DIR / ".env")

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
TAVILY_API_KEY = os.getenv("TAVILY_API_KEY", "").strip()

# ── Auth ──────────────────────────────────────────────────────────────────────

API_AUTH_KEY = os.getenv("API_AUTH_KEY", "").strip()
AUTH_ENABLED = bool(API_AUTH_KEY)

# ── Rate Limiting ─────────────────────────────────────────────────────────────

def _normalize_rate_limit(value: str) -> str:
    """Ensure rate limit has a valid format like '60/minute'. Auto-fix bare numbers."""
    value = value.strip()
    if "/" not in value:
        # Bare number → assume per minute
        return f"{value}/minute"
    return value

RATE_LIMIT_DEFAULT = _normalize_rate_limit(os.getenv("RATE_LIMIT_DEFAULT", "60/minute"))
RATE_LIMIT_LLM = _normalize_rate_limit(os.getenv("RATE_LIMIT_LLM", "5/minute"))

# ── Logging ───────────────────────────────────────────────────────────────────

LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()

# ── Dependencies (FastAPI) ────────────────────────────────────────────────────

def require_gemini_key() -> str:
    """Dependency to enforce Gemini API key presence."""
    if not GEMINI_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="GEMINI_API_KEY is not configured. AI features are disabled."
        )
    return GEMINI_API_KEY

def require_tavily_key() -> str:
    """Dependency to enforce Tavily API key presence."""
    if not TAVILY_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="TAVILY_API_KEY is not configured. Research features are disabled."
        )
    return TAVILY_API_KEY
