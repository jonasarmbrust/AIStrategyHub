"""Tests for URL validator (SSRF protection)."""
import sys
from pathlib import Path

# Ensure backend is on the path
sys.path.insert(0, str(Path(__file__).parent.parent))

import pytest
from fastapi import HTTPException
from utils.url_validator import validate_url


def test_valid_https_url():
    assert validate_url("https://example.com") == "https://example.com"


def test_valid_http_url():
    assert validate_url("http://example.com") == "http://example.com"


def test_file_scheme_blocked():
    with pytest.raises(HTTPException) as exc_info:
        validate_url("file:///etc/passwd")
    assert exc_info.value.status_code == 400


def test_ftp_scheme_blocked():
    with pytest.raises(HTTPException) as exc_info:
        validate_url("ftp://example.com/file")
    assert exc_info.value.status_code == 400


def test_data_scheme_blocked():
    with pytest.raises(HTTPException) as exc_info:
        validate_url("data:text/html,<h1>test</h1>")
    assert exc_info.value.status_code == 400


def test_empty_url():
    with pytest.raises(HTTPException) as exc_info:
        validate_url("")
    assert exc_info.value.status_code == 400


def test_no_hostname():
    with pytest.raises(HTTPException) as exc_info:
        validate_url("http://")
    assert exc_info.value.status_code == 400


def test_localhost_blocked():
    with pytest.raises(HTTPException) as exc_info:
        validate_url("http://localhost/admin")
    assert exc_info.value.status_code == 400


def test_127_0_0_1_blocked():
    with pytest.raises(HTTPException) as exc_info:
        validate_url("http://127.0.0.1/admin")
    assert exc_info.value.status_code == 400


def test_private_10_network_blocked():
    """Private 10.x IPs are blocked (either by IP check or DNS resolution failure)."""
    with pytest.raises(HTTPException) as exc_info:
        validate_url("http://10.0.0.1/internal")
    assert exc_info.value.status_code == 400


def test_private_172_network_blocked():
    """Private 172.16.x IPs are blocked."""
    with pytest.raises(HTTPException) as exc_info:
        validate_url("http://172.16.0.1/internal")
    assert exc_info.value.status_code == 400


def test_private_192_network_blocked():
    """Private 192.168.x IPs are blocked."""
    with pytest.raises(HTTPException) as exc_info:
        validate_url("http://192.168.1.1/internal")
    assert exc_info.value.status_code == 400


def test_cloud_metadata_blocked():
    """AWS/cloud metadata endpoint is blocked."""
    with pytest.raises(HTTPException) as exc_info:
        validate_url("http://169.254.169.254/latest/meta-data/")
    assert exc_info.value.status_code == 400


def test_javascript_scheme_blocked():
    """JavaScript scheme is blocked."""
    with pytest.raises(HTTPException) as exc_info:
        validate_url("javascript:alert(1)")
    assert exc_info.value.status_code == 400


def test_gopher_scheme_blocked():
    """Gopher scheme is blocked."""
    with pytest.raises(HTTPException) as exc_info:
        validate_url("gopher://evil.com/")
    assert exc_info.value.status_code == 400

