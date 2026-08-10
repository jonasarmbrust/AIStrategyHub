"""
Evolution Scheduler — Manages periodic execution of the Evolution Agent.

Uses APScheduler's AsyncIOScheduler with a persistent SQLite job store
so that scheduled jobs survive server restarts.  Missed runs (e.g. the
server was down on Monday at 03:00) are automatically caught up the next
time the server starts, thanks to ``misfire_grace_time``.

Key behaviours:
- **Persistent**: Jobs are stored in ``data/strategy_hub.db`` (table
  ``apscheduler_jobs``).  Removing the DB resets the schedule.
- **Coalesced**: If multiple firings were missed, only *one* catch-up
  run is executed (``coalesce=True``).
- **Grace period**: A missed run is still executed if it is less than
  ``MISFIRE_GRACE_SECONDS`` old (default: 7 days).
"""

from __future__ import annotations

import logging

from apscheduler.jobstores.sqlalchemy import SQLAlchemyJobStore
from apscheduler.schedulers.asyncio import AsyncIOScheduler

log = logging.getLogger("evolution.scheduler")

# ── Constants ─────────────────────────────────────────────────────────────
# Allow catch-up for up to 7 days after a missed firing.
MISFIRE_GRACE_SECONDS = 7 * 24 * 60 * 60  # 604 800 s


def _build_scheduler() -> AsyncIOScheduler:
    """Create a scheduler backed by the project's SQLite database.

    The job store table (``apscheduler_jobs``) is created automatically
    by SQLAlchemy on first use.
    """
    from config import DB_PATH

    db_url = f"sqlite:///{DB_PATH}"

    jobstores = {
        "default": SQLAlchemyJobStore(url=db_url),
    }

    job_defaults = {
        "coalesce": True,             # merge multiple missed firings → 1
        "max_instances": 1,           # never run two cycles at once
        "misfire_grace_time": MISFIRE_GRACE_SECONDS,
    }

    return AsyncIOScheduler(
        jobstores=jobstores,
        job_defaults=job_defaults,
    )


scheduler = _build_scheduler()


def setup_evolution_scheduler(app):
    """Set up the evolution agent scheduler.

    Reads configuration from config.py and registers the appropriate
    cron job based on EVOLUTION_SCHEDULE setting.

    Args:
        app: The FastAPI application instance.
    """
    from config import (
        EVOLUTION_DAY,
        EVOLUTION_ENABLED,
        EVOLUTION_HOUR,
        EVOLUTION_SCHEDULE,
    )

    if not EVOLUTION_ENABLED:
        log.info("Evolution Agent is disabled")
        return

    if EVOLUTION_SCHEDULE == "manual":
        log.info("Evolution Agent set to manual mode — no scheduled runs")
        scheduler.start()
        return

    from evolution.agent import EvolutionAgent
    agent = EvolutionAgent()

    if EVOLUTION_SCHEDULE == "weekly":
        scheduler.add_job(
            agent.run_evolution_cycle,
            "cron",
            day_of_week=EVOLUTION_DAY,
            hour=EVOLUTION_HOUR,
            id="evolution_weekly",
            name="Weekly Framework Evolution",
            replace_existing=True,
        )
    elif EVOLUTION_SCHEDULE == "daily":
        scheduler.add_job(
            agent.run_evolution_cycle,
            "cron",
            hour=EVOLUTION_HOUR,
            id="evolution_daily",
            name="Daily Framework Evolution",
            replace_existing=True,
        )

    scheduler.start()
    log.info(
        f"Evolution scheduler started (persistent): "
        f"{EVOLUTION_SCHEDULE} at {EVOLUTION_HOUR}:00 "
        f"(misfire grace: {MISFIRE_GRACE_SECONDS // 3600}h)"
    )


def shutdown_evolution_scheduler():
    """Shut down the evolution scheduler gracefully."""
    if scheduler.running:
        scheduler.shutdown(wait=False)
        log.info("Evolution scheduler shut down")
