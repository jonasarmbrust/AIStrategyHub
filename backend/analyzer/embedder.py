"""
Embedder — Manages document embeddings using Gemini Embedding API
and SQLite-backed persistent storage.

Abstraction layer: store_chunks(), search_chunks(), delete_collection()
use the document_embeddings table in SQLite for efficient, atomic storage.

Performance optimizations:
- Batch embedding: embeds all chunks in one API call (~87% faster)
- Query embedding cache: avoids re-embedding identical checkpoint texts
- Connection-per-request: properly manages DB connections via async-with
"""

from __future__ import annotations

import asyncio
import functools
import json
import logging
import math
import struct
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


# ── Embedding API calls ──────────────────────────────────────────────────


async def _embed_with_retry(text: str, task_type: str, max_retries: int = 4) -> list[float]:
    """Generate embedding with exponential backoff for 429 rate limits."""
    _ensure_configured()

    loop = asyncio.get_running_loop()
    for attempt in range(max_retries + 1):
        try:
            result = await loop.run_in_executor(
                None,
                functools.partial(
                    genai.embed_content,
                    model="models/gemini-embedding-2",
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


async def _embed_batch_with_retry(
    texts: list[str], task_type: str, max_retries: int = 4,
) -> list[list[float]]:
    """Batch-embed multiple texts in a single API call with retry.

    Gemini embed_content accepts a list of strings and returns one embedding
    per input text. This is ~N× faster than individual calls.
    Falls back to sequential embedding if batch call fails.
    """
    if not texts:
        return []
    if len(texts) == 1:
        emb = await _embed_with_retry(texts[0], task_type, max_retries)
        return [emb]

    _ensure_configured()
    loop = asyncio.get_running_loop()

    for attempt in range(max_retries + 1):
        try:
            result = await loop.run_in_executor(
                None,
                functools.partial(
                    genai.embed_content,
                    model="models/gemini-embedding-2",
                    content=texts,
                    task_type=task_type,
                )
            )
            return result["embedding"]
        except Exception as e:
            err_str = str(e)
            if "429" in err_str or "Resource exhausted" in err_str:
                if attempt < max_retries:
                    wait = 2 ** (attempt + 1)
                    log.warning(f"Batch rate limited, retry {attempt+1}/{max_retries} in {wait}s...")
                    await asyncio.sleep(wait)
                    continue
            # Non-retryable error: fall back to sequential
            log.warning(f"Batch embedding failed, falling back to sequential: {e}")
            results = []
            for t in texts:
                emb = await _embed_with_retry(t, task_type, max_retries)
                results.append(emb)
                await asyncio.sleep(0.2)
            return results

    # Should not reach here, but just in case
    return []


async def embed_text(text: str) -> list[float]:
    """Generate embedding for a text using Gemini."""
    return await _embed_with_retry(text, "retrieval_document")


async def embed_query(text: str) -> list[float]:
    """Generate embedding for a query using Gemini."""
    return await _embed_with_retry(text, "retrieval_query")


# ── Query embedding cache ────────────────────────────────────────────────

_query_embedding_cache: dict[str, list[float]] = {}
_QUERY_CACHE_MAX_SIZE = 200


async def _embed_query_cached(text: str) -> list[float]:
    """Generate query embedding with in-memory cache.

    Checkpoint texts are stable across analyses, so caching query embeddings
    avoids ~56 redundant API calls per document evaluation.
    """
    if text in _query_embedding_cache:
        return _query_embedding_cache[text]

    embedding = await embed_query(text)

    # Evict oldest entries if cache is full
    if len(_query_embedding_cache) >= _QUERY_CACHE_MAX_SIZE:
        # Remove first 20% of entries
        keys_to_remove = list(_query_embedding_cache.keys())[:_QUERY_CACHE_MAX_SIZE // 5]
        for k in keys_to_remove:
            del _query_embedding_cache[k]

    _query_embedding_cache[text] = embedding
    return embedding


# ── SQLite-backed storage ─────────────────────────────────────────────────


async def store_chunks(
    collection_name: str,
    chunks: list[dict],
) -> int:
    """Store document chunks with embeddings in SQLite.

    Uses batch embedding (single API call for all chunks) for speed.
    Replaces any existing chunks for this collection (supports re-analysis).
    """
    from database import get_db

    if not chunks:
        return 0

    # Batch-embed all chunk texts in one API call
    texts = [chunk["text"] for chunk in chunks]

    # Split into sub-batches of 100 to stay within API limits
    BATCH_LIMIT = 100
    all_embeddings: list[list[float]] = []
    for i in range(0, len(texts), BATCH_LIMIT):
        sub_batch = texts[i:i + BATCH_LIMIT]
        sub_embeddings = await _embed_batch_with_retry(sub_batch, "retrieval_document")
        all_embeddings.extend(sub_embeddings)
        if i + BATCH_LIMIT < len(texts):
            await asyncio.sleep(0.5)  # Brief pause between sub-batches

    if len(all_embeddings) != len(chunks):
        log.error(f"Embedding count mismatch: {len(all_embeddings)} vs {len(chunks)} chunks")
        return 0

    # Store all chunks in SQLite
    async with get_db() as db:
        # Delete existing chunks for this collection (re-analysis case)
        await db.execute(
            "DELETE FROM document_embeddings WHERE collection_name = ?",
            (collection_name,),
        )

        for chunk, embedding in zip(chunks, all_embeddings):
            emb_blob = struct.pack(f'{len(embedding)}f', *embedding)
            await db.execute(
                """INSERT OR REPLACE INTO document_embeddings
                   (collection_name, chunk_index, text, section, embedding)
                   VALUES (?, ?, ?, ?, ?)""",
                (collection_name, chunk["index"], chunk["text"],
                 chunk["section"], emb_blob),
            )

    log.info(f"Stored {len(chunks)} chunks for '{collection_name}' via batch embedding")
    return len(chunks)


async def search_chunks(
    collection_name: str,
    query: str,
    n_results: int = 3,
) -> list[dict]:
    """Search stored chunks for a query using cosine similarity.

    Uses cached query embeddings to avoid redundant API calls.
    """
    from database import get_db

    async with get_db() as db:
        cursor = await db.execute(
            "SELECT chunk_index, text, section, embedding FROM document_embeddings WHERE collection_name = ?",
            (collection_name,),
        )
        rows = await cursor.fetchall()

    if not rows:
        return []

    # Use cached query embedding
    query_embedding = await _embed_query_cached(query)

    # Calculate distances
    results = []
    for row in rows:
        emb_blob = row["embedding"]
        n_floats = len(emb_blob) // 4  # 4 bytes per float32
        stored_embedding = list(struct.unpack(f'{n_floats}f', emb_blob))

        distance = _cosine_distance(query_embedding, stored_embedding)
        results.append({
            "id": f"chunk_{row['chunk_index']}",
            "text": row["text"],
            "section": row["section"],
            "index": row["chunk_index"],
            "distance": distance,
        })

    # Sort by distance (lower is better)
    results.sort(key=lambda x: x["distance"])
    return results[:n_results]


async def delete_collection(collection_name: str):
    """Delete a document's embedding collection from SQLite."""
    try:
        from database import get_db
        async with get_db() as db:
            await db.execute(
                "DELETE FROM document_embeddings WHERE collection_name = ?",
                (collection_name,),
            )
    except Exception as e:
        log.warning(f"Failed to delete collection '{collection_name}': {e}")


# ── JSON → SQLite Migration ──────────────────────────────────────────────


async def migrate_json_to_sqlite():
    """Migrate existing JSON embedding files to SQLite (one-time migration).

    Reads each .json file in EMBEDDINGS_DIR, inserts into document_embeddings
    table, then removes the JSON file. Skips files that fail to migrate.
    """
    json_files = list(EMBEDDINGS_DIR.glob("*.json"))
    if not json_files:
        return

    from database import get_db

    log.info(f"Migrating {len(json_files)} JSON embedding files to SQLite...")

    for json_file in json_files:
        collection_name = json_file.stem  # e.g. 'doc_abc123'
        try:
            with open(json_file, "r", encoding="utf-8") as f:
                data = json.load(f)

            async with get_db() as db:
                for item in data:
                    embedding = item.get("embedding", [])
                    if not embedding:
                        continue
                    emb_blob = struct.pack(f'{len(embedding)}f', *embedding)
                    await db.execute(
                        """INSERT OR IGNORE INTO document_embeddings
                           (collection_name, chunk_index, text, section, embedding)
                           VALUES (?, ?, ?, ?, ?)""",
                        (collection_name, item.get("index", 0),
                         item.get("text", ""), item.get("section", ""), emb_blob),
                    )

            # Remove old JSON file after successful migration
            json_file.unlink()
            log.info(f"  Migrated and removed: {json_file.name}")
        except Exception as e:
            log.warning(f"  Failed to migrate {json_file.name}: {e}")

    log.info("JSON to SQLite migration complete")
