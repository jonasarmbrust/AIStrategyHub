# 🔷 AI Strategy Hub

**Assess, analyze, and optimize your organization's AI maturity — powered by the OAIMM (Open AI Maturity Meta-Model) framework.**

AI Strategy Hub is a full-stack AI strategy assessment platform that synthesizes best practices from **6 globally recognized frameworks** (NIST AI RMF, EU AI Act, Google, Microsoft, OWASP, UNESCO) into a unified, actionable maturity model with 7 dimensions and 69+ checkpoints.

---

## ✨ Key Features

### 🧠 AI Strategy Advisor
An interactive chatbot powered by **Gemini 3.1 Pro** that acts as your personal AI strategy consultant. It knows your current assessment scores, gaps, and research sources — and provides actionable, context-aware advice grounded in the OAIMM framework.

### 📊 Maturity Assessment
Interactive checklist across 7 dimensions with automated scoring, level classification (1-5), and radar chart visualization. Checkpoints are traced to their original framework source for full transparency.

### 🔍 Document Analyzer (RAG Pipeline)
Upload your AI strategy documents (PDF, DOCX, TXT) — the RAG pipeline uses ChromaDB embeddings + Gemini to check them against all checkpoints. Each checkpoint receives a coverage verdict with confidence score and evidence.

### 🔬 Research Agent
Automated AI-powered research using Tavily API. Discovers new frameworks, regulations, and best practices — automatically evaluated for relevance to your maturity model.

### 🏗️ Framework Builder
Extract novel checkpoints from any research document and integrate them into the living OAIMM meta-model. The framework evolves as you feed it new knowledge.

### ⚖️ EU AI Act Compliance Engine
Maps your assessment gaps directly to EU AI Act requirements. Shows compliance readiness score, regulatory exposure level, and links gaps to specific EU AI Act articles with fine amounts.

### 🎮 Gap Simulator ("What-If Analysis")
Interactive score simulation — toggle unfulfilled checkpoints and see the exact impact on your maturity score in real-time. Discover which actions have the highest ROI.

### 🗺️ Strategic Roadmap
AI-generated prioritized action plan based on your gaps, with effort estimates, quick wins, and milestone recommendations.

### 📄 Executive PDF Report
Generate a branded AI Maturity Executive Briefing powered by Gemini 3.1 Pro. Download as PDF with score breakdown, recommendations, and strategic narrative.

### 🧭 Meta Strategy (Do's & Don'ts)
Comprehensive best-practice guide for each dimension with Do's, Don'ts, and what each framework says — complete with severity ratings and maturity level requirements.

---

## 🏗️ Architecture

```
┌─────────────────────────────────────┐
│     Frontend (Vite + Vanilla JS)    │
│  ┌──────┐ ┌──────┐ ┌──────┐        │
│  │Assess│ │Explor│ │Analyz│  ...    │
│  └──┬───┘ └──┬───┘ └──┬───┘        │
└─────┼────────┼────────┼─────────────┘
      │        │        │
      ▼        ▼        ▼
┌─────────────────────────────────────┐
│      Backend (FastAPI + Python)     │
│  ┌────────┐ ┌────────┐ ┌────────┐  │
│  │Checklist│ │Analysis│ │Advisor │  │
│  │ Router  │ │ Router │ │ Router │  │
│  └────┬───┘ └───┬────┘ └───┬────┘  │
│       │         │          │        │
│  ┌────▼─────────▼──────────▼────┐   │
│  │      Gemini AI Layer         │   │
│  │  3.1 Pro | 2.5 Flash | Embed │   │
│  └──────────────┬───────────────┘   │
│                 │                   │
│  ┌──────────────▼───────────────┐   │
│  │   Data Layer                 │   │
│  │  SQLite │ ChromaDB │ JSON    │   │
│  └──────────────────────────────┘   │
└─────────────────────────────────────┘
```

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Vite, Vanilla JS, Chart.js, jsPDF |
| **Backend** | Python, FastAPI, Uvicorn |
| **AI Models** | Gemini 3.1 Pro (reasoning), Gemini 2.5 Flash (batch), Gemini Embedding |
| **Vector DB** | ChromaDB (document embeddings) |
| **Database** | SQLite (assessments, analyses, research) |
| **Research** | Tavily API (web search agent) |
| **Design** | Custom CSS, Glassmorphism, Dark Mode |

---

## 🚀 Quick Start

