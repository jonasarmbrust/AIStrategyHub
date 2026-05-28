"""
Redundancy Detector — Detects semantic overlaps between checkpoints
using Gemini embeddings and cosine similarity.

Uses scikit-learn for pairwise comparison and Gemini LLM for validation.
"""

from __future__ import annotations

import asyncio
import functools
import json
import logging
import uuid
from datetime import datetime, timezone
from pathlib import Path

import google.generativeai as genai

from config import DIMENSIONS_PATH, GEMINI_API_KEY, EVOLUTION_REDUNDANCY_THRESHOLD
from database import get_db
from knowledge_base.checklist_generator import clear_cache

log = logging.getLogger("evolution.redundancy")


class RedundancyDetector:
    """Detects semantic overlaps between checkpoints."""

    def __init__(self, threshold: float | None = None):
        """Initialize the redundancy detector.

        Args:
            threshold: Cosine similarity threshold for flagging redundancy.
                       Defaults to EVOLUTION_REDUNDANCY_THRESHOLD from config.
        """
        self.threshold = threshold or EVOLUTION_REDUNDANCY_THRESHOLD

    async def find_redundancies(self, threshold: float | None = None) -> list[dict]:
        """Compare all checkpoint pairs using Gemini embeddings.

        Returns pairs with cosine similarity >= threshold, sorted descending.
        """
        threshold = threshold or self.threshold

        # Load all checkpoints from dimensions.json
        try:
            from knowledge_base.checklist_generator import safe_read_json
            data = await safe_read_json()
        except Exception as e:
            log.error(f"Failed to load dimensions.json: {e}")
            return []

        checkpoints = []
        for dim in data.get("dimensions", []):
            for cp in dim.get("checkpoints", []):
                checkpoints.append({
                    "id": cp["id"],
                    "text": cp["text"],
                    "text_de": cp.get("text_de", ""),
                    "dimension_id": dim["id"],
                    "dimension_name": dim["name"],
                    "category": cp.get("category", ""),
                })

        if len(checkpoints) < 2:
            log.info("Not enough checkpoints for redundancy check")
            return []

        # Batch embed all checkpoint texts
        log.info(f"Embedding {len(checkpoints)} checkpoints for redundancy scan...")
        texts = [cp["text"] for cp in checkpoints]
        embeddings = await self._batch_embed(texts)

        if not embeddings or len(embeddings) != len(checkpoints):
            log.error("Embedding failed or returned wrong count")
            return []

        # Compute pairwise cosine similarity using scikit-learn
        try:
            import numpy as np
            from sklearn.metrics.pairwise import cosine_similarity

            embedding_matrix = np.array(embeddings)
            sim_matrix = cosine_similarity(embedding_matrix)
        except ImportError:
            log.error("scikit-learn or numpy not installed for redundancy detection")
            return []

        # Find pairs above threshold
        redundant_pairs = []
        for i in range(len(checkpoints)):
            for j in range(i + 1, len(checkpoints)):
                similarity = float(sim_matrix[i][j])
                if similarity >= threshold:
                    redundant_pairs.append({
                        "cp1": checkpoints[i],
                        "cp2": checkpoints[j],
                        "similarity": round(similarity, 4),
                        "same_dimension": checkpoints[i]["dimension_id"] == checkpoints[j]["dimension_id"],
                    })

        # Sort by similarity descending
        redundant_pairs.sort(key=lambda x: x["similarity"], reverse=True)
        log.info(f"Found {len(redundant_pairs)} redundant pairs above threshold {threshold}")
        return redundant_pairs

    async def validate_redundancy(self, cp1_text: str, cp2_text: str) -> dict:
        """Use LLM to confirm if two checkpoints are truly redundant.

        Returns:
            dict with is_redundant, merged_text, merged_text_de, rationale
        """
        if not GEMINI_API_KEY:
            log.warning("No Gemini API key — skipping LLM validation")
            return {"is_redundant": False, "merged_text": "", "merged_text_de": "", "rationale": "No API key"}

        try:
            genai.configure(api_key=GEMINI_API_KEY)
            model = genai.GenerativeModel("gemini-2.5-flash")

            prompt = f"""You are an AI Strategy Framework expert. Analyze these two checkpoints for semantic redundancy.

Checkpoint 1: {cp1_text}

Checkpoint 2: {cp2_text}

Determine if these checkpoints are truly redundant (i.e., they assess the same thing and one could be removed without losing coverage).

If redundant, create a merged version that combines the best of both.

Respond in valid JSON:
{{
    "is_redundant": true/false,
    "merged_text": "Merged English checkpoint text (or empty if not redundant)",
    "merged_text_de": "Merged German checkpoint text (or empty if not redundant)",
    "rationale": "Brief explanation of your decision"
}}"""

            response = model.generate_content(
                prompt,
                generation_config=genai.GenerationConfig(
                    response_mime_type="application/json",
                    temperature=0.1,
                ),
            )
            result = json.loads(response.text)
            return {
                "is_redundant": result.get("is_redundant", False),
                "merged_text": result.get("merged_text", ""),
                "merged_text_de": result.get("merged_text_de", ""),
                "rationale": result.get("rationale", ""),
            }
        except Exception as e:
            log.error(f"LLM validation failed: {e}")
            return {"is_redundant": False, "merged_text": "", "merged_text_de": "", "rationale": f"Error: {e}"}

    async def execute_merge(self, keep_id: str, remove_id: str, merged_data: dict) -> dict:
        """Merge two checkpoints: update the keeper, remove the duplicate.

        Preserves all source references from both checkpoints.

        Args:
            keep_id: ID of the checkpoint to keep (updated with merged text).
            remove_id: ID of the checkpoint to remove.
            merged_data: Dict with merged_text, merged_text_de fields.

        Returns:
            dict with merge result details.
        """
        try:
            from knowledge_base.checklist_generator import safe_read_json
            data = await safe_read_json()
        except Exception as e:
            log.error(f"Failed to load dimensions.json for merge: {e}")
            return {"success": False, "error": str(e)}

        keep_cp = None
        remove_cp = None
        keep_dim = None
        remove_dim = None

        for dim in data.get("dimensions", []):
            for cp in dim.get("checkpoints", []):
                if cp["id"] == keep_id:
                    keep_cp = cp
                    keep_dim = dim
                if cp["id"] == remove_id:
                    remove_cp = cp
                    remove_dim = dim

        if not keep_cp or not remove_cp:
            return {"success": False, "error": f"Checkpoint(s) not found: keep={keep_id}, remove={remove_id}"}

        # Merge sources and evidence tags
        merged_sources = list(set(keep_cp.get("sources", []) + remove_cp.get("sources", [])))
        merged_evidence = keep_cp.get("evidence_tags", []) + remove_cp.get("evidence_tags", [])

        # Update keeper checkpoint
        if merged_data.get("merged_text"):
            keep_cp["text"] = merged_data["merged_text"]
        if merged_data.get("merged_text_de"):
            keep_cp["text_de"] = merged_data["merged_text_de"]
        keep_cp["sources"] = merged_sources
        keep_cp["evidence_tags"] = merged_evidence
        keep_cp["merged_from"] = remove_id
        keep_cp["merged_at"] = datetime.now(timezone.utc).isoformat()

        # Remove duplicate checkpoint
        remove_dim["checkpoints"] = [
            cp for cp in remove_dim.get("checkpoints", []) if cp["id"] != remove_id
        ]

        # Write back
        try:
            from knowledge_base.checklist_generator import safe_write_json
            await safe_write_json(data)
            clear_cache()
        except Exception as e:
            log.error(f"Failed to write dimensions.json after merge: {e}")
            return {"success": False, "error": str(e)}

        # Log activity
        db = await get_db()
        try:
            activity_id = str(uuid.uuid4())[:8]
            await db.execute(
                """INSERT INTO framework_activity (id, action, checkpoint_id, dimension_id, details)
                   VALUES (?, ?, ?, ?, ?)""",
                (
                    activity_id,
                    "checkpoint_merged",
                    keep_id,
                    keep_dim["id"] if keep_dim else "",
                    json.dumps({
                        "kept": keep_id,
                        "removed": remove_id,
                        "merged_text": merged_data.get("merged_text", "")[:80],
                    }),
                ),
            )
            await db.commit()
        except Exception as e:
            log.warning(f"Failed to log merge activity: {e}")
        finally:
            pass  # singleton connection, no close needed

        log.info(f"Merged checkpoint {remove_id} into {keep_id}")
        return {
            "success": True,
            "kept": keep_id,
            "removed": remove_id,
            "merged_sources": merged_sources,
        }

    async def _batch_embed(self, texts: list[str]) -> list[list[float]]:
        """Batch-embed texts using Gemini with rate limiting.

        Processes in small batches with delays to avoid 429 errors.
        """
        if not GEMINI_API_KEY:
            log.warning("No Gemini API key — cannot embed")
            return []

        genai.configure(api_key=GEMINI_API_KEY)
        embeddings = []
        loop = asyncio.get_event_loop()

        for i, text in enumerate(texts):
            for attempt in range(4):
                try:
                    result = await loop.run_in_executor(
                        None,
                        functools.partial(
                            genai.embed_content,
                            model="models/gemini-embedding-2-preview",
                            content=text,
                            task_type="retrieval_document",
                        ),
                    )
                    embeddings.append(result["embedding"])
                    # Rate limit: small delay between embeds
                    if i < len(texts) - 1:
                        await asyncio.sleep(0.3)
                    break
                except Exception as e:
                    err_str = str(e)
                    if ("429" in err_str or "Resource exhausted" in err_str) and attempt < 3:
                        wait = 2 ** (attempt + 1)
                        log.warning(f"Rate limited on embed {i}, retry {attempt+1}/3 in {wait}s...")
                        await asyncio.sleep(wait)
                    else:
                        log.error(f"Failed to embed text {i}: {e}")
                        return []  # Abort on non-retryable error

        return embeddings
