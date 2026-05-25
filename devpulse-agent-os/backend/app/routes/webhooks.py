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

from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.config.database import get_db
from app.models.events import CICDPipeline, GitHubEvent, JiraEvent, LinkedActivity, SlackThread
from app.services.correlation_service import auto_correlate_github_event, extract_jira_keys_from_payload

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/webhooks", tags=["Webhooks"])

_JIRA_KEY_RE = re.compile(r"\b([A-Z][A-Z0-9_]+-\d+)\b")


async def _run_ai_match_for_event(event_id: int):
    """
    Background task: run Groq AI matching for a single GitHub event
    that had no ticket key in its commit message.
    """
    from app.config.database import SessionLocal
    from app.services import jira_service
    from app.services.smart_correlation_service import ai_correlate_single_event

    db = SessionLocal()
    try:
        event = db.get(GitHubEvent, event_id)
        if not event:
            return
        # Skip if already linked
        existing = db.query(LinkedActivity).filter(
            LinkedActivity.github_event_id == event_id
        ).first()
        if existing:
            return
        if not jira_service.is_jira_configured():
            return
        try:
            tickets = await jira_service.get_issues()
        except Exception as exc:
            logger.warning("AI matching: could not fetch Jira tickets: %s", exc)
            return
        await ai_correlate_single_event(event, tickets, db)
    except Exception as exc:
        logger.error("AI background task failed for event %s: %s", event_id, exc)
    finally:
        db.close()


