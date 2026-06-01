"""Rate limiting utilities."""
from __future__ import annotations

import logging

log = logging.getLogger("rate_limit")

# The limiter is created and configured in main.py
# This module provides access to it.
_limiter = None
RATE_LIMITING_AVAILABLE = False

try:
    from slowapi import Limiter
    from slowapi.util import get_remote_address
    RATE_LIMITING_AVAILABLE = True
except ImportError:
    log.warning("slowapi not installed – rate-limiting disabled")


def set_limiter(limiter):
    """Set the app's limiter instance (called from main.py)."""
    global _limiter
    _limiter = limiter


def get_limiter():
    """Get the app's limiter instance."""
    return _limiter
