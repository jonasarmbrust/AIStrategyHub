"""
Standardized Error Handling for AI Strategy Hub.
Provides a unified error response format across all endpoints.
"""

from __future__ import annotations

import logging
import traceback

from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse

log = logging.getLogger("errors")


class APIError(Exception):
    """Application-level error with structured response."""

    def __init__(self, detail: str, code: str = "INTERNAL_ERROR", status_code: int = 500):
        self.detail = detail
        self.code = code
        self.status_code = status_code
        super().__init__(detail)


def register_error_handlers(app: FastAPI):
    """Register global exception handlers on the FastAPI app."""

    @app.exception_handler(APIError)
    async def handle_api_error(request: Request, exc: APIError):
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "error": exc.detail,
                "code": exc.code,
                "status": exc.status_code,
            },
        )

    @app.exception_handler(HTTPException)
    async def handle_http_exception(request: Request, exc: HTTPException):
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "error": exc.detail,
                "code": f"HTTP_{exc.status_code}",
                "status": exc.status_code,
            },
        )

    @app.exception_handler(Exception)
    async def handle_unexpected_error(request: Request, exc: Exception):
        log.error(f"Unhandled error on {request.method} {request.url.path}: {exc}")
        log.debug(traceback.format_exc())
        return JSONResponse(
            status_code=500,
            content={
                "error": "An unexpected error occurred. Check backend logs for details.",
                "code": "INTERNAL_SERVER_ERROR",
                "status": 500,
            },
        )
