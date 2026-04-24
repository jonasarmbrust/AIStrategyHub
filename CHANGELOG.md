# Changelog

All notable changes to AI Strategy Hub will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [2.1.0] — 2026-04-24

### 🔒 Security — Production Hardening
- **XSS Protection**: DOMPurify integration across all 13 frontend pages with sanitized LLM content rendering
- **API Authentication**: Optional `X-API-Key` header middleware with configurable key and localhost bypass
- **Rate Limiting**: slowapi integration with configurable per-endpoint limits (default: 60/min, LLM: 5/min)
- **Error Standardization**: Unified JSON error responses (`{"error": str, "code": str}`) across all endpoints

### ⚡ Performance
- **Checkpoint Batching**: Evaluator now processes 5 checkpoints per LLM call instead of 1 (~80% API cost reduction, ~21 calls vs. 101)
- **DB Connection Pool**: Singleton connection pattern with asyncio.Lock, WAL mode, and auto-reconnect
- **Concurrent Evaluation**: Semaphore-bounded parallel batch processing (max 3 concurrent API calls)

### 🧪 Testing & Quality
- **Test Suite**: 21 pytest tests covering health, scoring engine, checklist API, and document analysis
- **CI/CD**: GitHub Actions pipeline with backend tests, frontend build, and Docker image build
- **Alembic Migrations**: Database migration framework with initial schema

### 🏗️ Architecture
- **Centralized Config**: New `config.py` module replacing scattered env variable access
- **Middleware Stack**: Modular `middleware/` package (auth, errors, rate_limit)
- **Embedder Abstraction**: Prepared for Chroma/Qdrant migration via clean interface
- **Logging**: Centralized logging configuration with configurable levels

---

## [2.0.0] — 2026-04-15

### ✨ Major Features
- **AI Strategy Advisor**: Interactive chat with context-aware Gemini 3.1 Pro consultant
- **Document Analyzer (RAG)**: Full pipeline — upload, chunk, embed, evaluate against all 101 checkpoints
- **EU AI Act Compliance Engine**: Gap-to-regulation mapping with fine amounts and risk levels
- **Gap Simulator**: Real-time "What-If" analysis for maturity score impact
- **Strategic Roadmap**: AI-generated prioritized action plans with effort estimates
- **Executive PDF Report**: Gemini-powered branded maturity briefing
- **Meta Strategy**: Do's & Don'ts per dimension from all 6 source frameworks
- **Research Agent**: Tavily-powered automated research with relevance scoring
- **Framework Builder**: Extract and integrate novel checkpoints from research documents

### 🌍 Internationalization
- Full bilingual support (English / German) — all UI, reports, and AI responses

### 📊 Framework
- 7 unified dimensions with configurable weights
- 101 checkpoints synthesized from 6 global standards
- 5-level maturity classification with evidence-based scoring

### 🏗️ Infrastructure
- Full-stack: Vite + Vanilla JS frontend, FastAPI + Python backend
- SQLite with async access (aiosqlite)
- Docker multi-stage build
- Custom CSS design system (2300+ LOC, glassmorphism, dark mode)

---

## [1.0.0] — 2026-04-14

### 🎉 Initial Release
- Core maturity model with 7 dimensions
- Manual checklist assessment with automated scoring
- Basic document analysis pipeline
- Source framework attribution (NIST, EU AI Act, Google, Microsoft, OWASP, UNESCO)
