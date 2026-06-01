"""URL validation to prevent SSRF attacks."""
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
]


def validate_url(url: str) -> str:
    """Validate URL is safe for server-side fetching. Raises HTTPException on failure."""
    parsed = urlparse(url)

    if parsed.scheme.lower() in BLOCKED_SCHEMES:
        raise HTTPException(400, f"URL scheme '{parsed.scheme}' is not allowed")
    if parsed.scheme.lower() not in ("http", "https"):
        raise HTTPException(400, "Only HTTP/HTTPS URLs are allowed")
    if not parsed.hostname:
        raise HTTPException(400, "Invalid URL: no hostname")

    # Resolve hostname and check for private IPs
    try:
        resolved = socket.getaddrinfo(parsed.hostname, None)
        for _, _, _, _, addr in resolved:
            ip = ipaddress.ip_address(addr[0])
            for private_range in PRIVATE_RANGES:
                if ip in private_range:
                    raise HTTPException(
                        400,
                        "URLs pointing to private/internal networks are not allowed",
                    )
    except socket.gaierror:
        raise HTTPException(400, f"Could not resolve hostname: {parsed.hostname}")

    return url
