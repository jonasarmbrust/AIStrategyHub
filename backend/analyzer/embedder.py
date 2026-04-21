"""
Embedder — Manages document embeddings using Gemini Embedding API
and a lightweight JSON-backed local store to avoid C++ build tool requirements.
"""

from __future__ import annotations

import json
import math
import os
from pathlib import Path
from typing import Optional

import google.generativeai as genai

# Configure Gemini
genai.configure(api_key=os.getenv("GEMINI_API_KEY", ""))

EMBED_DIR = Path(__file__).parent.parent.parent / "data" / "embeddings"


def _cosine_distance(v1: list[float], v2: list[float]) -> float:
    dot_product = sum(a * b for a, b in zip(v1, v2))
    norm_a = math.sqrt(sum(a * a for a in v1))
    norm_b = math.sqrt(sum(b * b for b in v2))
    if norm_a == 0 or norm_b == 0:
        return 1.0 # Max distance
    sim = dot_product / (norm_a * norm_b)
    return 1.0 - sim


async def embed_text(text: str) -> list[float]:
    """Generate embedding for a text using Gemini."""
    result = genai.embed_content(
        model="models/gemini-embedding-2-preview",
        content=text,
        task_type="retrieval_document",
    )
    return result["embedding"]


async def embed_query(text: str) -> list[float]:
    """Generate embedding for a query using Gemini."""
    result = genai.embed_content(
        model="models/gemini-embedding-2-preview",
        content=text,
        task_type="retrieval_query",
    )
    return result["embedding"]


async def store_chunks(
    collection_name: str,
    chunks: list[dict],
) -> int:
    """Store document chunks in a JSON file with embeddings."""
    EMBED_DIR.mkdir(parents=True, exist_ok=True)
    file_path = EMBED_DIR / f"{collection_name}.json"

    data = []
    for chunk in chunks:
        embedding = await embed_text(chunk["text"])
        data.append({
            "id": f"chunk_{chunk['index']}",
            "text": chunk["text"],
            "section": chunk["section"],
            "index": chunk["index"],
            "embedding": embedding
        })

    file_path.write_text(json.dumps(data))
    return len(data)


async def search_chunks(
    collection_name: str,
    query: str,
    n_results: int = 3,
) -> list[dict]:
    """Search for relevant chunks using semantic similarity."""
    file_path = EMBED_DIR / f"{collection_name}.json"
    if not file_path.exists():
        return []

    try:
        data = json.loads(file_path.read_text())
        query_embedding = await embed_query(query)

        results = []
        for item in data:
            dist = _cosine_distance(query_embedding, item["embedding"])
            results.append({
                "text": item["text"],
                "section": item["section"],
                "distance": dist
            })

        # Sort by distance (lower is better, since it's 1 - cosine_similarity)
        results.sort(key=lambda x: x["distance"])

        return results[:n_results]
    except Exception as e:
        print(f"Search failed: {e}")
        return []


def delete_collection(collection_name: str):
    """Delete the collection file."""
    file_path = EMBED_DIR / f"{collection_name}.json"
    try:
        if file_path.exists():
            file_path.unlink()
    except Exception:
        pass
