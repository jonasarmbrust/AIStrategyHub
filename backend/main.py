"""
AI Strategy Hub
FastAPI Backend — Main application entry point.
"""

from __future__ import annotations

import logging
import sys
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

# Ensure backend package is on path
sys.path.insert(0, str(Path(__file__).parent))

# Load config (also loads .env)
from config import AUTH_ENABLED, LOG_LEVEL, RATE_LIMIT_DEFAULT
from api.routes import advisor, analysis, checklist, dashboard, evolution, export, framework, ingest, research, roadmap
from database import init_db
from middleware.auth import APIKeyMiddleware
from middleware.errors import register_error_handlers


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifecycle: init DB and setup logging on startup."""
    logging.basicConfig(
        level=getattr(logging, LOG_LEVEL, logging.INFO),
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        handlers=[logging.StreamHandler(sys.stdout)]
    )
    log = logging.getLogger("startup")
    log.info("Starting AI Strategy Hub backend...")
    log.info(f"Auth: {'ENABLED' if AUTH_ENABLED else 'DISABLED (no API_AUTH_KEY set)'}")
    await init_db()

    # Migrate existing JSON embedding files to SQLite (one-time)
    from analyzer.embedder import migrate_json_to_sqlite
    await migrate_json_to_sqlite()

    # Clean up any evolution runs left in 'running' state from previous crash/restart
    from database import get_db
    async with get_db() as db:
        cursor = await db.execute(
            "SELECT id FROM evolution_runs WHERE status = 'running'"
        )
        stuck_runs = await cursor.fetchall()
        if stuck_runs:
            await db.execute(
                "UPDATE evolution_runs SET status = 'interrupted', "
                "error = 'Server was restarted while this run was in progress', "
                "completed_at = CURRENT_TIMESTAMP "
                "WHERE status = 'running'"
            )
            stuck_ids = [r["id"] for r in stuck_runs]
            log.warning(f"Cleaned up {len(stuck_ids)} interrupted evolution runs: {stuck_ids}")

    # Start Evolution Agent scheduler
    from evolution.scheduler import setup_evolution_scheduler, shutdown_evolution_scheduler
    setup_evolution_scheduler(app)

    yield

    # Shutdown Evolution Agent scheduler
    shutdown_evolution_scheduler()
    from database import close_db
    await close_db()
    logging.info("Database connection closed")
    logging.info("Shutting down AI Strategy Hub backend...")


app = FastAPI(
    title="AI Strategy Hub",
    description="Open AI Maturity Meta-Model — Assess your organization's AI readiness based on synthesized global best practices.",
    version="1.0.0",
    lifespan=lifespan,
)

# ── Middleware Stack (order matters: first added = outermost) ─────────────────

# 1. CORS for local Vite dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 2. Auth middleware (only active when API_AUTH_KEY is set)
app.add_middleware(APIKeyMiddleware)

# 3. Rate limiting
try:
    from slowapi import Limiter, _rate_limit_exceeded_handler
    from slowapi.util import get_remote_address
    from slowapi.errors import RateLimitExceeded
    from slowapi.middleware import SlowAPIMiddleware

    limiter = Limiter(key_func=get_remote_address, default_limits=[RATE_LIMIT_DEFAULT])
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
    app.add_middleware(SlowAPIMiddleware)

    from middleware.rate_limit import set_limiter
    set_limiter(limiter)
except ImportError:
    logging.warning("slowapi not installed — rate limiting disabled. Install: pip install slowapi")
    limiter = None

# 4. Error handlers
register_error_handlers(app)

# ── Routes ───────────────────────────────────────────────────────────────────

app.include_router(checklist.router, prefix="/api/checklist", tags=["Checklist"])
app.include_router(analysis.router, prefix="/api/analysis", tags=["Analysis"])
app.include_router(research.router, prefix="/api/research", tags=["Research"])
app.include_router(ingest.router, prefix="/api/ingest", tags=["Source Ingestion"])
app.include_router(roadmap.router, prefix="/api/roadmap", tags=["Roadmap"])
app.include_router(export.router, prefix="/api/export", tags=["Export"])
app.include_router(dashboard.router, prefix="/api/dashboard", tags=["Dashboard"])
app.include_router(framework.router, prefix="/api/framework", tags=["Framework Builder"])
app.include_router(advisor.router, prefix="/api/advisor", tags=["AI Strategy Advisor"])
app.include_router(evolution.router, prefix="/api/evolution", tags=["Evolution Agent"])


@app.get("/api/health")
async def health_check():
    return {
        "status": "ok",
        "service": "AI Strategy Hub",
        "version": "1.0.0",
        "auth_enabled": AUTH_ENABLED,
    }


# Serve static frontend files if they exist (for production/Docker)
frontend_dist = Path(__file__).parent.parent / "frontend" / "dist"
if frontend_dist.exists() and frontend_dist.is_dir():
    app.mount("/assets", StaticFiles(directory=str(frontend_dist / "assets")), name="assets")
    
    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        # Allow requests to /api to pass through to 404 if not matched above
        if full_path.startswith("api/"):
            raise HTTPException(404, "Not Found")
        
        # Serve index.html for all other routes to support SPA client-side routing
        index_path = frontend_dist / "index.html"
        if index_path.exists():
            return FileResponse(
                str(index_path),
                headers={"Cache-Control": "no-cache, no-store, must-revalidate"},
            )
        return {"detail": "Frontend build not found"}
