"""
Research Agent — Searches for new AI strategy sources using Tavily API,
evaluates relevance with Gemini, and stores results.

Enhanced with synchronous mode, proper error feedback, and resilient search.
"""

from __future__ import annotations

import json
import os
import uuid
from datetime import datetime
from typing import Optional

from database import get_db
from knowledge_base.checklist_generator import get_maturity_model

_BASE_DIMENSION_QUERIES = {
    "strategy": "AI strategy leadership enterprise roadmap business alignment",
    "data": "AI data infrastructure governance quality pipeline enterprise",
    "governance": "AI governance compliance EU AI Act regulation risk management framework",
    "technology": "MLOps AI deployment pipeline monitoring production enterprise",
    "talent": "AI talent skills workforce training literacy organization culture",
    "ethics": "responsible AI ethics fairness bias transparency accountability",
    "processes": "AI scaling enterprise pilot to production change management",
}


def get_dimension_queries() -> dict[str, str]:
    """
    Dynamic queries enriched by framework_builder checkpoint additions.
    Creates a feedback loop: integrated checkpoints refine future research.
    """
    queries = dict(_BASE_DIMENSION_QUERIES)
    try:
        model = get_maturity_model()
        for dim in model.dimensions:
            # Find checkpoints added by framework_builder
            recent_cps = []
            for cp in dim.checkpoints:
                # Check raw dict access for added_by field
                if hasattr(cp, 'added_by') or (hasattr(cp, '__dict__') and cp.__dict__.get('added_by')):
                    recent_cps.append(cp)
            # Also check via model_extra or direct attribute
            if not recent_cps:
                # Fallback: scan dimensions.json directly for added_by markers
                import json
                from pathlib import Path
                dims_path = Path(__file__).parent.parent / "knowledge_base" / "dimensions.json"
                if dims_path.exists():
                    with open(dims_path, "r", encoding="utf-8") as f:
                        raw = json.load(f)
                    for raw_dim in raw.get("dimensions", []):
                        if raw_dim["id"] == dim.id:
                            for cp_raw in raw_dim.get("checkpoints", []):
                                if cp_raw.get("added_by") == "framework_builder":
                                    recent_cps.append(type('CP', (), {'text': cp_raw['text']})())
            if recent_cps:
                # Take keywords from up to 3 most recent additions
                extra_terms = []
                for cp in recent_cps[-3:]:
                    words = cp.text.split()[:6]
                    extra_terms.extend(words)
                if extra_terms:
                    queries[dim.id] = f"{queries.get(dim.id, '')} {' '.join(extra_terms)}"
    except Exception as e:
        print(f"[Research] Could not enrich queries from framework: {e}")
    return queries

RELEVANCE_PROMPT = """You are an AI Strategy Research Analyst. Evaluate the relevance of a search result for an AI Strategy Maturity Assessment knowledge base.

## Search Result
Title: {title}
URL: {url}
Content: {content}

## Task
1. Rate the relevance (0.0 to 1.0) for an AI Strategy Maturity Assessment tool
2. Categorize as one of: framework, regulation, whitepaper, article, report, tool
3. Identify which maturity dimensions it relates to: strategy, data, governance, technology, talent, ethics, processes
4. Write a concise summary (2-3 sentences) focusing on actionable insights

Respond in valid JSON:
{{
    "relevance_score": 0.0-1.0,
    "category": "framework|regulation|whitepaper|article|report|tool",
    "relevant_dimensions": ["dimension_id", ...],
    "summary": "concise summary"
}}
"""


class ResearchError(Exception):
    """Raised when research fails with a user-facing message."""
    pass


def _check_api_keys() -> dict[str, bool]:
    """Check which API keys are available."""
    return {
        "tavily": bool(os.getenv("TAVILY_API_KEY", "").strip()),
        "gemini": bool(os.getenv("GEMINI_API_KEY", "").strip()),
    }


