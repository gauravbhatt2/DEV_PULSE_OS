"""
DevPulse Agent OS — GitHub & Jira Webhook Ingress
Routes:
  POST /webhooks/github  — GitHub App webhook events
  POST /webhooks/jira    — Jira webhook events
  POST /webhooks/slack   — Slack Event API
  POST /webhooks/cicd    — CI/CD pipeline events
"""

import logging
import re
from typing import Any, Dict

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.config.database import get_db
from app.models.events import CICDPipeline, GitHubEvent, JiraEvent, SlackThread
from app.services.correlation_service import auto_correlate_github_event, extract_jira_keys_from_payload

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/webhooks", tags=["Webhooks"])

_JIRA_KEY_RE = re.compile(r"\b([A-Z][A-Z0-9_]+-\d+)\b")


def _extract_jira_key(text: str):
    if not text:
        return None
    match = _JIRA_KEY_RE.search(text)
    return match.group(1) if match else None


@router.post(
    "/github",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Ingest GitHub Webhook",
)
async def ingest_github_webhook(
    request: Request,
    db: Session = Depends(get_db),
    x_github_event: str = Header(
        default="unknown",
        alias="X-GitHub-Event",
        description="GitHub event type, e.g. 'push', 'pull_request'.",
    ),
) -> Dict[str, Any]:
    """
    Receives a raw GitHub webhook, extracts a Jira ticket ID from common
    payload fields, persists the event, and auto-creates a LinkedActivity
    record when a ticket ID is found.
    """
    try:
        payload: Dict[str, Any] = await request.json()
    except Exception as exc:
        logger.warning("GitHub webhook — invalid JSON: %s", exc)
        raise HTTPException(status_code=400, detail="Request body must be valid JSON.")

    extracted_ticket_id = extract_jira_keys_from_payload(payload)

    event = GitHubEvent(
        event_type=x_github_event,
        payload=payload,
        extracted_ticket_id=extracted_ticket_id,
    )

    try:
        db.add(event)
        db.commit()
        db.refresh(event)
    except Exception as exc:
        db.rollback()
        logger.error("GitHub webhook — DB commit failed: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to persist GitHub event.")

    # Auto-correlate: create LinkedActivity if ticket ID was extracted
    linked = auto_correlate_github_event(event, db)

    logger.info(
        "GitHub event stored: id=%s type=%r ticket=%s linked=%s",
        event.id,
        event.event_type,
        event.extracted_ticket_id,
        linked.id if linked else None,
    )

    return {
        "status": "accepted",
        "event_id": event.id,
        "event_type": event.event_type,
        "extracted_ticket_id": event.extracted_ticket_id,
        "linked_activity_id": linked.id if linked else None,
    }


@router.post(
    "/jira",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Ingest Jira Webhook",
)
async def ingest_jira_webhook(
    request: Request,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """
    Receives a Jira webhook payload, parses the ticket key, and persists
    the event.
    """
    try:
        payload: Dict[str, Any] = await request.json()
    except Exception as exc:
        logger.warning("Jira webhook — invalid JSON: %s", exc)
        raise HTTPException(status_code=400, detail="Request body must be valid JSON.")

    event_type: str = payload.get("webhookEvent") or payload.get("event_type") or "unknown"

    ticket_id = (
        payload.get("issue", {}).get("key")
        or payload.get("issue_key")
    )

    if not ticket_id:
        import json
        ticket_id = _extract_jira_key(json.dumps(payload)) or "UNKNOWN"

    event = JiraEvent(
        event_type=event_type,
        ticket_id=ticket_id,
        payload=payload,
    )

    try:
        db.add(event)
        db.commit()
        db.refresh(event)
    except Exception as exc:
        db.rollback()
        logger.error("Jira webhook — DB commit failed: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to persist Jira event.")

    logger.info("Jira event stored: id=%s type=%r ticket=%s", event.id, event.event_type, event.ticket_id)

    return {
        "status": "accepted",
        "event_id": event.id,
        "event_type": event.event_type,
        "ticket_id": event.ticket_id,
    }


@router.post(
    "/slack",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Ingest Slack Event",
)
async def ingest_slack_webhook(
    request: Request,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Receives a Slack Event API payload and stores it."""
    try:
        payload: Dict[str, Any] = await request.json()
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Request body must be valid JSON.")

    if "challenge" in payload:
        return {"challenge": payload["challenge"]}

    event_data = payload.get("event", {})
    channel_id = event_data.get("channel", payload.get("channel_id", "unknown"))
    thread_ts = event_data.get("thread_ts") or event_data.get("ts", "unknown")
    user_id = event_data.get("user", payload.get("user_id", "unknown"))
    message_content = event_data.get("text", payload.get("text", ""))

    thread = SlackThread(
        channel_id=channel_id,
        thread_ts=thread_ts,
        user_id=user_id,
        message_content=message_content,
    )

    try:
        db.add(thread)
        db.commit()
        db.refresh(thread)
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to persist Slack thread.")

    return {"status": "accepted", "thread_id": thread.id, "channel_id": thread.channel_id}


@router.post(
    "/cicd",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Ingest CI/CD Pipeline Event",
)
async def ingest_cicd_webhook(
    request: Request,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Receives a CI/CD pipeline payload and stores it."""
    try:
        payload: Dict[str, Any] = await request.json()
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Request body must be valid JSON.")

    repository_id = payload.get("repository") or payload.get("repo") or "unknown"
    pipeline_run_id = str(payload.get("run_id") or payload.get("id") or "unknown")
    pipeline_status = payload.get("status") or payload.get("conclusion", "unknown")
    duration_seconds = payload.get("duration_seconds") or payload.get("duration")
    commit_sha = payload.get("commit_sha") or payload.get("head_sha") or payload.get("sha", "0" * 40)

    pipeline = CICDPipeline(
        repository_id=repository_id,
        pipeline_run_id=pipeline_run_id,
        status=pipeline_status,
        duration_seconds=int(duration_seconds) if duration_seconds else None,
        commit_sha=commit_sha,
    )

    try:
        db.add(pipeline)
        db.commit()
        db.refresh(pipeline)
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to persist CI/CD event.")

    return {
        "status": "accepted",
        "pipeline_id": pipeline.id,
        "pipeline_run_id": pipeline.pipeline_run_id,
        "pipeline_status": pipeline.status,
    }
