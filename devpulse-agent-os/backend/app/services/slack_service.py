"""
DevPulse Agent OS — Slack Intelligence Service

Fetches messages from a Slack channel via the slack_sdk WebClient,
extracts ticket/PR indicators (SCRUM-3, PR #4, DEV-101, etc.) from
each message body, and packages a clean payload ready for the local
1.5b SLM correlation pipeline.

Environment variables consumed:
    SLACK_BOT_TOKEN      — Bot User OAuth Token (xoxb-…)
    SLACK_SIGNING_SECRET — Used to verify incoming Event API requests
"""

from __future__ import annotations

import logging
import os
import re
from datetime import datetime
from typing import Any

from slack_sdk import WebClient
from slack_sdk.errors import SlackApiError

logger = logging.getLogger(__name__)

# ─── Regex patterns for ticket/PR indicator extraction ──────────────────────

# Matches: SCRUM-3, DEV-101, JIRA-42, ABC-999, etc.
_TICKET_PATTERN: re.Pattern[str] = re.compile(
    r"\b([A-Z][A-Z0-9]{1,9}-\d{1,6})\b"
)

# Matches: PR #4, PR#12, PR 4, pull request #7
_PR_PATTERN: re.Pattern[str] = re.compile(
    r"(?:PR\s*#?|pull\s+request\s+#?)(\d{1,6})",
    re.IGNORECASE,
)

# Matches: commit SHA abbreviations (7–40 hex chars preceded by word boundary)
_SHA_PATTERN: re.Pattern[str] = re.compile(
    r"\b([0-9a-f]{7,40})\b",
    re.IGNORECASE,
)


def extract_ticket_indicators(text: str) -> dict[str, list[str]]:
    """
    Scan *text* for ticket IDs, PR references, and commit SHAs.

    Returns a dict suitable for direct injection into the SLM context stream::

        {
            "tickets": ["SCRUM-3", "DEV-101"],
            "pull_requests": ["4", "12"],
            "commit_shas": ["a1b2c3d"],
        }

    This data is passed alongside GitHub/Jira metrics so the local 1.5b SLM
    can auto-link Slack conversations to active issues without a round-trip to
    external APIs.
    """
    return {
        "tickets": _TICKET_PATTERN.findall(text),
        "pull_requests": _PR_PATTERN.findall(text),
        "commit_shas": _SHA_PATTERN.findall(text),
    }


# ─── Slack client factory (lazy singleton) ───────────────────────────────────

_client: WebClient | None = None


def _get_client() -> WebClient:
    """Return a cached WebClient; raise clearly if the token is missing."""
    global _client
    if _client is None:
        token = os.getenv("SLACK_BOT_TOKEN")
        if not token:
            raise EnvironmentError(
                "SLACK_BOT_TOKEN is not set. "
                "Add it to your .env file and restart the service."
            )
        _client = WebClient(token=token)
    return _client


# ─── Public API ──────────────────────────────────────────────────────────────


def list_channels() -> list[dict]:
    """
    Return all public channels the bot can see, sorted alphabetically.

    Each dict contains::

        {
            "id":           str,   # Slack channel ID (e.g. "C012AB3CD")
            "name":         str,   # Channel name without the leading #
            "is_member":    bool,  # True if the bot has been invited
            "num_members":  int,   # Approximate member count
        }

    Raises
    ------
    EnvironmentError
        If SLACK_BOT_TOKEN is not configured.
    RuntimeError
        If the Slack API call fails.
    """
    client = _get_client()
    channels: list[dict] = []
    cursor: str | None = None

    try:
        while True:
            kwargs: dict = {
                "exclude_archived": True,
                "types": "public_channel",
                "limit": 200,
            }
            if cursor:
                kwargs["cursor"] = cursor

            response = client.conversations_list(**kwargs)
            for ch in response.get("channels", []):
                channels.append({
                    "id":          ch.get("id", ""),
                    "name":        ch.get("name", ""),
                    "is_member":   ch.get("is_member", False),
                    "num_members": ch.get("num_members", 0),
                })

            next_cursor = (
                response.get("response_metadata", {}).get("next_cursor", "") or ""
            )
            if not next_cursor:
                break
            cursor = next_cursor

    except SlackApiError as exc:
        raise RuntimeError(
            f"Failed to list Slack channels: {exc.response['error']}"
        ) from exc

    channels.sort(key=lambda c: c["name"])
    logger.info("Listed %d Slack channels", len(channels))
    return channels


