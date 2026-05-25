"""
DevPulse Agent OS — Unified LLM Service
Provides a single `chat_complete()` function used by all AI features.

Priority order:
  1. Ollama (local, fast, offline — tries host.docker.internal:11434)
  2. Groq  (cloud fallback — only used if Ollama is unreachable or fails)

Both use the OpenAI-compatible /v1/chat/completions endpoint.

Usage:
    from app.services.llm_service import chat_complete

    text = await chat_complete(
        prompt="Which ticket does this relate to?",
        max_tokens=15,
        temperature=0.0,
    )
"""

import logging
from typing import Optional

import httpx

from app.config.settings import settings

logger = logging.getLogger(__name__)

# Ollama gets a generous timeout (45s) so the 7B model has enough time to load
# from disk into memory on the first request. Subsequent requests will be fast.
_OLLAMA_TIMEOUT = 45.0
_GROQ_TIMEOUT = 15.0
_GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"


async def _call_ollama(prompt: str, max_tokens: int, temperature: float) -> Optional[str]:
    """Try Ollama's native /api/chat endpoint. Returns text or None on any failure."""
    host = settings.ollama_host.rstrip("/")
    url = f"{host}/api/chat"
    model = settings.ollama_model

    payload = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "options": {
            "temperature": temperature,
            "num_predict": max_tokens
        },
        "stream": False,
    }

    try:
        async with httpx.AsyncClient(timeout=_OLLAMA_TIMEOUT) as client:
            resp = await client.post(url, json=payload, headers={"Content-Type": "application/json"})
            resp.raise_for_status()
            text = resp.json()["message"]["content"].strip()
            logger.info("LLM[Ollama/%s]: response received (%d chars)", model, len(text))
            return text
    except httpx.ConnectError:
        logger.info("LLM[Ollama] not reachable at %s — falling back to Groq", host)
        return None
    except httpx.TimeoutException:
        logger.info("LLM[Ollama] timed out after %.1fs — falling back to Groq", _OLLAMA_TIMEOUT)
        return None
    except httpx.HTTPStatusError as exc:
        logger.warning("LLM[Ollama] HTTP %s: %s — falling back to Groq", exc.response.status_code, exc.response.text[:100])
        return None
    except Exception as exc:
        logger.warning("LLM[Ollama] unexpected error: %s — falling back to Groq", exc)
        return None


async def _call_groq(prompt: str, max_tokens: int, temperature: float) -> Optional[str]:
    """Call Groq cloud API. Returns text or None on any failure."""
    if not settings.groq_api_key:
        logger.warning("LLM[Groq] API key not set — cannot fall back")
        return None

    payload = {
        "model": settings.groq_model,
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": max_tokens,
        "temperature": temperature,
    }

    try:
        async with httpx.AsyncClient(timeout=_GROQ_TIMEOUT) as client:
            resp = await client.post(
                _GROQ_URL,
                json=payload,
                headers={
                    "Authorization": f"Bearer {settings.groq_api_key}",
                    "Content-Type": "application/json",
                },
            )
            resp.raise_for_status()
            text = resp.json()["choices"][0]["message"]["content"].strip()
            logger.info("LLM[Groq/%s]: response received (%d chars)", settings.groq_model, len(text))
            return text
    except Exception as exc:
        logger.warning("LLM[Groq] failed: %s", exc)
        return None


async def chat_complete(
    prompt: str,
    max_tokens: int = 200,
    temperature: float = 0.3,
) -> Optional[str]:
    """
    Send a prompt to the best available LLM.

    Strategy:
      1. Try Ollama (local) — fast 8s timeout
      2. If Ollama fails for any reason, try Groq (cloud)
      3. If both fail, return None

    Returns the model's text response, or None if both fail.
    """
    # Always try Ollama first
    result = await _call_ollama(prompt, max_tokens, temperature)
    if result is not None:
        return result

    # Groq fallback
    result = await _call_groq(prompt, max_tokens, temperature)
    if result is not None:
        return result

    logger.error("LLM: both Ollama and Groq failed — no AI response available")
    return None
