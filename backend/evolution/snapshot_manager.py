"""Snapshot Manager — Creating and managing framework snapshots.

Handles:
- Creating snapshots of the current framework state before evolution runs
- Cleaning up old snapshots beyond the retention limit
- Compacting verbose logs of older evolution runs
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone

from database import get_db

log = logging.getLogger("evolution.snapshot_manager")


async def create_snapshot(run_id: str) -> str:
    """Create a snapshot of the current framework for rollback.

    Args:
        run_id: The evolution run ID to associate with this snapshot.

    Returns:
        The snapshot ID string.
    """
    import uuid

    snapshot_id = str(uuid.uuid4())[:8]
    try:
        from knowledge_base.checklist_generator import safe_read_json
        data = await safe_read_json()

        # Count total checkpoints
        cp_count = sum(
            len(dim.get("checkpoints", []))
            for dim in data.get("dimensions", [])
        )

        # Generate version tag
        version_tag = f"v{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}"

        async with get_db() as db:
            await db.execute(
                """INSERT INTO framework_snapshots (id, run_id, snapshot_data, checkpoint_count, version_tag)
                   VALUES (?, ?, ?, ?, ?)""",
                (snapshot_id, run_id, json.dumps(data), cp_count, version_tag),
            )

        log.info(f"Framework snapshot created: {snapshot_id} ({cp_count} checkpoints)")
    except Exception as e:
        log.error(f"Failed to create snapshot: {e}")

    return snapshot_id


async def cleanup_old_snapshots(keep_count: int = 20):
    """Delete old framework snapshots beyond the retention limit.

    Args:
        keep_count: Number of most recent snapshots to retain.
    """
    try:
        async with get_db() as db:
            cursor = await db.execute(
                "SELECT id FROM framework_snapshots ORDER BY created_at DESC"
            )
            all_ids = [row["id"] for row in await cursor.fetchall()]

            if len(all_ids) <= keep_count:
                return

            to_delete = all_ids[keep_count:]
            for snap_id in to_delete:
                await db.execute("DELETE FROM framework_snapshots WHERE id = ?", (snap_id,))
        log.info(f"Cleaned up {len(to_delete)} old snapshots (kept {keep_count})")
    except Exception as e:
        log.warning(f"Snapshot cleanup failed: {e}")


async def compact_old_run_logs(keep_full: int = 5):
    """Compact verbose logs of older evolution runs to save space.

    Args:
        keep_full: Number of most recent runs whose logs are kept in full.
    """
    try:
        async with get_db() as db:
            cursor = await db.execute(
                "SELECT id, log FROM evolution_runs ORDER BY started_at DESC"
            )
            rows = await cursor.fetchall()

            for i, row in enumerate(rows):
                if i < keep_full:
                    continue  # Keep recent logs in full
                try:
                    log_data = json.loads(row["log"] or "[]")
                    if len(log_data) > 5:
                        # Keep only first 2 and last 3 entries as summary
                        compacted = log_data[:2] + [f"... ({len(log_data) - 5} entries compacted) ..."] + log_data[-3:]
                        await db.execute(
                            "UPDATE evolution_runs SET log = ? WHERE id = ?",
                            (json.dumps(compacted), row["id"]),
                        )
                except (json.JSONDecodeError, TypeError):
                    continue

        log.info(f"Compacted logs for {max(0, len(rows) - keep_full)} old runs")
    except Exception as e:
        log.warning(f"Log compaction failed: {e}")
