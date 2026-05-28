"""
Evolution Scheduler — Manages periodic execution of the Evolution Agent.

Uses APScheduler's AsyncIOScheduler for cron-based scheduling.
Supports weekly, daily, and manual modes.
"""

from __future__ import annotations

import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler

log = logging.getLogger("evolution.scheduler")

scheduler = AsyncIOScheduler()


def setup_evolution_scheduler(app):
    """Set up the evolution agent scheduler.

    Reads configuration from config.py and registers the appropriate
    cron job based on EVOLUTION_SCHEDULE setting.

    Args:
        app: The FastAPI application instance.
    """
    from config import (
        EVOLUTION_ENABLED,
        EVOLUTION_SCHEDULE,
        EVOLUTION_DAY,
        EVOLUTION_HOUR,
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
    log.info(f"Evolution scheduler started: {EVOLUTION_SCHEDULE} at {EVOLUTION_HOUR}:00")


def shutdown_evolution_scheduler():
    """Shut down the evolution scheduler gracefully."""
    if scheduler.running:
        scheduler.shutdown(wait=False)
        log.info("Evolution scheduler shut down")
