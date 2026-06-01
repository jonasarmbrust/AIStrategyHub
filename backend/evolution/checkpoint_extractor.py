"""Checkpoint Extractor — Extracting and integrating checkpoint proposals.

Handles:
- Extracting novel checkpoint proposals from research sources via Gemini
- Checking proposal redundancy against existing checkpoints (with embedding cache)
- Integrating approved proposals into the framework (dimensions.json)
- Embedding cache management (get/store/clear)
"""

from __future__ import annotations

import asyncio
import functools
import hashlib
import json
import logging
import struct
import uuid
from datetime import datetime, timezone
from typing import Optional

import google.generativeai as genai

from config import GEMINI_API_KEY, EVOLUTION_REDUNDANCY_THRESHOLD
from database import get_db
from knowledge_base.checklist_generator import _load_model
from evolution.prompts import CHECKPOINT_EXTRACTION_PROMPT

log = logging.getLogger("evolution.checkpoint_extractor")

# Semaphore for rate-limiting concurrent Gemini calls
_gemini_semaphore = asyncio.Semaphore(3)


# ── Embedding cache helpers ───────────────────────────────────────────────

def _text_hash(text: str) -> str:
    """Generate a short hash of checkpoint text for change detection."""
    return hashlib.sha256(text.encode('utf-8')).hexdigest()[:16]


async def _get_cached_embedding(checkpoint_id: str, text: str) -> list[float] | None:
    """Retrieve a cached embedding from SQLite if the text hasn't changed."""
    async with get_db() as db:
        cursor = await db.execute(
            "SELECT embedding, text_hash FROM checkpoint_embeddings WHERE checkpoint_id = ?",
            (checkpoint_id,),
        )
        row = await cursor.fetchone()
        if row and row["text_hash"] == _text_hash(text):
            emb_blob = row["embedding"]
            n_floats = len(emb_blob) // 4
            return list(struct.unpack(f'{n_floats}f', emb_blob))
        return None


async def _store_embedding(checkpoint_id: str, text: str, embedding: list[float]):
    """Store an embedding in the SQLite cache."""
    async with get_db() as db:
        emb_blob = struct.pack(f'{len(embedding)}f', *embedding)
        await db.execute(
            """INSERT OR REPLACE INTO checkpoint_embeddings (checkpoint_id, text_hash, embedding)
               VALUES (?, ?, ?)""",
            (checkpoint_id, _text_hash(text), emb_blob),
        )


async def clear_embeddings_cache():
    """Clear the persistent checkpoint embeddings cache."""
    async with get_db() as db:
        await db.execute("DELETE FROM checkpoint_embeddings")
    log.info("Checkpoint embeddings cache cleared")


# ── Checkpoint extraction ─────────────────────────────────────────────────

async def extract_checkpoints(
    title: str,
    url: str,
    content: str,
) -> list[dict]:
    """Extract novel checkpoint proposals from a source via Gemini.

    Args:
        title: Source title.
        url: Source URL.
        content: Source content text.

    Returns:
        List of proposal dicts with dimension_id, text, text_de, etc.
    """
    try:
        model_data = _load_model()
        framework_summary = []
        for dim in model_data.dimensions:
            cp_summaries = [f"- {cp.text}" for cp in dim.checkpoints]
            framework_summary.append(
                f"Dimension: {dim.id} ({dim.name})\nExisting Checkpoints:\n"
                + "\n".join(cp_summaries)
            )
        meta_model_context = "\n\n".join(framework_summary)
        dim_ids = ", ".join([d.id for d in model_data.dimensions])

        async with _gemini_semaphore:
            gemini_model = genai.GenerativeModel("gemini-3.5-flash")
            prompt = CHECKPOINT_EXTRACTION_PROMPT.format(
                meta_model_context=meta_model_context[:8000],
                title=title,
                url=url,
                content=content[:12000],
                dim_ids=dim_ids,
            )
            response = gemini_model.generate_content(
                prompt,
                generation_config=genai.GenerationConfig(
                    response_mime_type="application/json",
                    temperature=0.2,
                ),
            )
            data = json.loads(response.text)
            return data.get("proposals", [])

    except Exception as e:
        log.error(f"Checkpoint extraction failed for '{title[:40]}': {e}")
        return []


# ── Redundancy check ─────────────────────────────────────────────────────

