"""Centralized AI client with shared configuration, retry logic, and concurrency control.

All LLM calls should go through this module to ensure:
- Non-blocking execution via run_in_executor
- Concurrency limiting via semaphore
- Smart retry (only retryable errors)
- Centralized model configuration
"""
from __future__ import annotations

import asyncio
import functools
import logging
from collections.abc import Sequence

import google.generativeai as genai

from config import GEMINI_API_KEY, GEMINI_MODEL_FAST, GEMINI_MODEL_REASONING

log = logging.getLogger("ai_client")
_configured = False
_semaphore = asyncio.Semaphore(3)

# Errors that should NOT be retried
_NON_RETRYABLE_KEYWORDS = frozenset({
    "400",           # Bad request
    "403",           # Forbidden / permission denied
    "404",           # Model not found
    "INVALID",       # Invalid argument
    "SAFETY",        # Safety block
    "PERMISSION",    # Permission denied
    "NOT_FOUND",     # Resource not found
    "PermissionDenied",
    "InvalidArgument",
})


def _is_retryable(error: Exception) -> bool:
    """Determine if an error is transient and worth retrying."""
    error_str = str(error).upper()
    for keyword in _NON_RETRYABLE_KEYWORDS:
        if keyword.upper() in error_str:
            return False
    return True


def configure_gemini():
    """Configure the Gemini API key (idempotent)."""
    global _configured
    if not _configured and GEMINI_API_KEY:
        genai.configure(api_key=GEMINI_API_KEY)
        _configured = True


def get_model(model_name: str | None = None) -> genai.GenerativeModel:
    """Get a configured Gemini model instance.

    Args:
        model_name: Model name override. Defaults to GEMINI_MODEL_FAST.
    """
    configure_gemini()
    return genai.GenerativeModel(model_name or GEMINI_MODEL_FAST)


async def generate_with_retry(
    prompt: str,
    model_name: str | None = None,
    temperature: float = 0.1,
    max_retries: int = 3,
    response_mime_type: str | None = None,
    system_instruction: str | None = None,
) -> str:
    """Generate content with exponential backoff retry and concurrency limiting.

    Only retries transient errors (429, 503, network). Non-retryable errors
    (400, safety blocks, permission denied) are raised immediately.
    """
    configure_gemini()
    effective_model_name = model_name or GEMINI_MODEL_FAST

    model_kwargs = {}
    if system_instruction:
        model_kwargs["system_instruction"] = system_instruction
    model = genai.GenerativeModel(effective_model_name, **model_kwargs)

    gen_config = {"temperature": temperature}
    if response_mime_type:
        gen_config["response_mime_type"] = response_mime_type

    for attempt in range(max_retries):
        try:
            async with _semaphore:
                loop = asyncio.get_running_loop()
                response = await loop.run_in_executor(
                    None,
                    functools.partial(
                        model.generate_content,
                        prompt,
                        generation_config=gen_config,
                    ),
                )
                return response.text
        except Exception as e:
            if not _is_retryable(e):
                log.error(
                    "Non-retryable Gemini API error (model=%s): %s",
                    effective_model_name,
                    e,
                )
                raise

            if attempt < max_retries - 1:
                wait = 2 ** (attempt + 1)
                log.warning(
                    "Gemini API error (attempt %d/%d, model=%s): %s. Retrying in %ds",
                    attempt + 1,
                    max_retries,
                    effective_model_name,
                    e,
                    wait,
                )
                await asyncio.sleep(wait)
            else:
                raise


async def chat_with_retry(
    messages: Sequence[dict],
    user_message: str,
    model_name: str | None = None,
    system_instruction: str | None = None,
    temperature: float = 0.3,
    max_retries: int = 3,
) -> str:
    """Send a chat message with history, using run_in_executor for non-blocking execution.

    Args:
        messages: Chat history as list of {"role": "user"|"model", "parts": [str]}.
        user_message: The new user message to send.
        model_name: Model name override. Defaults to GEMINI_MODEL_REASONING.
        system_instruction: Optional system instruction.
        temperature: Generation temperature.
        max_retries: Number of retry attempts for transient errors.
    """
    configure_gemini()
    effective_model_name = model_name or GEMINI_MODEL_REASONING

    model_kwargs = {}
    if system_instruction:
        model_kwargs["system_instruction"] = system_instruction
    model = genai.GenerativeModel(effective_model_name, **model_kwargs)

    gen_config = genai.GenerationConfig(temperature=temperature)

    for attempt in range(max_retries):
        try:
            async with _semaphore:
                loop = asyncio.get_running_loop()

                def _do_chat():
                    chat = model.start_chat(history=list(messages))
                    return chat.send_message(
                        user_message,
                        generation_config=gen_config,
                    )

                response = await loop.run_in_executor(None, _do_chat)
                return response.text
        except Exception as e:
            if not _is_retryable(e):
                log.error(
                    "Non-retryable Gemini chat error (model=%s): %s",
                    effective_model_name,
                    e,
                )
                raise

            if attempt < max_retries - 1:
                wait = 2 ** (attempt + 1)
                log.warning(
                    "Gemini chat error (attempt %d/%d): %s. Retrying in %ds",
                    attempt + 1,
                    max_retries,
                    e,
                    wait,
                )
                await asyncio.sleep(wait)
            else:
                raise
