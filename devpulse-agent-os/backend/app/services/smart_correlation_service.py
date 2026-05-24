"""
DevPulse Agent OS — Smart AI Correlation Service
Uses Groq LLM to semantically match GitHub events (with no ticket key in commit)
to the most relevant Jira ticket from the active backlog.

Flow:
  1. Find all GitHub events in DB that have no extracted_ticket_id (no regex match)
     and no existing LinkedActivity record
  2. Fetch active Jira tickets from the Jira API
  3. For each unmatched event, ask Groq:
       "Which ticket does this commit/PR best relate to?"
  4. If Groq returns a confident match → create LinkedActivity with match_type='ai'
"""

import logging
import re
from typing import Any, Dict, List, Optional

import httpx
from sqlalchemy.orm import Session

from app.config.settings import settings
from app.models.events import GitHubEvent, LinkedActivity
from app.services.correlation_service import auto_correlate_github_event
from app.services.priority_engine import extract_jira_description

logger = logging.getLogger(__name__)

_JIRA_KEY_RE = re.compile(r"\b([A-Z][A-Z0-9_]+-\d+)\b")


# ---------------------------------------------------------------------------
# Extract human-readable text from a GitHub event payload
# ---------------------------------------------------------------------------

def _get_event_text(event: GitHubEvent) -> str:
    """Build a short text summary of a GitHub event for the AI prompt."""
    payload = event.payload or {}
    parts = []

    if event.event_type == "push":
        commits = payload.get("commits", [])
        for c in commits[:3]:
            msg = c.get("message", "").split("\n")[0]  # first line only
            if msg:
                parts.append(f"commit: {msg}")
        branch = payload.get("ref", "").replace("refs/heads/", "")
        if branch:
            parts.append(f"branch: {branch}")
        # modified files
        for c in commits[:2]:
            files = c.get("modified", []) + c.get("added", [])
            if files:
                parts.append(f"files: {', '.join(files[:3])}")

    elif event.event_type == "pull_request":
        pr = payload.get("pull_request", {})
        title = pr.get("title", "")
        body = (pr.get("body") or "")[:200]
        branch = pr.get("head", {}).get("ref", "")
        if title:
            parts.append(f"PR title: {title}")
        if branch:
            parts.append(f"branch: {branch}")
        if body:
            parts.append(f"description: {body}")

    return " | ".join(parts) if parts else f"{event.event_type} event"


# ---------------------------------------------------------------------------
# Build the Jira ticket context string for the prompt
# ---------------------------------------------------------------------------

def _build_tickets_context(tickets: List[Dict[str, Any]]) -> str:
    lines = []
    for t in tickets:
        fields = t.get("fields", {})
        key = t.get("key", "")
        summary = fields.get("summary", "")
        desc = extract_jira_description(fields.get("description"))[:120]
        status = fields.get("status", {}).get("name", "")
        line = f"- {key}: {summary}"
        if desc:
            line += f" ({desc})"
        if status:
            line += f" [Status: {status}]"
        lines.append(line)
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Groq call — semantic ticket matching
# ---------------------------------------------------------------------------

async def _match_with_groq(event_text: str, tickets_context: str) -> Optional[str]:
    """
    Ask Groq which Jira ticket a GitHub event most likely relates to.
    Returns a ticket key string (e.g. 'SCRUM-6') or None if no confident match.
    """
    if not settings.groq_api_key:
        logger.warning("GROQ_API_KEY not set — skipping AI matching")
        return None

    prompt = (
        "You are a developer intelligence system that links GitHub commits to Jira tickets.\n"
        "A GitHub event arrived WITHOUT a Jira ticket key in its message.\n"
        "Identify which active Jira ticket this activity is most likely related to.\n\n"
        f"Active Jira Tickets:\n{tickets_context}\n\n"
        f"GitHub Activity:\n{event_text}\n\n"
        "Rules:\n"
        "- Reply with ONLY the ticket key (example: SCRUM-6) if confident the match is correct\n"
        "- Reply with ONLY the word 'none' if no ticket matches or you are unsure\n"
        "- No explanation, no other words\n\n"
        "Answer:"
    )

    headers = {
        "Authorization": f"Bearer {settings.groq_api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": settings.groq_model,
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": 15,
        "temperature": 0.0,
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers=headers,
                json=payload,
            )
            response.raise_for_status()
            text = response.json()["choices"][0]["message"]["content"].strip()
            logger.info("Groq AI matching response for event text '%s': '%s'", event_text[:60], text)

            # Try to extract a ticket key — case insensitive
            match = _JIRA_KEY_RE.search(text.upper())
            if match:
                return match.group(1)

            if "none" in text.lower():
                return None

            # Last resort: if the response is just a project+number pattern
            bare = re.sub(r"[^A-Z0-9-]", "", text.upper())
            if _JIRA_KEY_RE.match(bare):
                return bare

            return None

    except Exception as exc:
        logger.warning("Groq AI matching failed: %s", exc)
        return None


# ---------------------------------------------------------------------------
# AI correlation for a single event
# ---------------------------------------------------------------------------

async def ai_correlate_single_event(
    event: GitHubEvent,
    tickets: List[Dict[str, Any]],
    db: Session,
) -> Optional[LinkedActivity]:
    """
    Try to AI-match a single unlinked GitHub event to a Jira ticket.
    Creates a LinkedActivity with match_type='ai' if matched.
    """
    event_text = _get_event_text(event)
    if not event_text:
        return None

    tickets_context = _build_tickets_context(tickets)
    matched_key = await _match_with_groq(event_text, tickets_context)

    if not matched_key:
        logger.info("AI matching: no confident match for event %s", event.id)
        return None

    # Check if this link already exists
    existing = (
        db.query(LinkedActivity)
        .filter(
            LinkedActivity.github_event_id == event.id,
            LinkedActivity.jira_ticket_id == matched_key,
        )
        .first()
    )
    if existing:
        return existing

    # Inject matched key into event so we can reuse auto_correlate
    event.extracted_ticket_id = matched_key

    linked = auto_correlate_github_event(event, db, match_type="ai")

    if linked:
        logger.info(
            "AI correlation: event %s → %s (text: %s)",
            event.id,
            matched_key,
            event_text[:80],
        )

    return linked


# ---------------------------------------------------------------------------
# Full AI correlation pass — called from /api/correlate endpoint
# ---------------------------------------------------------------------------

async def run_ai_correlation_pass(
    db: Session,
    tickets: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    Find all GitHub events with no ticket ID and no LinkedActivity record,
    then try to AI-match each one to an active Jira ticket.
    """
    if not tickets:
        return {"events_scanned": 0, "ai_links_created": 0, "errors": 0}

    # Find events with NO extracted_ticket_id AND no linked activity
    unlinked_events = (
        db.query(GitHubEvent)
        .outerjoin(LinkedActivity, GitHubEvent.id == LinkedActivity.github_event_id)
        .filter(
            GitHubEvent.extracted_ticket_id.is_(None),
            LinkedActivity.id.is_(None),
        )
        .order_by(GitHubEvent.created_at.desc())
        .limit(30)  # cap to keep API costs low
        .all()
    )

    logger.info("AI correlation pass: found %d unlinked events to process", len(unlinked_events))

    ai_links_created = 0
    errors = 0

    for event in unlinked_events:
        try:
            result = await ai_correlate_single_event(event, tickets, db)
            if result:
                ai_links_created += 1
        except Exception as exc:
            logger.error("AI correlation error for event %s: %s", event.id, exc)
            errors += 1

    return {
        "events_scanned": len(unlinked_events),
        "ai_links_created": ai_links_created,
        "errors": errors,
    }
