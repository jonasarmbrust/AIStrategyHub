"""
Central configuration for AI Strategy Hub.
Loads environment variables and defines common paths.
"""

import os
import shutil
from pathlib import Path

from dotenv import load_dotenv
from fastapi import HTTPException

# ── Version ───────────────────────────────────────────────────────────────────

__version__ = "2.0.1"

# ── AI Model Configuration ───────────────────────────────────────────────────
# Centralized model names — override via environment variables.

GEMINI_MODEL_REASONING = os.getenv("GEMINI_MODEL_REASONING", "gemini-2.5-pro")
GEMINI_MODEL_FAST = os.getenv("GEMINI_MODEL_FAST", "gemini-2.5-flash")
GEMINI_MODEL_EMBEDDING = os.getenv("GEMINI_MODEL_EMBEDDING", "gemini-embedding-exp-03-07")

# ── SSRF Protection ──────────────────────────────────────────────────────────

MAX_REDIRECTS = int(os.getenv("MAX_REDIRECTS", "5"))

# ── Paths ─────────────────────────────────────────────────────────────────────

BASE_DIR = Path(__file__).resolve().parent.parent
BACKEND_DIR = BASE_DIR / "backend"
FRONTEND_DIR = BASE_DIR / "frontend"
DATA_DIR = BASE_DIR / "data"

UPLOAD_DIR = DATA_DIR / "uploads"
EMBEDDINGS_DIR = DATA_DIR / "embeddings"
DB_PATH = DATA_DIR / "strategy_hub.db"

# The bundled (read-only) copy lives inside the backend source tree.
# On Cloud Run / Docker the source tree is read-only, so we work with
# a writable copy in DATA_DIR instead.
_DIMENSIONS_SOURCE = BACKEND_DIR / "knowledge_base" / "dimensions.json"
_DIMENSIONS_WRITABLE = DATA_DIR / "dimensions.json"

# Ensure data directories exist
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
EMBEDDINGS_DIR.mkdir(parents=True, exist_ok=True)

# Bootstrap: copy bundled dimensions.json → writable location on first run
if not _DIMENSIONS_WRITABLE.exists() and _DIMENSIONS_SOURCE.exists():
    shutil.copy2(_DIMENSIONS_SOURCE, _DIMENSIONS_WRITABLE)

DIMENSIONS_PATH = _DIMENSIONS_WRITABLE if _DIMENSIONS_WRITABLE.exists() else _DIMENSIONS_SOURCE


# ── Environment Variables ─────────────────────────────────────────────────────

load_dotenv(BASE_DIR / ".env")

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
TAVILY_API_KEY = os.getenv("TAVILY_API_KEY", "").strip()

MAX_UPLOAD_SIZE_MB = int(os.getenv("MAX_UPLOAD_SIZE_MB", "50"))
MAX_UPLOAD_SIZE_BYTES = MAX_UPLOAD_SIZE_MB * 1024 * 1024

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

# ── Evolution Agent ───────────────────────────────────────────────────────────
EVOLUTION_ENABLED = os.getenv("EVOLUTION_ENABLED", "true").lower() == "true"
EVOLUTION_SCHEDULE = os.getenv("EVOLUTION_SCHEDULE", "weekly")  # weekly, daily, manual
EVOLUTION_DAY = os.getenv("EVOLUTION_DAY", "mon")
EVOLUTION_HOUR = int(os.getenv("EVOLUTION_HOUR", "3"))
EVOLUTION_AUTO_INTEGRATE = os.getenv("EVOLUTION_AUTO_INTEGRATE", "true").lower() == "true"
EVOLUTION_MIN_QUALITY = float(os.getenv("EVOLUTION_MIN_QUALITY", "0.7"))
EVOLUTION_REDUNDANCY_THRESHOLD = float(os.getenv("EVOLUTION_REDUNDANCY_THRESHOLD", "0.82"))

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