async def search_and_store(
    query: Optional[str] = None,
    dimensions: list[str] = [],
    max_results: int = 10,
    language: str = "both",
    pdf_only: bool = False,
) -> dict:
    """
    Execute a research search and store relevant results.
    Returns a status dict with counts and errors for the frontend.
    """
    status = {
        "searched": 0,
        "found": 0,
        "new": 0,
        "stored": 0,
        "errors": [],
        "skipped_low_relevance": 0,
    }

    # ── Check API Keys ──────────────────────────────────────────
    keys = _check_api_keys()

    if not keys["tavily"]:
        raise ResearchError(
            "TAVILY_API_KEY ist nicht konfiguriert. "
            "Erstelle eine .env Datei im Projektroot mit deinem Tavily API-Key. "
            "Kostenlos registrieren: https://tavily.com"
        )

    # ── Initialize Clients ───────────────────────────────────────
    try:
        from tavily import TavilyClient
        tavily_client = TavilyClient(api_key=os.getenv("TAVILY_API_KEY"))
    except ImportError:
        raise ResearchError("tavily-python ist nicht installiert. Führe aus: pip install tavily-python")
    except Exception as e:
        raise ResearchError(f"Tavily-Client konnte nicht initialisiert werden: {e}")

    gemini_model = None
    if keys["gemini"]:
        try:
            import google.generativeai as genai
            genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
            gemini_model = genai.GenerativeModel("gemini-2.5-flash")
        except Exception as e:
            status["errors"].append(f"Gemini init failed: {e}. Sources will be stored without AI evaluation.")
    else:
        status["errors"].append(
            "GEMINI_API_KEY nicht gesetzt — Quellen werden ohne KI-Bewertung gespeichert."
        )

    # ── Build Search Queries ─────────────────────────────────────
    dim_queries = get_dimension_queries()
    queries = []
    if query:
        queries.append(query)
    elif dimensions:
        queries = [dim_queries[d] for d in dimensions if d in dim_queries]
    else:
        # Pick 3 diverse dimensions to avoid rate limits
        selected = ["governance", "strategy", "technology"]
        queries = [dim_queries[d] for d in selected]

    # ── Execute Tavily Searches ──────────────────────────────────
    all_results = []

    for search_query in queries:
        try:
            full_query = f"AI maturity {search_query}"
            
            if language == "german":
                full_query += " Deutsch Germany OR KI Reifegrad"
                
            if pdf_only:
                full_query += " filetype:pdf"
            response = tavily_client.search(
                query=full_query,
                search_depth="basic",
                max_results=5,
                include_answer=False,
                include_raw_content=False,
            )
            results = response.get("results", [])
            all_results.extend(results)
            status["searched"] += 1
            print(f"[Research] Tavily '{full_query[:50]}...' -> {len(results)} results")
        except Exception as e:
            error_msg = str(e)
            print(f"[Research] Tavily search failed: {error_msg}")
            if "401" in error_msg or "Unauthorized" in error_msg:
                raise ResearchError(
                    "Tavily API-Key ist ungültig oder abgelaufen. "
                    "Prüfe den Key unter https://app.tavily.com/home"
                )
            elif "429" in error_msg:
                status["errors"].append(f"Rate limit reached for query: {search_query[:40]}")
            else:
                status["errors"].append(f"Search failed: {error_msg[:100]}")

    status["found"] = len(all_results)

    if not all_results:
        if not status["errors"]:
            status["errors"].append("Keine Suchergebnisse gefunden. Versuche einen anderen Suchbegriff.")
        return status

    # ── Deduplicate by URL ───────────────────────────────────────
    seen_urls = set()
    unique_results = []
    for r in all_results:
        url = r.get("url", "")
        if url and url not in seen_urls:
            seen_urls.add(url)
            unique_results.append(r)

    # ── Check against existing sources ───────────────────────────
    db = await get_db()
    try:
        cursor = await db.execute("SELECT url FROM research_sources")
        existing_urls = {row["url"] for row in await cursor.fetchall()}
    finally:
        pass  # singleton connection, no close needed

    new_results = [r for r in unique_results if r.get("url", "") not in existing_urls]
    status["new"] = len(new_results)

    if not new_results:
        status["errors"].append("Alle gefundenen Quellen sind bereits in der Datenbank.")
        return status

    # ── Evaluate and Store ───────────────────────────────────────
    for result in new_results[:max_results]:
        try:
            title = result.get("title", "Untitled")
            url = result.get("url", "")
            content = result.get("content", "")[:2000]

            # Default evaluation (used when Gemini is unavailable)
            evaluation = {
                "relevance_score": 0.5,
                "category": "article",
                "relevant_dimensions": _guess_dimensions(title + " " + content),
                "summary": content[:200] + "..." if len(content) > 200 else content,
            }

            # LLM relevance evaluation (if Gemini is available)
            if gemini_model and content:
                try:
                    import google.generativeai as genai
                    prompt = RELEVANCE_PROMPT.format(
                        title=title, url=url, content=content,
                    )
                    response = gemini_model.generate_content(
                        prompt,
                        generation_config=genai.GenerationConfig(
                            response_mime_type="application/json",
                            temperature=0.1,
                        ),
                    )
                    llm_eval = json.loads(response.text)
                    evaluation.update(llm_eval)
                except Exception as e:
                    print(f"[Research] Gemini eval failed for '{title[:40]}': {e}")
                    # Keep default evaluation, don't skip

            # Only skip if relevance is very low (< 0.2)
            if evaluation.get("relevance_score", 0) < 0.2:
                status["skipped_low_relevance"] += 1
                continue

            # Store in database
            source_id = str(uuid.uuid4())[:8]
            db = await get_db()
            try:
                await db.execute(
                    """INSERT OR IGNORE INTO research_sources
                       (id, title, url, summary, category, relevant_dimensions,
                        published_date, relevance_score)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                    (
                        source_id,
                        title,
                        url,
                        evaluation.get("summary", ""),
                        evaluation.get("category", "article"),
                        json.dumps(evaluation.get("relevant_dimensions", [])),
                        result.get("published_date"),
                        evaluation.get("relevance_score", 0.5),
                    ),
                )
                await db.commit()
                status["stored"] += 1
                print(f"[Research] Stored: '{title[:50]}' (relevance: {evaluation.get('relevance_score', 0):.2f})")
            finally:
                pass  # singleton connection, no close needed

        except Exception as e:
            print(f"[Research] Failed to process '{result.get('title', '')}': {e}")
            status["errors"].append(f"Processing failed: {str(e)[:80]}")

    print(f"[Research] Complete: {status['stored']} stored, {status['skipped_low_relevance']} skipped (low relevance)")
    return status


def _guess_dimensions(text: str) -> list[str]:
    """Simple keyword-based dimension guessing when Gemini is not available."""
    text_lower = text.lower()
    dims = []
    keyword_map = {
        "strategy": ["strategy", "roadmap", "leadership", "business", "roi", "investment"],
        "data": ["data", "infrastructure", "pipeline", "quality", "dataset", "feature store"],
        "governance": ["governance", "compliance", "regulation", "eu ai act", "risk", "audit"],
        "technology": ["mlops", "deployment", "monitoring", "devops", "ci/cd", "api", "model"],
        "talent": ["talent", "training", "skills", "workforce", "hiring", "team", "culture"],
        "ethics": ["ethics", "fairness", "bias", "transparency", "responsible", "privacy"],
        "processes": ["scaling", "pilot", "production", "change management", "lifecycle"],
    }
    for dim_id, keywords in keyword_map.items():
        if any(kw in text_lower for kw in keywords):
            dims.append(dim_id)
    return dims or ["strategy"]
