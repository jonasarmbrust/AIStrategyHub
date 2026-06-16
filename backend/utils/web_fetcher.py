"""Centralized web page fetching with SSRF-safe redirect handling.

Key security features:
- Validates the initial URL against private/internal IP ranges
- Follows redirects manually, validating each hop's resolved IP
- Caps the maximum number of redirects to prevent infinite loops
"""
from __future__ import annotations

import re
import socket

import httpx

from config import MAX_REDIRECTS
from utils.url_validator import _check_ip, validate_url


async def fetch_page_text(
    url: str, min_length: int = 100, timeout: int = 30
) -> str:
    """Fetch a URL safely and return stripped text content.

    Validates the URL and every redirect hop against SSRF attacks,
    fetches the page, and strips HTML tags to return plain text.
    """
    final_url = await safe_fetch_url(url, timeout=timeout)
    return final_url["text"]


async def safe_fetch_url(
    url: str,
    timeout: int = 30,
    headers: dict | None = None,
) -> dict:
    """Fetch a URL with SSRF-safe redirect handling.

    Returns dict with 'text' (response body), 'url' (final URL),
    and 'status_code'.

    Each redirect hop is validated:
    1. The redirect target URL is checked (scheme, hostname blocklist)
    2. The resolved IP is checked against private ranges
    """
    validate_url(url)
    current_url = url
    default_headers = {"User-Agent": "AI-Strategy-Hub/2.0"}
    if headers:
        default_headers.update(headers)

    async with httpx.AsyncClient(
        follow_redirects=False, timeout=timeout, headers=default_headers
    ) as client:
        for hop in range(MAX_REDIRECTS + 1):
            resp = await client.get(current_url)

            if resp.status_code in (301, 302, 303, 307, 308):
                location = resp.headers.get("location")
                if not location:
                    raise httpx.HTTPStatusError(
                        "Redirect without Location header",
                        request=resp.request,
                        response=resp,
                    )
                # Resolve relative redirects
                current_url = str(resp.url.join(location))
                # Validate the redirect target against SSRF
                validate_url(current_url)
                # Additionally resolve DNS and check IPs to prevent rebinding
                _validate_resolved_ips(current_url)
                continue

            resp.raise_for_status()

            text = re.sub(r"<[^>]+>", " ", resp.text)
            text = re.sub(r"\s+", " ", text).strip()
            return {"text": text, "url": str(resp.url), "status_code": resp.status_code}

        raise httpx.TooManyRedirects(
            f"Too many redirects (max {MAX_REDIRECTS})",
            request=resp.request,  # type: ignore[possibly-undefined]
        )


def _validate_resolved_ips(url: str) -> None:
    """Resolve a URL's hostname and check all IPs against private ranges.

    This provides a second layer of SSRF protection: even if the URL
    hostname passes validate_url's check, we verify the actual IPs
    that would be connected to are also safe. This mitigates DNS rebinding
    by checking closer to the actual connection time.
    """
    from urllib.parse import urlparse

    parsed = urlparse(url)
    if not parsed.hostname:
        return

    try:
        resolved = socket.getaddrinfo(parsed.hostname, None)
        for _, _, _, _, addr in resolved:
            _check_ip(addr[0])
    except socket.gaierror:
        pass  # validate_url already handles resolution failures