async def _correlate_slack_message_to_jira(
    thread_id: int,
    ticket_ids: list,
    user_id: str,
    text: str,
) -> None:
    """
    Background task: attempt to link a newly ingested Slack message to the
    GitHub events already stored in the database that reference the same
    Jira ticket IDs.

    For each ticket ID extracted by the SLM from the Slack message text, this
    task queries ``github_events.extracted_ticket_id`` for a match and logs
    the correlation to ``agent_audit_logs`` so the timeline stays auditable.

    This runs *after* the 200 OK is already returned to Slack, so any latency
    here does not block the Slack handshake.
    """
    from app.config.database import SessionLocal
    from app.models.events import AgentAuditLog, GitHubEvent

    db = SessionLocal()
    try:
        correlations_found = 0
        for ticket_id in ticket_ids:
            matched_events = (
                db.query(GitHubEvent)
                .filter(GitHubEvent.extracted_ticket_id == ticket_id)
                .all()
            )

            for event in matched_events:
                correlations_found += 1
                logger.info(
                    "Slack↔GitHub correlation | slack_thread=%s ticket=%s github_event=%s",
                    thread_id,
                    ticket_id,
                    event.id,
                )

        # Write to audit log so the agent orchestration trail stays complete
        audit = AgentAuditLog(
            agent_name="slack_webhook_correlator",
            action_taken=(
                f"Correlated slack_thread_id={thread_id} to {correlations_found} "
                f"GitHub events via tickets={ticket_ids}"
            ),
            extracted_metadata={
                "thread_id": thread_id,
                "ticket_ids": ticket_ids,
                "user_id": user_id,
                "correlations_found": correlations_found,
                "text_preview": text[:120],
            },
            execution_time_ms=None,
            status="success" if correlations_found > 0 else "no_match",
        )
        db.add(audit)
        db.commit()

        logger.info(
            "Slack correlation complete | thread=%s tickets=%s matches=%d",
            thread_id,
            ticket_ids,
            correlations_found,
        )
    except Exception as exc:
        logger.error(
            "Slack correlation background task failed for thread %s: %s",
            thread_id,
            exc,
        )
    finally:
        db.close()


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
    background_tasks: BackgroundTasks,
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

    # Auto-correlate: regex match if ticket key found
    linked = auto_correlate_github_event(event, db, match_type="regex")

    # If no ticket key found, queue AI semantic matching as background task
    if not extracted_ticket_id:
        background_tasks.add_task(_run_ai_match_for_event, event.id)

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
        "ai_matching_queued": not bool(extracted_ticket_id),
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
    summary="Ingest Slack Event API Webhook",
    description=(
        "Receives Slack Event Subscriptions payloads via ngrok tunnel. "
        "Handles URL verification handshake, validates HMAC-SHA256 signatures, "
        "filters bot-loops, extracts SLM ticket indicators, and persists every "
        "real human message to the slack_threads table."
    ),
)
async def ingest_slack_webhook(
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    x_slack_request_timestamp: str = Header(
        default="",
        alias="X-Slack-Request-Timestamp",
        description="Unix epoch timestamp injected by Slack on every request.",
    ),
    x_slack_signature: str = Header(
        default="",
        alias="X-Slack-Signature",
        description="HMAC-SHA256 signature — format: v0=<hex>",
    ),
) -> Dict[str, Any]:
    """
    **POST /webhooks/slack**

    Entry point for Slack's Event Subscriptions API, exposed via ngrok.

    ### Flow
    1. Read raw body bytes first (signature verification needs them unmodified).
    2. Replay-attack guard — reject if timestamp is > 5 minutes old.
    3. HMAC-SHA256 verification via ``SLACK_SIGNING_SECRET``.
    4. URL Verification challenge — echo immediately so Slack confirms the URL.
    5. Retry deduplication — discard already-seen event retries.
    6. Bot-loop guard — drop ``bot_id`` events to prevent infinite loops.
    7. Extract SLM ticket/PR/SHA indicators from message text.
    8. Persist ``SlackThread`` row to PostgreSQL.
    9. Queue background correlation task for any Jira ticket references found.

    ### ngrok quick-start
    ```
    ngrok http 8000
    # Paste the HTTPS URL into Slack App > Event Subscriptions > Request URL:
    # https://<id>.ngrok.io/webhooks/slack
    ```
    """
    import json
    import time

    from app.services.slack_service import (
        extract_ticket_indicators,
        verify_slack_signature,
    )

    # ── 1. Read raw body (must happen before .json()) ────────────────────────
    raw_body: bytes = await request.body()

    # ── 2. Replay-attack guard (±5 minute window) ────────────────────────────
    if x_slack_request_timestamp:
        try:
            ts_age = abs(time.time() - float(x_slack_request_timestamp))
            if ts_age > 300:
                logger.warning(
                    "Slack webhook rejected — timestamp too old (%ds)", int(ts_age)
                )
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Request timestamp is too old. Possible replay attack.",
                )
        except ValueError:
            pass  # malformed timestamp — let signature check handle it

    # ── 3. HMAC-SHA256 signature verification ────────────────────────────────
    if x_slack_signature:
        valid = verify_slack_signature(
            body=raw_body,
            timestamp=x_slack_request_timestamp,
            signature=x_slack_signature,
        )
        if not valid:
            logger.warning("Slack webhook rejected — invalid signature")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Invalid Slack request signature.",
            )

    # ── 4. Parse JSON payload ─────────────────────────────────────────────────
    try:
        payload: Dict[str, Any] = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        logger.warning("Slack webhook — invalid JSON: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Request body must be valid JSON.",
        )

    # ── 5. URL Verification Challenge ────────────────────────────────────────
    # Slack sends {"type": "url_verification", "challenge": "<token>"} when the
    # endpoint is first registered. Must respond with {"challenge": "<token>"}.
    if payload.get("type") == "url_verification" or "challenge" in payload:
        challenge_token = payload.get("challenge", "")
        logger.info("Slack URL verification handshake — echoing challenge")
        return {"challenge": challenge_token}

    # ── 6. Retry deduplication ────────────────────────────────────────────────
    retry_num = request.headers.get("X-Slack-Retry-Num")
    retry_reason = request.headers.get("X-Slack-Retry-Reason", "")
    if retry_num and int(retry_num) > 0:
        logger.info(
            "Slack webhook — ignoring retry #%s (reason: %s)", retry_num, retry_reason
        )
        return {"status": "ignored", "reason": "retry_deduplicated"}

    # ── 7. Extract the inner event object ─────────────────────────────────────
    event_data: Dict[str, Any] = payload.get("event", {})
    event_type: str = event_data.get("type", "")

    if event_type != "message":
        logger.debug("Slack webhook — ignoring non-message event: %r", event_type)
        return {"status": "ignored", "reason": f"event_type={event_type!r}"}

    # ── 8. Bot-loop guard ─────────────────────────────────────────────────────
    # Drop events authored by any bot (including our own) to prevent infinite
    # message loops when the bot posts to a monitored channel.
    if "bot_id" in event_data or event_data.get("subtype") == "bot_message":
        logger.debug("Slack webhook — ignoring bot message to prevent loop")
        return {"status": "ignored", "reason": "bot_message_filtered"}

    # ── 9. Extract message fields ─────────────────────────────────────────────
    text: str = event_data.get("text", "").strip()
    user_id: str = event_data.get("user", payload.get("user_id", "UNKNOWN"))
    channel_id: str = event_data.get("channel", payload.get("channel_id", "UNKNOWN"))

    # thread_ts is set for replies; fall back to ts for top-level messages
    thread_ts: str = (
        event_data.get("thread_ts")
        or event_data.get("ts")
        or str(time.time())
    )

    # ── 10. SLM indicator extraction ─────────────────────────────────────────
    indicators: Dict[str, list] = extract_ticket_indicators(text)
    ticket_ids: list = indicators.get("tickets", [])

    logger.info(
        "Slack message ingested | channel=%s user=%s tickets=%s preview=%r",
        channel_id,
        user_id,
        ticket_ids or "none",
        text[:80],
    )

    # ── 11. Persist to slack_threads table ────────────────────────────────────
    summary_str = (
        (
            f"tickets={ticket_ids} | "
            f"prs={indicators.get('pull_requests', [])} | "
            f"shas={indicators.get('commit_shas', [])}"
        )
        if any(indicators.values())
        else None
    )

    thread = SlackThread(
        channel_id=channel_id,
        thread_ts=thread_ts,
        user_id=user_id,
        message_content=text,
        summary=summary_str,
    )

    try:
        db.add(thread)
        db.commit()
        db.refresh(thread)
    except Exception as exc:
        db.rollback()
        logger.error("Slack webhook — DB commit failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to persist Slack message.",
        )

    # ── 12. Background correlation pass ──────────────────────────────────────
    # Queue async task to link this Slack message to matching GitHub events
    # via any detected Jira ticket IDs.
    if ticket_ids:
        background_tasks.add_task(
            _correlate_slack_message_to_jira,
            thread_id=thread.id,
            ticket_ids=ticket_ids,
            user_id=user_id,
            text=text,
        )

    return {
        "status": "accepted",
        "thread_id": thread.id,
        "channel_id": channel_id,
        "user_id": user_id,
        "ticket_indicators": indicators,
        "correlation_queued": bool(ticket_ids),
    }



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
