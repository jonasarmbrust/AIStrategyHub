"""LLM prompt templates for the evolution system.

Contains all multi-line prompt strings used by the Evolution Agent
for quality assessment, checkpoint extraction, and related LLM calls.
"""

# ── Quality Assessment Prompt ─────────────────────────────────────────────

QUALITY_ASSESSMENT_PROMPT = """You are an AI Strategy Research Quality Assessor.
Evaluate this source for potential integration into an enterprise AI Maturity Framework.

## Source
Title: {title}
URL: {url}
Content (excerpt):
{content}

## Evaluation Criteria (each 0.0 to 1.0):
1. **scientific_rigor**: Is the source peer-reviewed, from a reputable institution, methodologically sound?
2. **practical_applicability**: Does it provide actionable guidelines for enterprises?
3. **novelty**: Does it introduce concepts not already in typical AI maturity frameworks?
4. **source_authority**: Is it from authoritative sources (NIST, EU, Google, Microsoft, IEEE, ACM, etc.)?
5. **recency**: Is it from the last 2 years (2024-2026)?
6. **framework_relevance**: How well does it align with AI maturity assessment for enterprises?

## Current Framework Dimensions
{dimension_context}

Respond in valid JSON:
{{
    "scientific_rigor": 0.0-1.0,
    "practical_applicability": 0.0-1.0,
    "novelty": 0.0-1.0,
    "source_authority": 0.0-1.0,
    "recency": 0.0-1.0,
    "framework_relevance": 0.0-1.0,
    "quality_rationale": "Brief explanation of the overall assessment"
}}"""


# ── Checkpoint Extraction Prompt ──────────────────────────────────────────

CHECKPOINT_EXTRACTION_PROMPT = """You are a Master Enterprise Architecture and AI Strategy expert.
Your job is to read a newly discovered Industry Framework or Research Article, compare it to our existing Master Meta-Model, and extract NOVEL strategic checkpoints/guidelines that our Meta-Model is currently missing.

EXISTING META-MODEL:
{meta_model_context}

NEW RESEARCH SOURCE ({title}):
URL: {url}
Content:
{content}

INSTRUCTIONS:
1. Identify up to 5 distinct, highly-valuable strategic rules, processes, or guidelines mentioned in the document that are NOT covered in our existing checkpoints.
2. Formulate them as formal Checkpoints in English and German.
3. Assign them to the most appropriate existing dimension_id: {dim_ids}.
4. Give a brief rationale for why this is missing and valuable.
5. Only propose truly novel checkpoints — skip anything already covered.

Respond EXACTLY in this JSON format:
{{
  "proposals": [
    {{
      "dimension_id": "governance",
      "text": "English Guideline...",
      "text_de": "German Translation...",
      "min_level": 3,
      "category": "Risk Management",
      "sources": ["{title}"],
      "rationale": "Why we need this..."
    }}
  ]
}}"""


# ── Dimension-specific search queries for academic/deep research ──────────

EVOLUTION_QUERIES = {
    "strategy": [
        "AI strategy maturity framework enterprise 2025 2026",
        "site:arxiv.org AI organizational strategy assessment",
        "AI strategic planning maturity model research paper",
    ],
    "data": [
        "AI data governance maturity assessment framework",
        "site:arxiv.org data quality AI pipeline enterprise",
        "data strategy artificial intelligence readiness",
    ],
    "governance": [
        "AI governance risk management framework 2025 2026",
        "EU AI Act compliance maturity assessment",
        "site:arxiv.org AI risk governance enterprise",
    ],
    "technology": [
        "MLOps maturity model enterprise deployment 2025",
        "site:arxiv.org MLOps CI/CD AI production",
        "AI infrastructure scalability assessment framework",
    ],
    "talent": [
        "AI workforce skills maturity assessment enterprise",
        "AI talent development organizational readiness",
        "site:arxiv.org AI literacy training workforce",
    ],
    "ethics": [
        "responsible AI maturity framework assessment 2025",
        "AI ethics fairness transparency accountability",
        "site:arxiv.org responsible AI governance enterprise",
    ],
    "processes": [
        "AI scaling enterprise production maturity 2025",
        "AI change management organizational transformation",
        "site:arxiv.org AI adoption lifecycle enterprise",
    ],
}
