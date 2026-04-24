"""
Rate limiting helpers for AI Strategy Hub.
Provides limiter instance and decorators for LLM-heavy endpoints.
"""

from __future__ import annotations

import logging

log = logging.getLogger("rate_limit")

# Try to import slowapi; provide no-op fallback if not installed
try:
    from slowapi import Limiter
    from slowapi.util import get_remote_address

    limiter = Limiter(key_func=get_remote_address)
    RATE_LIMITING_AVAILABLE = True
    log.info("Rate limiting enabled (slowapi)")
except ImportError:
    limiter = None
    RATE_LIMITING_AVAILABLE = False
    log.warning("slowapi not installed — rate limiting disabled")


def get_limiter():
    """Return the limiter instance or None if unavailable."""
    return limiter
