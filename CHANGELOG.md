# Changelog

All notable changes to AI Strategy Hub will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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
