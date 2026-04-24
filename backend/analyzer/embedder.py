"""
Embedder — Manages document embeddings using Gemini Embedding API
and a lightweight JSON-backed local store.

Abstraction layer: store_chunks(), search_chunks(), delete_collection()
can be reimplemented with Chroma/Qdrant for production scale.
"""

from __future__ import annotations

import asyncio
import functools
import json
import logging
import math
from pathlib import Path

import google.generativeai as genai

from config import EMBEDDINGS_DIR, require_gemini_key

log = logging.getLogger("embedder")

# NOTE: genai.configure() is called lazily in each function to ensure
# the .env file has been loaded before we read the API key.


def _ensure_configured():
    """Lazily configure Gemini API key (only once)."""
    key = require_gemini_key()
    genai.configure(api_key=key)


def _cosine_distance(v1: list[float], v2: list[float]) -> float:
    dot_product = sum(a * b for a, b in zip(v1, v2))
    norm_a = math.sqrt(sum(a * a for a in v1))
    norm_b = math.sqrt(sum(b * b for b in v2))
    if norm_a == 0 or norm_b == 0:
        return 1.0 # Max distance
    sim = dot_product / (norm_a * norm_b)
    return 1.0 - sim


async def _embed_with_retry(text: str, task_type: str, max_retries: int = 4) -> list[float]:
    """Generate embedding with exponential backoff for 429 rate limits."""
    _ensure_configured()

    loop = asyncio.get_event_loop()
    for attempt in range(max_retries + 1):
        try:
            result = await loop.run_in_executor(
                None,
                functools.partial(
                    genai.embed_content,
                    model="models/gemini-embedding-2-preview",
                    content=text,
                    task_type=task_type,
                )
            )
            return result["embedding"]
        except Exception as e:
            err_str = str(e)
            if "429" in err_str or "Resource exhausted" in err_str:
                if attempt < max_retries:
                    wait = 2 ** (attempt + 1)  # 2, 4, 8, 16 seconds
                    log.warning(f"Rate limited, retry {attempt+1}/{max_retries} in {wait}s...")
                    await asyncio.sleep(wait)
                    continue
            raise


async def embed_text(text: str) -> list[float]:
    """Generate embedding for a text using Gemini."""
    return await _embed_with_retry(text, "retrieval_document")


async def embed_query(text: str) -> list[float]:
    """Generate embedding for a query using Gemini."""
    return await _embed_with_retry(text, "retrieval_query")


async def store_chunks(
    collection_name: str,
    chunks: list[dict],
) -> int:
    """Store document chunks in a JSON file with embeddings."""
    EMBEDDINGS_DIR.mkdir(parents=True, exist_ok=True)
    file_path = EMBEDDINGS_DIR / f"{collection_name}.json"

    data = []
    for i, chunk in enumerate(chunks):
        embedding = await embed_text(chunk["text"])
        # Small delay between embeddings to avoid rate-limit bursts
        if i < len(chunks) - 1:
            await asyncio.sleep(0.3)
        data.append({
            "id": f"chunk_{chunk['index']}",
            "text": chunk["text"],
            "section": chunk["section"],
            "index": chunk["index"],
            "embedding": embedding
        })

    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    return len(data)


async def search_chunks(
    collection_name: str,
    query: str,
    n_results: int = 3,
) -> list[dict]:
    """Search stored chunks for a query using cosine similarity."""
    file_path = EMBEDDINGS_DIR / f"{collection_name}.json"
    if not file_path.exists():
        return []

    with open(file_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    if not data:
        return []

    query_embedding = await embed_query(query)

    # Calculate distances
    for item in data:
        item["distance"] = _cosine_distance(query_embedding, item["embedding"])

    # Sort by distance (lower is better)
    data.sort(key=lambda x: x["distance"])

    # Return top N (without embeddings)
    results = []
    for item in data[:n_results]:
        results.append({
            "id": item["id"],
            "text": item["text"],
            "section": item["section"],
            "index": item["index"],
            "distance": item["distance"]
        })

    return results


def delete_collection(collection_name: str):
    """Delete a document's embedding collection."""
    file_path = EMBEDDINGS_DIR / f"{collection_name}.json"
    try:
        if file_path.exists():
            file_path.unlink()
    except Exception:
        pass