def fetch_channel_messages(
    channel_name: str,
    limit: int = 20,
) -> list[dict[str, Any]]:
    """
    Fetch the most recent *limit* messages from a public Slack channel.

    Parameters
    ----------
    channel_name:
        The **name** of the channel (without the leading ``#``).
        Example: ``"dev-general"``.
    limit:
        Number of messages to retrieve (default 20, max 1000 per Slack API).

    Returns
    -------
    list[dict]
        Each dict contains::

            {
                "developer_id":    str,           # Slack user ID (e.g. "U012AB3CD")
                "message_text":    str,           # Cleaned message body
                "timestamp":       str,           # ISO-8601 UTC timestamp
                "ticket_indicators": {            # Parsed refs for SLM pipeline
                    "tickets":       list[str],
                    "pull_requests": list[str],
                    "commit_shas":   list[str],
                },
            }

    Raises
    ------
    EnvironmentError
        If ``SLACK_BOT_TOKEN`` is not configured.
    RuntimeError
        If the target channel cannot be found or the API call fails.
    """
    client = _get_client()

    # ── Step 1: Discover the channel ID ──────────────────────────────────────
    channel_id: str | None = None
    cursor: str | None = None

    try:
        while True:
            kwargs: dict[str, Any] = {
                "exclude_archived": True,
                "types": "public_channel",
                "limit": 200,
            }
            if cursor:
                kwargs["cursor"] = cursor

            response = client.conversations_list(**kwargs)
            channels: list[dict[str, Any]] = response.get("channels", [])

            for ch in channels:
                if ch.get("name") == channel_name:
                    channel_id = ch["id"]
                    break

            if channel_id:
                break  # found — stop paginating

            next_cursor: str = (
                response.get("response_metadata", {}).get("next_cursor", "") or ""
            )
            if not next_cursor:
                break  # exhausted all pages
            cursor = next_cursor

    except SlackApiError as exc:
        logger.error("Slack conversations.list failed: %s", exc.response["error"])
        raise RuntimeError(
            f"Failed to list Slack channels: {exc.response['error']}"
        ) from exc

    if not channel_id:
        raise RuntimeError(
            f"Slack channel #{channel_name!r} not found. "
            "Verify the bot has been invited to the channel."
        )

    logger.info("Resolved Slack channel #%s → %s", channel_name, channel_id)

    # ── Step 2: Fetch message history ────────────────────────────────────────
    try:
        history_resp = client.conversations_history(
            channel=channel_id,
            limit=limit,
        )
    except SlackApiError as exc:
        logger.error(
            "Slack conversations.history failed for %s: %s",
            channel_id,
            exc.response["error"],
        )
        raise RuntimeError(
            f"Failed to fetch messages from #{channel_name}: {exc.response['error']}"
        ) from exc

    raw_messages: list[dict[str, Any]] = history_resp.get("messages", [])

    # ── Step 3: Normalize and enrich each message ────────────────────────────
    results: list[dict[str, Any]] = []

    for msg in raw_messages:
        # Skip bot messages and sub-type system messages (channel_join, etc.)
        if msg.get("subtype"):
            continue

        text: str = msg.get("text", "").strip()
        user_id: str = msg.get("user", "UNKNOWN")
        ts_raw: str = msg.get("ts", "0")

        # Convert Slack's Unix epoch float string to ISO-8601 UTC
        try:
            ts_iso = datetime.utcfromtimestamp(float(ts_raw)).strftime(
                "%Y-%m-%dT%H:%M:%SZ"
            )
        except (ValueError, OSError):
            ts_iso = ts_raw

        indicators = extract_ticket_indicators(text)

        results.append(
            {
                "developer_id": user_id,
                "message_text": text,
                "timestamp": ts_iso,
                # Extra context stream injected directly into the SLM pipeline
                "ticket_indicators": indicators,
            }
        )

    logger.info(
        "Fetched %d messages from #%s (channel_id=%s)",
        len(results),
        channel_name,
        channel_id,
    )
    return results


def get_slack_connection_status() -> dict[str, Any]:
    """
    Lightweight health-check: calls ``auth.test`` and returns connection metadata.

    Used by the integration-status endpoint so the dashboard badge can reflect
    the real connection state rather than a static flag.
    """
    try:
        client = _get_client()
        resp = client.auth_test()
        return {
            "status": "connected",
            "workspace": resp.get("team"),
            "bot_user": resp.get("user"),
            "bot_id": resp.get("user_id"),
        }
    except EnvironmentError:
        return {"status": "not_configured", "workspace": None, "bot_user": None}
    except SlackApiError as exc:
        return {
            "status": "error",
            "error": exc.response.get("error", "unknown"),
            "workspace": None,
            "bot_user": None,
        }


# ─── Slack Request Signature Verification ────────────────────────────────────

def verify_slack_signature(body: bytes, timestamp: str, signature: str) -> bool:
    """
    Verify that an incoming HTTP request genuinely originates from Slack by
    validating the HMAC-SHA256 request signature.

    Slack signs every Event API POST with:
        X-Slack-Request-Timestamp  — Unix epoch string
        X-Slack-Signature          — "v0=<hex-hmac>"

    Parameters
    ----------
    body:       Raw request body bytes (must be read before JSON parsing).
    timestamp:  Value of the ``X-Slack-Request-Timestamp`` header.
    signature:  Value of the ``X-Slack-Signature`` header.

    Returns
    -------
    bool
        ``True`` if the signature is valid, ``False`` otherwise.
        Always returns ``True`` when ``SLACK_SIGNING_SECRET`` is not
        configured (development / test mode — log a warning).
    """
    from slack_sdk.signature import SignatureVerifier

    signing_secret = os.getenv("SLACK_SIGNING_SECRET", "")
    if not signing_secret:
        logger.warning(
            "SLACK_SIGNING_SECRET not set — skipping signature verification. "
            "Set it in .env before going to production."
        )
        return True

    verifier = SignatureVerifier(signing_secret)
    return verifier.is_valid(
        body=body,
        timestamp=timestamp,
        signature=signature,
    )
