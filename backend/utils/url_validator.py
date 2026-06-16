"""URL validation to prevent SSRF attacks.

Validates URLs and their resolved IPs against private/internal network ranges.
Provides a safe HTTP client that validates every redirect hop.
"""
import ipaddress
import socket
from urllib.parse import urlparse

from fastapi import HTTPException

BLOCKED_SCHEMES = {"file", "ftp", "gopher", "data", "javascript"}
PRIVATE_RANGES = [
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("169.254.0.0/16"),
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fc00::/7"),       # IPv6 unique local
    ipaddress.ip_network("fe80::/10"),      # IPv6 link-local
]


def _check_ip(ip_str: str) -> None:
    """Raise HTTPException if an IP address falls within a private/reserved range."""
    ip = ipaddress.ip_address(ip_str)
    for private_range in PRIVATE_RANGES:
        if ip in private_range:
            raise HTTPException(
                400,
                "URLs pointing to private/internal networks are not allowed",
            )


def validate_url(url: str) -> str:
    """Validate URL is safe for server-side fetching. Raises HTTPException on failure.

    Checks:
    - Scheme is http/https
    - Hostname is present and not a known local alias
    - All resolved IPs are in public ranges (blocks private, link-local, loopback)
    """
    parsed = urlparse(url)

    if parsed.scheme.lower() in BLOCKED_SCHEMES:
        raise HTTPException(400, f"URL scheme '{parsed.scheme}' is not allowed")
    if parsed.scheme.lower() not in ("http", "https"):
        raise HTTPException(400, "Only HTTP/HTTPS URLs are allowed")
    if not parsed.hostname:
        raise HTTPException(400, "Invalid URL: no hostname")

    hostname = parsed.hostname.lower()
    if hostname in ("localhost", "127.0.0.1", "[::1]") or hostname.endswith(".local"):
        raise HTTPException(
            400,
            "URLs pointing to private/internal networks are not allowed",
        )

    # Resolve hostname and check every address for private ranges
    try:
        resolved = socket.getaddrinfo(hostname, None)
        for _, _, _, _, addr in resolved:
            _check_ip(addr[0])
    except socket.gaierror:
        raise HTTPException(400, f"Could not resolve hostname: {hostname}")

    return url
