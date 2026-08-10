"""Safe error responses that don't leak internal details."""
import logging

from fastapi import HTTPException

log = logging.getLogger("errors")


def safe_error(
    status_code: int, user_message: str, exc: Exception | None = None
) -> HTTPException:
    """Create an HTTPException with safe user-facing message, logging the full error internally."""
    if exc:
        log.error("%s: %s", user_message, exc, exc_info=True)
    return HTTPException(status_code, user_message)
