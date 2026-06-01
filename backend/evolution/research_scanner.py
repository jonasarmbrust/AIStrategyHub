"""Research Scanner — Tavily-based research scanning and quality assessment.

Handles:
- Deep research scanning across all dimensions using Tavily
- Source quality assessment via Gemini multi-criteria evaluation
- Fetching and cleaning web page content
- Building framework context for LLM prompts
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
import uuid

import google.generativeai as genai

from config import GEMINI_API_KEY
from database import get_db
from knowledge_base.checklist_generator import _load_model
from evolution.prompts import EVOLUTION_QUERIES, QUALITY_ASSESSMENT_PROMPT

log = logging.getLogger("evolution.research_scanner")

# Semaphore for rate-limiting concurrent Gemini calls
_gemini_semaphore = asyncio.Semaphore(3)


async def research_scan(
    tavily_key: str,
    run_log: list[str],
    stats: dict,
) -> list[dict]:
    """Execute deep research scan across all dimensions using Tavily.

    Args:
        tavily_key: API key for Tavily search.
        run_log: List to append log messages to.
        stats: Dict of running statistics (modified in-place).

    Returns:
        List of new (not yet in DB) research sources with evaluations.
    """
    try:
        from tavily import TavilyClient
        tavily_client = TavilyClient(api_key=tavily_key)
    except ImportError:
        run_log.append("ERROR: tavily-python not installed")
        return []

    gemini_model = genai.GenerativeModel("gemini-3.5-flash")
    all_new_sources = []

    for dim_id, queries in EVOLUTION_QUERIES.items():
        for query in queries:
            try:
                response = tavily_client.search(
                    query=query,
                    search_depth="basic",
                    max_results=5,
                    include_answer=False,
                    include_raw_content=False,
                )
                results = response.get("results", [])
                stats["sources_scanned"] += len(results)

                # Deduplicate against existing DB sources
                async with get_db() as db:
                    cursor = await db.execute("SELECT url FROM research_sources")
                    existing_urls = {row["url"] for row in await cursor.fetchall()}

                for result in results:
                    url = result.get("url", "")
                    if not url or url in existing_urls:
                        continue

                    title = result.get("title", "Untitled")
                    content = result.get("content", "")[:2000]

                    # Evaluate relevance with Gemini
                    evaluation = {
                        "relevance_score": 0.5,
                        "category": "article",
                        "relevant_dimensions": [dim_id],
                        "summary": content[:200] + "..." if len(content) > 200 else content,
                    }

                    try:
                        from research.agent import RELEVANCE_PROMPT
                        async with _gemini_semaphore:
                            prompt = RELEVANCE_PROMPT.format(
                                title=title, url=url, content=content,
                            )
                            resp = gemini_model.generate_content(
                                prompt,
                                generation_config=genai.GenerationConfig(
                                    response_mime_type="application/json",
                                    temperature=0.1,
                                ),
                            )
                            llm_eval = json.loads(resp.text)
                            evaluation.update(llm_eval)
                    except Exception as e:
                        log.debug(f"Gemini eval fallback for '{title[:30]}': {e}")

                    # Skip very low relevance
                    if evaluation.get("relevance_score", 0) < 0.2:
                        continue

                    # Store in research_sources DB
                    source_id = str(uuid.uuid4())[:8]
                    async with get_db() as db:
                        await db.execute(
                            """INSERT OR IGNORE INTO research_sources
                               (id, title, url, summary, category, relevant_dimensions,
                                published_date, relevance_score)
                               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                            (
                                source_id, title, url,
                                evaluation.get("summary", ""),
                                evaluation.get("category", "article"),
                                json.dumps(evaluation.get("relevant_dimensions", [dim_id])),
                                result.get("published_date"),
                                evaluation.get("relevance_score", 0.5),
                            ),
                        )

                    existing_urls.add(url)
                    all_new_sources.append({
                        "id": source_id,
                        "title": title,
                        "url": url,
                        "content": content,
                        "summary": evaluation.get("summary", ""),
                        "relevance_score": evaluation.get("relevance_score", 0.5),
                        "relevant_dimensions": evaluation.get("relevant_dimensions", [dim_id]),
                    })

            except Exception as e:
                log.warning(f"Search failed for '{query[:40]}': {e}")
                continue

            # Small delay between Tavily calls
            await asyncio.sleep(0.5)

    return all_new_sources


