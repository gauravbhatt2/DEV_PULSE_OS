"""
DevPulse Agent OS — Slack Intelligence Router

Exposes:
    GET  /api/v1/slack/sync          – Fetch latest channel messages
    GET  /api/v1/slack/status        – Connection health-check for the dashboard badge
"""

from __future__ import annotations

import logging
import os
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from app.services.slack_service import (
    fetch_channel_messages,
    get_slack_connection_status,
    list_channels,
)

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/v1/slack",
    tags=["Slack Intelligence"],
)

# ─── Response Schemas ────────────────────────────────────────────────────────


class TicketIndicators(BaseModel):
    """Ticket/PR references extracted from a Slack message — fed into the SLM."""

    tickets: list[str] = Field(
        default_factory=list,
        description="Jira-style ticket IDs found in the message (e.g. SCRUM-3, DEV-101).",
        examples=[["SCRUM-3", "DEV-101"]],
    )
    pull_requests: list[str] = Field(
        default_factory=list,
        description="Pull-request numbers referenced in the message (e.g. PR #4 → '4').",
        examples=[["4", "12"]],
    )
    commit_shas: list[str] = Field(
        default_factory=list,
        description="Commit SHA abbreviations found in the message body.",
        examples=[["a1b2c3d"]],
    )


class SlackMessage(BaseModel):
    """A single Slack message enriched with SLM-ready context indicators."""

    developer_id: str = Field(
        description="Slack user ID of the message author (e.g. U012AB3CD).",
        examples=["U012AB3CD"],
    )
    message_text: str = Field(
        description="Cleaned body of the Slack message.",
        examples=["Reviewed SCRUM-3 — merging PR #4 shortly."],
    )
    timestamp: str = Field(
        description="ISO-8601 UTC timestamp of the message.",
        examples=["2026-05-24T12:00:00Z"],
    )
    ticket_indicators: TicketIndicators = Field(
        description="Auto-extracted ticket/PR/SHA references for the SLM pipeline."
    )


class SlackSyncResponse(BaseModel):
    """Top-level payload returned by GET /api/v1/slack/sync."""

    channel: str = Field(
        description="Name of the Slack channel that was queried.",
        examples=["dev-general"],
    )
    message_count: int = Field(
        description="Number of messages returned in this payload.",
        examples=[20],
    )
    messages: list[SlackMessage] = Field(
        description="Ordered list of Slack messages (newest first)."
    )
    synced_at: str = Field(
        description="ISO-8601 UTC timestamp of when this sync was performed."
    )


class SlackStatusResponse(BaseModel):
    """Connection health payload for the dashboard Slack badge."""

    status: str = Field(
        description="One of: connected | not_configured | error.",
        examples=["connected"],
    )
    workspace: str | None = Field(
        default=None,
        description="Slack workspace name (team name).",
    )
    bot_user: str | None = Field(
        default=None,
        description="Slack bot username.",
    )
    bot_id: str | None = Field(
        default=None,
        description="Slack bot user ID.",
    )


# ─── Endpoints ───────────────────────────────────────────────────────────────


@router.get(
    "/channels",
    summary="List all visible Slack channels",
    description=(
        "Returns every public channel the bot token can see, sorted alphabetically. "
        "Used by the Slack Intelligence sidebar to render the channel switcher."
    ),
)
async def get_slack_channels() -> dict:
    """
    **GET /api/v1/slack/channels**

    Returns the full list of public Slack channels visible to the bot.

    Each entry contains ``id``, ``name``, ``is_member``, and ``num_members``.
    Channels where ``is_member=false`` can still be listed but the bot must be
    invited before ``/sync`` will return messages for them.
    """
    try:
        channels = list_channels()
        return {"channels": channels, "count": len(channels)}
    except EnvironmentError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        )
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        )


