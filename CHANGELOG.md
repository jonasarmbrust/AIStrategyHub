# Changelog

All notable changes to AI Strategy Hub will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [2.0.0] — 2026-05-28 — "The Living Framework"

### 🧬 Evolution Engine — Autonomous Framework Evolution
- **Evolution Dashboard**: Full-featured control center for monitoring and managing autonomous framework evolution — status bar, KPI cards, timeline, growth charts, and pending proposals queue
- **Automated Research Pipeline**: The Evolution Engine triggers Tavily-powered web research, discovers new AI governance frameworks and regulations, then evaluates them with Gemini against all existing checkpoints
- **AI-Powered Checkpoint Proposals**: Gemini generates concrete new checkpoint proposals with dimension assignment, maturity level, source attribution, justification, and quality scores
- **Redundancy Scanner**: Embedding-based semantic deduplication detects overlapping checkpoints using cosine similarity and flags them for merging
- **Human-in-the-Loop Review**: All AI-generated proposals are queued for human approval/rejection before integration — full transparency and control
- **Scheduled Autonomy**: Configurable cron-like scheduling (default: weekly) — the framework evolves on autopilot while you review
- **Framework Growth Tracking**: Stacked chart visualization showing checkpoint count growth per dimension over time

### 📋 AI Strategy Playbook
- **Phased Implementation Roadmap**: Transforms maturity assessment into a 5-phase actionable plan (Foundation → Experimentation → Operationalization → Scaling → Transformation)
- Per-phase duration estimates, key focus areas, dimension-filtered checkpoints, and progress tracking
- Color-coded phase indicators with progress bars

### 🔬 AI Deep Dives
- Per-checkpoint detailed analysis powered by Gemini
- In-depth implementation guidance and best practices from source frameworks
- Connected from EU AI Act compliance gaps ("Fix via AI Deep Dive")

### 🏗️ Framework Expansion
- Framework grown from **101 → 226 checkpoints** via the Evolution Engine
- Automatic dimension weight recalculation on checkpoint changes
- `CrossProcessFileLock` for safe concurrent writes to `dimensions.json`

### ⚡ Architecture Expansion
- **12 API routers** (from 9) with **50+ endpoints** (from 30+)
- **16 frontend pages** (from 13): Evolution Dashboard, AI Playbook, AI Deep Dive
- Enhanced Research Agent now serves as the input pipeline for the Evolution Engine
- Framework Builder integrated with evolution pipeline for atomic checkpoint merging

### 🧪 Testing
- **29 tests** covering health, scoring, checklist, analysis, security hardening, and database concurrency

---

## [1.0.0] — 2026-04-24

### 🎉 Initial Public Release

The first open-source release of AI Strategy Hub — a full-stack AI maturity assessment platform synthesizing 6 global standards into one actionable framework.

### ✨ Core Features
- **AI Strategy Advisor**: Interactive chat with context-aware Gemini 3.1 Pro consultant
- **Maturity Assessment**: Interactive checklist across 7 weighted dimensions (101 checkpoints)
- **Document Analyzer (RAG)**: Upload strategy docs — AI evaluates all checkpoints with confidence scoring
- **EU AI Act Compliance Engine**: Gap-to-regulation mapping with fine amounts and risk levels
- **Gap Simulator**: Real-time "What-If" analysis for maturity score impact
- **Strategic Roadmap**: AI-generated prioritized action plans with effort estimates
- **Executive PDF Report**: Gemini-powered branded maturity briefing
- **Meta Strategy**: Do's & Don'ts per dimension from all 6 source frameworks
- **Research Agent**: Tavily-powered automated web research with relevance scoring
- **Framework Builder**: Extract and integrate novel checkpoints from research documents
- **Full Bilingual Support**: English / German — all UI, reports, and AI responses

### 🔒 Security
- XSS protection via DOMPurify across all 13 frontend pages
- Optional API key authentication middleware
- Rate limiting with slowapi (configurable per-endpoint)
- Standardized error responses

### ⚡ Performance
- Checkpoint batching: 5 per LLM call (~80% API cost reduction)
- SQLite singleton connection pool with WAL mode
- Semaphore-bounded concurrent evaluation

### 🏗️ Architecture
- Full-stack: Vite + Vanilla JS frontend, FastAPI + Python backend
- Centralized config module with dependency injection
- Modular middleware stack (auth, errors, rate limiting)
- Docker multi-stage build for one-command deployment
- 21 pytest tests covering health, scoring, checklist, and analysis
- GitHub Actions CI/CD pipeline
- Alembic database migrations