def get_framework_context() -> str:
    """Build a compact framework context string for LLM prompts.

    Returns:
        A formatted string summarizing the current framework dimensions
        and their top checkpoints.
    """
    try:
        model = _load_model()
        parts = []
        for dim in model.dimensions:
            cp_texts = [f"  - {cp.text}" for cp in dim.checkpoints[:10]]
            parts.append(
                f"Dimension: {dim.id} ({dim.name})\n"
                + "\n".join(cp_texts)
            )
        return "\n\n".join(parts)
    except Exception as e:
        log.error(f"Failed to load framework context: {e}")
        return "Framework context unavailable"


async def fetch_content(url: str) -> str:
    """Fetch and clean web page content from a URL.

    Args:
        url: The URL to fetch content from.

    Returns:
        Cleaned text content (up to 15k chars), or empty string on failure.
    """
    if not url:
        return ""

    try:
        import httpx
        async with httpx.AsyncClient(follow_redirects=True, timeout=30) as client:
            resp = await client.get(url, headers={"User-Agent": "AI-Strategy-Hub/2.0"})
            resp.raise_for_status()
            raw = resp.text
            # Strip HTML tags
            content = re.sub(r'<[^>]+>', ' ', raw)
            content = re.sub(r'\s+', ' ', content).strip()
            return content[:15000]  # Cap at 15k chars for LLM context
    except Exception as e:
        log.debug(f"Could not fetch URL {url}: {e}")
        return ""


async def assess_quality(
    title: str,
    url: str,
    content: str,
    dimension_context: str,
) -> dict:
    """Assess source quality using multi-criteria Gemini evaluation.

    Args:
        title: Source title.
        url: Source URL.
        content: Source content text.
        dimension_context: Current framework context for comparison.

    Returns:
        Dict with quality_score, impact_score, novelty_score, and rationale.
    """
    try:
        async with _gemini_semaphore:
            model = genai.GenerativeModel("gemini-3.5-flash")
            prompt = QUALITY_ASSESSMENT_PROMPT.format(
                title=title,
                url=url,
                content=content[:8000],
                dimension_context=dimension_context[:4000],
            )
            response = model.generate_content(
                prompt,
                generation_config=genai.GenerationConfig(
                    response_mime_type="application/json",
                    temperature=0.1,
                ),
            )
            scores = json.loads(response.text)

        # Calculate composite scores
        scientific = scores.get("scientific_rigor", 0)
        practical = scores.get("practical_applicability", 0)
        novelty = scores.get("novelty", 0)
        authority = scores.get("source_authority", 0)
        recency = scores.get("recency", 0)
        relevance = scores.get("framework_relevance", 0)

        # quality_score = weighted average of all 6 criteria
        quality_score = (
            scientific * 0.15
            + practical * 0.25
            + novelty * 0.15
            + authority * 0.15
            + recency * 0.10
            + relevance * 0.20
        )
        # impact_score = practical * 0.5 + novelty * 0.3 + authority * 0.2
        impact_score = practical * 0.5 + novelty * 0.3 + authority * 0.2
        # novelty_score = novelty criterion
        novelty_score = novelty

        return {
            "quality_score": round(quality_score, 3),
            "impact_score": round(impact_score, 3),
            "novelty_score": round(novelty_score, 3),
            "quality_rationale": scores.get("quality_rationale", ""),
            "raw_scores": scores,
        }

    except Exception as e:
        log.error(f"Quality assessment failed for '{title[:40]}': {e}")
        return {"quality_score": 0, "impact_score": 0, "novelty_score": 0}
