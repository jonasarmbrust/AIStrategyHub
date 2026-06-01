"""Centralized AI client with shared configuration and retry logic."""
from __future__ import annotations

import asyncio
import logging

import google.generativeai as genai

from config import GEMINI_API_KEY

log = logging.getLogger("ai_client")
_configured = False
_semaphore = asyncio.Semaphore(3)


def configure_gemini():
    """Configure the Gemini API key (idempotent)."""
    global _configured
    if not _configured and GEMINI_API_KEY:
        genai.configure(api_key=GEMINI_API_KEY)
        _configured = True


def get_model(model_name: str = "gemini-2.5-flash") -> genai.GenerativeModel:
    """Get a configured Gemini model instance."""
    configure_gemini()
    return genai.GenerativeModel(model_name)


async def generate_with_retry(
    prompt: str,
    model_name: str = "gemini-2.5-flash",
    temperature: float = 0.1,
    max_retries: int = 3,
    response_mime_type: str | None = None,
) -> str:
    """Generate content with exponential backoff retry and concurrency limiting."""
    model = get_model(model_name)
    gen_config = {"temperature": temperature}
    if response_mime_type:
        gen_config["response_mime_type"] = response_mime_type

    for attempt in range(max_retries):
        try:
            async with _semaphore:
                response = await asyncio.get_running_loop().run_in_executor(
                    None,
                    lambda: model.generate_content(
                        prompt, generation_config=gen_config
                    ),
                )
                return response.text
        except Exception as e:
            if attempt < max_retries - 1:
                wait = 2 ** (attempt + 1)
                log.warning(
                    "Gemini API error (attempt %d/%d): %s. Retrying in %ds",
                    attempt + 1,
                    max_retries,
                    e,
                    wait,
                )
                await asyncio.sleep(wait)
            else:
                raise
