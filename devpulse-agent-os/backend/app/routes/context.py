"""
DevPulse Agent OS — Ticket Context Route
GET /api/context/{issue_key}

Gathers:
  1. Jira ticket details (title, description, status, priority)
  2. All GitHub events in the DB linked to that ticket key
  3. Groq AI summary combining both data sources
"""

import json
import logging
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config.database import get_db
from app.config.settings import settings
from app.models.events import GitHubEvent, LinkedActivity
from app.services import jira_service
from app.services.priority_engine import extract_jira_description

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Context"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _format_github_event(event: GitHubEvent) -> Dict[str, Any]:
    """Extract clean display fields from a raw GitHubEvent row."""
    payload = event.payload or {}
    commits = payload.get("commits", [])
    pr = payload.get("pull_request", {})
    repo = payload.get("repository", {}).get("full_name", "unknown")
    pusher = payload.get("pusher", {}).get("name") or payload.get("sender", {}).get("login", "unknown")
    branch = payload.get("ref", "").replace("refs/heads/", "")

    commit_list = [
        {
            "sha": c.get("id", "")[:7],
            "message": c.get("message", ""),
            "author": c.get("author", {}).get("name", "unknown"),
        }
        for c in commits[:5]  # cap at 5
    ]

    return {
        "event_id": event.id,
        "event_type": event.event_type,
        "repository": repo,
        "branch": branch,
        "pusher": pusher,
        "commits": commit_list,
        "pr_title": pr.get("title", ""),
        "pr_number": pr.get("number"),
        "pr_state": pr.get("state", ""),
        "pr_url": pr.get("html_url", ""),
        "pr_merged": pr.get("merged", False),
        "created_at": event.created_at.isoformat() if event.created_at else None,
    }


async def _call_groq_for_summary(
    issue_key: str,
    jira_summary: str,
    jira_description: str,
    jira_status: str,
    jira_priority: str,
    github_events: List[Dict[str, Any]],
) -> str:
    """Call Groq API to generate a natural language context summary."""
    if not settings.groq_api_key:
        return _fallback_summary(issue_key, jira_status, github_events)

    # Build a compact GitHub context string for the prompt
    gh_lines = []
    for ev in github_events[:6]:
        if ev["event_type"] == "push":
            for c in ev["commits"]:
                gh_lines.append(f"- PUSH commit by {c['author']}: \"{c['message']}\" on branch {ev['branch']}")
        elif ev["event_type"] == "pull_request":
            state = "open" if not ev["pr_merged"] else "merged"
            gh_lines.append(f"- PULL REQUEST #{ev['pr_number']} ({state}): \"{ev['pr_title']}\" in {ev['repository']}")

    github_context = "\n".join(gh_lines) if gh_lines else "No GitHub activity recorded for this ticket yet."

    prompt = (
        f"You are a senior engineering team AI assistant. Analyze this Jira ticket and its linked GitHub activity, "
        f"then write a concise 2-4 sentence plain-English summary of the current state of work. "
        f"Focus on: what was done, what is still pending, any risks or blockers. Do NOT use markdown.\n\n"
        f"Jira Ticket: {issue_key}\n"
        f"Title: {jira_summary}\n"
        f"Description: {jira_description[:400] if jira_description else 'No description.'}\n"
        f"Current Status: {jira_status}\n"
        f"Priority: {jira_priority}\n\n"
        f"Linked GitHub Activity:\n{github_context}\n\n"
        f"Write the summary now:"
    )

    headers = {
        "Authorization": f"Bearer {settings.groq_api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": settings.groq_model,
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": 300,
        "temperature": 0.4,
    }

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers=headers,
                json=payload,
            )
            response.raise_for_status()
            data = response.json()
            return data["choices"][0]["message"]["content"].strip()
    except Exception as exc:
        logger.warning("Groq context summary failed for %s: %s", issue_key, exc)
        return _fallback_summary(issue_key, jira_status, github_events)


def _fallback_summary(issue_key: str, jira_status: str, github_events: List[Dict]) -> str:
    """Rule-based fallback when Groq is unavailable."""
    count = len(github_events)
    if count == 0:
        return f"{issue_key} is currently {jira_status}. No GitHub commits or pull requests are linked to this ticket yet."
    commit_count = sum(len(e.get("commits", [])) for e in github_events)
    pr_count = sum(1 for e in github_events if e["event_type"] == "pull_request")
    parts = [f"{issue_key} is currently {jira_status}."]
    if commit_count:
        parts.append(f"{commit_count} commit(s) have been pushed for this ticket.")
    if pr_count:
        parts.append(f"{pr_count} pull request(s) are linked.")
    return " ".join(parts)


# ---------------------------------------------------------------------------
# Route
# ---------------------------------------------------------------------------

@router.get("/context/{issue_key}", summary="Ticket Context — Jira + GitHub + AI Summary")
async def get_ticket_context(issue_key: str, db: Session = Depends(get_db)) -> Dict[str, Any]:
    """
    Returns a unified context object for a single Jira ticket:
    - Jira: title, description, status, priority
    - GitHub: all linked commits / PRs from the local DB
    - AI: Groq-generated natural language summary of the current state
    """
    issue_key = issue_key.upper().strip()

    # ── 1. Fetch Jira ticket ──────────────────────────────────────────────
    jira_data: Optional[Dict[str, Any]] = None
    jira_summary = issue_key
    jira_description = ""
    jira_status = "Unknown"
    jira_priority = "Unknown"

    if jira_service.is_jira_configured():
        try:
            jira_data = await jira_service.get_issue_by_key(issue_key)
        except Exception as exc:
            logger.warning("Could not fetch Jira issue %s: %s", issue_key, exc)

    if jira_data:
        fields = jira_data.get("fields", {})
        jira_summary = fields.get("summary", issue_key)
        jira_description = extract_jira_description(fields.get("description"))
        jira_status = fields.get("status", {}).get("name", "Unknown")
        jira_priority = fields.get("priority", {}).get("name", "Unknown")

    # ── 2. Fetch linked GitHub events from DB ────────────────────────────
    try:
        linked_rows = (
            db.execute(
                select(LinkedActivity)
                .where(LinkedActivity.jira_ticket_id == issue_key)
                .order_by(LinkedActivity.created_at.desc())
                .limit(20)
            )
            .scalars()
            .all()
        )

        github_events_raw: List[Dict[str, Any]] = []
        for row in linked_rows:
            gh_event = db.get(GitHubEvent, row.github_event_id)
            if gh_event:
                formatted = _format_github_event(gh_event)
                formatted["linked_at"] = row.created_at.isoformat() if row.created_at else None
                github_events_raw.append(formatted)

    except Exception as exc:
        logger.error("DB query for context failed (issue=%s): %s", issue_key, exc)
        github_events_raw = []

    # ── 3. Generate AI summary ────────────────────────────────────────────
    ai_summary = await _call_groq_for_summary(
        issue_key=issue_key,
        jira_summary=jira_summary,
        jira_description=jira_description,
        jira_status=jira_status,
        jira_priority=jira_priority,
        github_events=github_events_raw,
    )

    # ── 4. Return unified context ─────────────────────────────────────────
    return {
        "issue_key": issue_key,
        "jira": {
            "key": issue_key,
            "summary": jira_summary,
            "description": jira_description,
            "status": jira_status,
            "priority": jira_priority,
            "url": f"{jira_service.get_browse_base_url()}/browse/{issue_key}" if jira_service.is_jira_configured() else None,
        },
        "github": {
            "total_events": len(github_events_raw),
            "events": github_events_raw,
        },
        "ai_summary": ai_summary,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