async def check_proposal_redundancy(proposal: dict) -> bool:
    """Check if a proposal is redundant against existing checkpoints.

    Uses persistent SQLite embedding cache for efficiency.

    Args:
        proposal: Dict with at least 'text' and 'dimension_id' keys.

    Returns:
        True if the proposal is redundant (high cosine similarity with
        an existing checkpoint), False otherwise.
    """
    try:
        proposal_text = proposal.get("text", "")
        dim_id = proposal.get("dimension_id", "")
        if not proposal_text or not dim_id:
            return False

        from knowledge_base.checklist_generator import safe_read_json
        data = await safe_read_json()

        target_dim = next(
            (d for d in data.get("dimensions", []) if d["id"] == dim_id), None
        )
        if not target_dim:
            return False

        existing_cps = target_dim.get("checkpoints", [])
        if not existing_cps:
            return False

        loop = asyncio.get_running_loop()
        genai.configure(api_key=GEMINI_API_KEY)

        # Get embedding for proposal (always fresh, not cached)
        proposal_emb = await loop.run_in_executor(
            None,
            functools.partial(
                genai.embed_content,
                model="models/gemini-embedding-2",
                content=proposal_text,
                task_type="retrieval_document",
            ),
        )
        proposal_vec = proposal_emb["embedding"]

        # Check each existing checkpoint using cached embeddings
        for cp in existing_cps:
            cp_id = cp.get("id", "")
            cp_text = cp.get("text", "")
            if not cp_text:
                continue

            # Try cache first
            existing_vec = await _get_cached_embedding(cp_id, cp_text)

            if existing_vec is None:
                # Cache miss — compute and store
                try:
                    emb_result = await loop.run_in_executor(
                        None,
                        functools.partial(
                            genai.embed_content,
                            model="models/gemini-embedding-2",
                            content=cp_text,
                            task_type="retrieval_document",
                        ),
                    )
                    existing_vec = emb_result["embedding"]
                    await _store_embedding(cp_id, cp_text, existing_vec)
                    await asyncio.sleep(0.1)  # Rate limit
                except Exception as e:
                    log.debug(f"Failed to embed checkpoint {cp_id}: {e}")
                    continue

            # Cosine similarity check
            try:
                dot = sum(a * b for a, b in zip(proposal_vec, existing_vec))
                norm_a = sum(a * a for a in proposal_vec) ** 0.5
                norm_b = sum(b * b for b in existing_vec) ** 0.5
                if norm_a > 0 and norm_b > 0:
                    sim = dot / (norm_a * norm_b)
                    if sim >= EVOLUTION_REDUNDANCY_THRESHOLD:
                        return True
            except Exception:
                continue

        return False

    except Exception as e:
        log.debug(f"Redundancy check failed: {e}")
        return False


# ── Proposal integration ─────────────────────────────────────────────────

async def integrate_proposal(
    proposal: dict,
    source_id: str,
    source_title: str,
    source_url: str,
) -> Optional[str]:
    """Integrate a single checkpoint proposal into dimensions.json.

    Reuses the integration logic from framework.py.

    Args:
        proposal: The proposal dict with text, dimension_id, etc.
        source_id: ID of the research source.
        source_title: Title of the research source.
        source_url: URL of the research source.

    Returns:
        The final checkpoint ID if integrated, or None on failure.
    """
    try:
        from knowledge_base.checklist_generator import safe_read_json
        data = await safe_read_json()

        dim_id = proposal.get("dimension_id", "")
        target_dim = next(
            (d for d in data.get("dimensions", []) if d["id"] == dim_id), None
        )
        if not target_dim:
            log.warning(f"Dimension '{dim_id}' not found for proposal integration")
            return None

        # Generate final ID
        cp_count = len(target_dim.get("checkpoints", []))
        final_id = f"CP_{target_dim['id'][:2]}_{cp_count + 1:02d}"

        checkpoint_obj = {
            "id": final_id,
            "text": proposal.get("text", ""),
            "text_de": proposal.get("text_de", ""),
            "min_level": proposal.get("min_level", 3),
            "category": proposal.get("category", "General"),
            "sources": proposal.get("sources", [source_title]),
            "evidence_tags": [{
                "source": source_title,
                "reference": "Evolution Agent — Auto-Integration",
                "url": source_url,
            }],
            "added_at": datetime.now(timezone.utc).isoformat(),
            "added_by": "evolution_agent",
        }

        target_dim["checkpoints"].append(checkpoint_obj)

        from knowledge_base.checklist_generator import safe_write_json
        await safe_write_json(data)

        # Log activity
        async with get_db() as db:
            activity_id = str(uuid.uuid4())[:8]
            await db.execute(
                """INSERT INTO framework_activity
                   (id, action, source_id, checkpoint_id, dimension_id, details)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (
                    activity_id,
                    "evolution_integrated",
                    source_id,
                    final_id,
                    dim_id,
                    json.dumps({
                        "text": proposal.get("text", "")[:80],
                        "source_title": source_title,
                        "rationale": proposal.get("rationale", ""),
                    }),
                ),
            )

        # Store the integrated checkpoint ID in the proposal for reference
        proposal["integrated_checkpoint_id"] = final_id
        return final_id

    except Exception as e:
        log.error(f"Failed to integrate proposal: {e}")
        return None
