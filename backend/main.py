"""
AI Strategy Hub — Powered by the OAIMM Framework
FastAPI Backend — Main application entry point.
"""

from __future__ import annotations

import os
import sys
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Ensure backend package is on path
sys.path.insert(0, str(Path(__file__).parent))

env_path = Path(__file__).parent.parent / ".env"
load_dotenv(env_path)
from api.routes import advisor, analysis, checklist, dashboard, export, framework, ingest, research, roadmap
from database import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifecycle: init DB on startup."""
    await init_db()
    yield


app = FastAPI(
    title="AI Strategy Hub",
    description="Open AI Maturity Meta-Model — Assess your organization's AI readiness based on synthesized global best practices.",
    version="2.0.0",
    lifespan=lifespan,
)

# CORS for local Vite dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register route modules
app.include_router(checklist.router, prefix="/api/checklist", tags=["Checklist"])
app.include_router(analysis.router, prefix="/api/analysis", tags=["Analysis"])
app.include_router(research.router, prefix="/api/research", tags=["Research"])
app.include_router(ingest.router, prefix="/api/ingest", tags=["Source Ingestion"])
app.include_router(roadmap.router, prefix="/api/roadmap", tags=["Roadmap"])
app.include_router(export.router, prefix="/api/export", tags=["Export"])
app.include_router(dashboard.router, prefix="/api/dashboard", tags=["Dashboard"])
app.include_router(framework.router, prefix="/api/framework", tags=["Framework Builder"])
app.include_router(advisor.router, prefix="/api/advisor", tags=["AI Strategy Advisor"])


@app.get("/api/health")
async def health_check():
    return {"status": "ok", "service": "AI Strategy Hub", "version": "2.0.0"}
