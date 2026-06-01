"""Centralized web page fetching with URL validation and HTML stripping."""
from __future__ import annotations

import re

import httpx

from utils.url_validator import validate_url


async def fetch_page_text(
    url: str, min_length: int = 100, timeout: int = 30
) -> str:
    """Fetch a URL safely and return stripped text content.
    
    Validates the URL against SSRF attacks, fetches the page,
    and strips HTML tags to return plain text.
    """
    validate_url(url)
    async with httpx.AsyncClient(follow_redirects=True, timeout=timeout) as client:
        resp = await client.get(url)
        resp.raise_for_status()
    text = re.sub(r"<[^>]+>", " ", resp.text)
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) < min_length:
        raise ValueError(f"Page content too short ({len(text)} chars)")
    return text