### Prerequisites
- Python 3.12+
- Node.js 18+
- Gemini API Key ([Get one here](https://aistudio.google.com/app/apikey))
- Tavily API Key ([Get one here](https://tavily.com))

### Setup

```bash
# Clone the repository
git clone https://github.com/yourusername/AIStrategyHub.git
cd AIStrategyHub

# Backend setup
cd backend
pip install -r requirements.txt

# Create .env file
echo "GEMINI_API_KEY=your_key_here" > ../.env
echo "TAVILY_API_KEY=your_key_here" >> ../.env

# Frontend setup
cd ../frontend
npm install
npm run build

# Start the application
cd ../backend
python -m uvicorn main:app --port 8000
```

Then open **http://localhost:8000** in your browser.

---

## 📊 The OAIMM Framework

The **Open AI Maturity Meta-Model** synthesizes 6 globally recognized frameworks into 7 unified dimensions:

| Dimension | Weight | Focus |
|-----------|--------|-------|
| 🎯 Strategy & Leadership | 15% | Executive sponsorship, AI-business alignment, investment roadmap |
| 🗄️ Data & Infrastructure | 20% | Data governance, quality, lineage, scalable infrastructure |
| ⚖️ Governance & Compliance | 15% | AI risk management, EU AI Act, audit & documentation |
| ⚙️ Technology & MLOps | 15% | CI/CD for ML, monitoring, versioning, deployment |
| 👥 Talent & Culture | 10% | AI literacy, cross-functional teams, training programs |
| 🛡️ Ethics & Responsible AI | 15% | Bias testing, explainability, privacy, human oversight |
| 🔄 Processes & Scaling | 10% | Pilot-to-production, change management, platformization |

### Maturity Levels

| Level | Name | Score Range |
|-------|------|-------------|
| 1 | Initial | 0-24% |
| 2 | Developing | 25-49% |
| 3 | Defined | 50-69% |
| 4 | Managed | 70-89% |
| 5 | Optimizing | 90-100% |

---

## 📁 Project Structure

```
AIStrategyHub/
├── backend/
│   ├── main.py                 # FastAPI entry point
│   ├── database.py             # SQLite async database
│   ├── api/routes/
│   │   ├── advisor.py          # AI Strategy Advisor chat
│   │   ├── analysis.py         # Document analysis + evidence
│   │   ├── checklist.py        # Assessment CRUD
│   │   ├── dashboard.py        # Stats & history
│   │   ├── export.py           # PDF/Markdown reports
│   │   ├── framework.py        # Framework Builder
│   │   ├── ingest.py           # Source ingestion
│   │   ├── research.py         # Research Agent
│   │   └── roadmap.py          # Strategic roadmap
│   ├── analyzer/               # RAG evaluator pipeline
│   ├── knowledge_base/         # Maturity model & scoring
│   ├── models/                 # Pydantic schemas
│   └── research/               # Tavily search agent
├── frontend/
│   ├── index.html              # SPA shell + navigation
│   └── src/
│       ├── main.js             # Router + API client
│       ├── styles/index.css    # Design system (1900+ lines)
│       └── pages/
│           ├── advisor.js      # AI Strategy Advisor chat UI
│           ├── analyzer.js     # Document Analyzer
│           ├── checklist.js    # Assessment + Evidence Chain
│           ├── dashboard.js    # Dashboard + Trend Chart
│           ├── explorer.js     # Framework Explorer
│           ├── eu_ai_act.js    # EU AI Act Engine
│           ├── framework_builder.js
│           ├── meta_strategy.js
│           ├── report.js       # Executive Report + PDF
│           ├── research.js     # Research Agent
│           ├── roadmap.js      # Strategic Roadmap
│           └── simulator.js    # Gap Simulator
└── data/
    ├── strategy_hub.db         # SQLite database
    └── dimensions.json         # OAIMM framework definition
```

---

## 🔑 Data Flow

```
Research Agent → finds sources → Document Analyzer → evaluates checkpoints
                                                          ↓
Framework Builder ← extracts novel checkpoints ← Research sources
        ↓
  dimensions.json (living meta-model)
        ↓
  Assessment (pre-filled by AI) → Score calculation → EU AI Act mapping
        ↓                                                    ↓
   Roadmap Generator ← compliance gaps ← EU AI Act Engine
        ↓
   AI Strategy Advisor (knows everything)
        ↓
   Executive PDF Report
```

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

---

<p align="center">
  <strong>AI Strategy Hub</strong> — Built with Gemini, FastAPI, and a lot of ☕<br>
  <em>Assess. Analyze. Optimize.</em>
</p>
