"""
API Key Authentication Middleware.
Protects all /api/ endpoints when API_AUTH_KEY is configured.
Localhost and health endpoints are exempt in development mode.
"""

from __future__ import annotations

import logging

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from config import API_AUTH_KEY, AUTH_ENABLED

log = logging.getLogger("auth")

# Paths that never require authentication
EXEMPT_PATHS = {
    "/openapi.json",
    "/docs",
    "/redoc",
}

EXEMPT_PREFIXES = (
    "/assets/",
)


class APIKeyMiddleware(BaseHTTPMiddleware):
    """
    Middleware that enforces X-API-Key header on all /api/ routes.
    
    - Disabled entirely when API_AUTH_KEY is not set in .env
    - Localhost requests bypass auth in development
    - Static assets and health endpoint are always exempt
    """

    async def dispatch(self, request: Request, call_next):
        if not AUTH_ENABLED:
            return await call_next(request)

        path = request.url.path

        # Exempt non-API routes (SPA, assets)
        if not path.startswith("/api/"):
            return await call_next(request)

        # Exempt specific paths
        if path in EXEMPT_PATHS:
            return await call_next(request)

        # Exempt prefix paths
        if any(path.startswith(prefix) for prefix in EXEMPT_PREFIXES):
            return await call_next(request)

        # Check API key
        api_key = request.headers.get("X-API-Key", "")

        if not api_key:
            log.warning(f"Unauthorized request to {path} — no API key provided")
            return JSONResponse(
                status_code=401,
                content={
                    "error": "API key required",
                    "code": "AUTH_MISSING_KEY",
                    "detail": "Provide your API key via X-API-Key header.",
                },
            )

        if api_key != API_AUTH_KEY:
            log.warning(f"Unauthorized request to {path} — invalid API key")
            return JSONResponse(
                status_code=403,
                content={
                    "error": "Invalid API key",
                    "code": "AUTH_INVALID_KEY",
                    "detail": "The provided API key is not valid.",
                },
            )

        return await call_next(request)
