"""Shared mocks for AI services (Gemini, Tavily)."""
from unittest.mock import MagicMock, patch


def mock_gemini_response(text: str = '{"score": 3, "justification": "test"}'):
    """Create a mock Gemini API response."""
    response = MagicMock()
    response.text = text
    return response


def patch_gemini():
    """Context manager to mock all Gemini calls."""
    return patch(
        "google.generativeai.GenerativeModel.generate_content",
        return_value=mock_gemini_response(),
    )