@router.get(
    "/sync",
    response_model=SlackSyncResponse,
    summary="Fetch latest Slack channel messages",
    description=(
        "Queries the configured Slack workspace for the most recent messages in "
        "*channel_name*, extracts ticket/PR/SHA indicators from each message body, "
        "and returns a structured payload that the frontend dashboard and local 1.5b "
        "SLM pipeline can consume directly for GitHub ↔ Jira ↔ Slack correlation."
    ),
    response_description="Structured Slack message payload with extracted SLM context.",
)
async def sync_slack_messages(
    channel_name: str = Query(
        default=None,
        description=(
            "Name of the Slack channel to fetch messages from (without the leading #). "
            "Falls back to the SLACK_DEFAULT_CHANNEL env variable when omitted."
        ),
        examples=["dev-general"],
    ),
    limit: int = Query(
        default=20,
        ge=1,
        le=100,
        description="Maximum number of messages to return (1–100).",
    ),
) -> SlackSyncResponse:
    """
    **GET /api/v1/slack/sync**

    Fetches the *limit* most recent messages from *channel_name* (defaults to
    the ``SLACK_DEFAULT_CHANNEL`` environment variable).

    Each message is enriched with ``ticket_indicators`` — a structured dict
    containing all Jira ticket IDs, PR numbers, and commit SHAs found in the
    message body. This context stream is consumed directly by the local 1.5b SLM
    to auto-link Slack discussions to active GitHub commits and Jira issues.

    ### Example response fragment
    ```json
    {
      "channel": "dev-general",
      "message_count": 2,
      "messages": [
        {
          "developer_id": "U012AB3CD",
          "message_text": "Resolved SCRUM-3 — PR #4 is ready for review.",
          "timestamp": "2026-05-24T12:00:00Z",
          "ticket_indicators": {
            "tickets": ["SCRUM-3"],
            "pull_requests": ["4"],
            "commit_shas": []
          }
        }
      ],
      "synced_at": "2026-05-24T12:01:00Z"
    }
    ```
    """
    from datetime import datetime

    # Resolve target channel
    resolved_channel = channel_name or os.getenv("SLACK_DEFAULT_CHANNEL", "")
    if not resolved_channel:
        raise HTTPException(
            status_code=422,
            detail=(
                "No channel specified. Pass ?channel_name=<name> or set the "
                "SLACK_DEFAULT_CHANNEL environment variable."
            ),
        )

    try:
        raw_messages: list[dict[str, Any]] = fetch_channel_messages(
            channel_name=resolved_channel,
            limit=limit,
        )
    except EnvironmentError as exc:
        logger.warning("Slack token not configured: %s", exc)
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except RuntimeError as exc:
        logger.error("Slack fetch error: %s", exc)
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Unexpected error fetching Slack messages")
        raise HTTPException(
            status_code=500, detail=f"Internal error: {exc}"
        ) from exc

    # Coerce raw dicts → validated Pydantic models
    messages = [
        SlackMessage(
            developer_id=m["developer_id"],
            message_text=m["message_text"],
            timestamp=m["timestamp"],
            ticket_indicators=TicketIndicators(**m.get("ticket_indicators", {})),
        )
        for m in raw_messages
    ]

    return SlackSyncResponse(
        channel=resolved_channel,
        message_count=len(messages),
        messages=messages,
        synced_at=datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
    )


@router.get(
    "/status",
    response_model=SlackStatusResponse,
    summary="Slack connection health-check",
    description=(
        "Calls Slack's ``auth.test`` API to verify the bot token is valid and "
        "returns workspace/bot metadata. Used by the dashboard header to render "
        "the **'• Slack Connected'** badge in real time."
    ),
)
async def slack_status() -> SlackStatusResponse:
    """
    **GET /api/v1/slack/status**

    Returns the live Slack connection state.  The frontend polls this endpoint
    to determine whether to render the purple **'• Slack Connected'** badge in
    the dashboard header.
    """
    result = get_slack_connection_status()
    return SlackStatusResponse(
        status=result["status"],
        workspace=result.get("workspace"),
        bot_user=result.get("bot_user"),
        bot_id=result.get("bot_id"),
    )
