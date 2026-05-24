"""
DevPulse Agent OS — Correlation Engine
Automatically creates LinkedActivity records when GitHub events contain
extractable Jira ticket IDs. Also enriches records with Jira metadata.
"""

import logging
import re
from typing import Optional

from sqlalchemy.orm import Session

from app.models.events import GitHubEvent, LinkedActivity

logger = logging.getLogger(__name__)

_JIRA_KEY_RE = re.compile(r"\b([A-Z][A-Z0-9_]+-\d+)\b")


def extract_jira_key(text: str) -> Optional[str]:
    """Return the first Jira issue key found in text, or None."""
    if not text:
        return None
    match = _JIRA_KEY_RE.search(text)
    return match.group(1) if match else None


def extract_jira_keys_from_payload(payload: dict) -> Optional[str]:
    """
    Extract the first Jira ticket key from a GitHub webhook payload.
    Checks commit messages, PR title, PR branch name, and ref field.
    """
    # Commit messages (push event)
    for commit in payload.get("commits", []):
        key = extract_jira_key(commit.get("message", ""))
        if key:
            return key

    # PR title and branch name (pull_request event)
    pr = payload.get("pull_request", {})
    for field in (pr.get("title", ""), pr.get("head", {}).get("ref", "")):
        key = extract_jira_key(field)
        if key:
            return key

    # Branch ref (push event)
    key = extract_jira_key(payload.get("ref", ""))
    if key:
        return key

    return None


def auto_correlate_github_event(
    event: GitHubEvent,
    db: Session,
    match_type: str = "regex",
) -> Optional[LinkedActivity]:
    """
    If a GitHubEvent has an extracted_ticket_id, automatically create
    a LinkedActivity record linking it to that Jira ticket.

    Idempotent: skips creation if the link already exists.
    match_type: 'regex' (default) | 'ai' (Groq semantic match)
    """
    if not event.extracted_ticket_id:
        return None

    existing = (
        db.query(LinkedActivity)
        .filter(
            LinkedActivity.github_event_id == event.id,
            LinkedActivity.jira_ticket_id == event.extracted_ticket_id,
        )
        .first()
    )

    if existing:
        logger.debug(
            "LinkedActivity already exists for github_event_id=%s ticket=%s",
            event.id,
            event.extracted_ticket_id,
        )
        return existing

    # Build description from payload
    description_parts = []
    if event.event_type == "push":
        commits = event.payload.get("commits", [])
        if commits:
            description_parts.append(f"Push: {commits[0].get('message', '')[:120]}")
            repo = event.payload.get("repository", {}).get("full_name", "")
            if repo:
                description_parts.append(f"Repository: {repo}")
    elif event.event_type == "pull_request":
        pr = event.payload.get("pull_request", {})
        description_parts.append(f"PR #{pr.get('number', '?')}: {pr.get('title', '')[:120]}")
        description_parts.append(f"Action: {event.payload.get('action', 'unknown')}")

    description = " | ".join(description_parts) if description_parts else f"GitHub {event.event_type} event"

    linked = LinkedActivity(
        github_event_id=event.id,
        jira_ticket_id=event.extracted_ticket_id,
        description=description,
        match_type=match_type,
    )

    try:
        db.add(linked)
        db.commit()
        db.refresh(linked)
        logger.info(
            "Auto-correlation created: github_event_id=%s → jira_ticket=%s (match_type=%s)",
            event.id,
            event.extracted_ticket_id,
            match_type,
        )
        return linked
    except Exception as exc:
        db.rollback()
        logger.error("Auto-correlation failed for event %s: %s", event.id, exc)
        return None


def run_correlation_pass(db: Session) -> dict:
    """
    Run a full correlation pass over all GitHub events that have an
    extracted_ticket_id but no existing LinkedActivity record.
    Returns a summary of the pass.
    """
    from sqlalchemy import select, outerjoin

    uncorrelated = (
        db.query(GitHubEvent)
        .outerjoin(LinkedActivity, GitHubEvent.id == LinkedActivity.github_event_id)
        .filter(
            GitHubEvent.extracted_ticket_id.isnot(None),
            LinkedActivity.id.is_(None),
        )
        .all()
    )

    created = 0
    errors = 0

    for event in uncorrelated:
        result = auto_correlate_github_event(event, db)
        if result:
            created += 1
        else:
            errors += 1

    logger.info(
        "Correlation pass complete: %d events processed, %d links created, %d errors",
        len(uncorrelated),
        created,
        errors,
    )

    return {
        "events_processed": len(uncorrelated),
        "links_created": created,
        "errors": errors,
    }
