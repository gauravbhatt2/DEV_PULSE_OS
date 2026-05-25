"""
DevPulse Agent OS — Ticket Context Route
GET /api/context/{issue_key}

Returns a unified context for a Jira ticket:
  - Jira ticket metadata (title, status, priority, description, URL)
  - GitHub events linked to this ticket (from LinkedActivity table)
  - Groq AI summary of the combined context
"""

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.config.database import get_db
from app.config.settings import settings
from app.models.events import GitHubEvent, LinkedActivity
from app.services import jira_service
from app.services.llm_service import chat_complete

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/context", tags=["Context"])


# ---------------------------------------------------------------------------
# Helper: get GitHub events linked to a ticket
# ---------------------------------------------------------------------------

def _get_github_events_for_ticket(issue_key: str, db: Session) -> List[Dict[str, Any]]:
    records = (
        db.query(LinkedActivity, GitHubEvent)
        .join(GitHubEvent, LinkedActivity.github_event_id == GitHubEvent.id)
        .filter(LinkedActivity.jira_ticket_id == issue_key)
        .order_by(LinkedActivity.created_at.desc())
        .limit(20)
        .all()
    )

    events = []
    for la, ge in records:
        payload = ge.payload or {}
        commits_raw = payload.get("commits", [])
        commits = [
            {
                "sha": c.get("id", "")[:7],
                "message": c.get("message", "").split("\n")[0][:100],
                "author": c.get("author", {}).get("name", ""),
            }
            for c in commits_raw[:5]
        ]

        pr = payload.get("pull_request", {})
        events.append({
            "event_id": ge.id,
            "event_type": ge.event_type,
            "repository": payload.get("repository", {}).get("full_name", ""),
            "branch": payload.get("ref", "").replace("refs/heads/", "") or pr.get("head", {}).get("ref", ""),
            "pusher": payload.get("pusher", {}).get("name", "") or pr.get("user", {}).get("login", ""),
            "commits": commits,
            "pr_title": pr.get("title", ""),
            "pr_number": pr.get("number"),
            "pr_state": pr.get("state", ""),
            "pr_url": pr.get("html_url", ""),
            "pr_merged": pr.get("merged", False),
            "match_type": la.match_type if hasattr(la, "match_type") else "regex",
            "created_at": la.created_at.isoformat() if la.created_at else None,
            "linked_at": la.created_at.isoformat() if la.created_at else None,
        })

    return events


# ---------------------------------------------------------------------------
# Helper: Groq AI summary
# ---------------------------------------------------------------------------

async def _generate_ai_summary(issue_key: str, jira_data: Dict, github_events: List[Dict]) -> str:
    """Generate an AI summary using Ollama (local) or Groq (cloud fallback)."""
    count = len(github_events)

    commit_lines = []
    for ev in github_events[:5]:
        if ev["event_type"] == "pull_request" and ev.get("pr_title"):
            commit_lines.append(f"  - PR: {ev['pr_title']}")
        for c in ev.get("commits", [])[:2]:
            commit_lines.append(f"  - commit: {c['message']}")

    github_summary = "\n".join(commit_lines) if commit_lines else "  (no commit details)"

    prompt = (
        f"Summarize the current state of this Jira ticket based on the data below.\n"
        f"Be concise (2-3 sentences). Focus on what has been done and what the current state is.\n\n"
        f"Ticket: {jira_data.get('key')} - {jira_data.get('summary')}\n"
        f"Status: {jira_data.get('status')} | Priority: {jira_data.get('priority')}\n"
        f"Description: {jira_data.get('description', '')[:300]}\n\n"
        f"GitHub Activity ({count} events):\n{github_summary}\n\n"
        f"Summary:"
    )

    result = await chat_complete(prompt, max_tokens=150, temperature=0.3)
    if result:
        return result

    # Both LLMs unavailable — generate a plain text fallback
    return f"{issue_key} is currently {jira_data.get('status', 'unknown')}. {count} GitHub event(s) linked."


# ---------------------------------------------------------------------------
# Route
# ---------------------------------------------------------------------------

@router.get("/{issue_key}", summary="Get Ticket Context")
async def get_ticket_context(issue_key: str, db: Session = Depends(get_db)):
    """
    Returns unified context for a Jira ticket:
    Jira metadata + linked GitHub events + AI summary.
    """
    issue_key = issue_key.upper()

    # 1. Fetch Jira ticket
    jira_data: Dict[str, Any] = {
        "key": issue_key,
        "summary": "",
        "description": "",
        "status": "Unknown",
        "priority": "Medium",
        "url": None,
    }

    if jira_service.is_jira_configured():
        try:
            raw = await jira_service.get_issue_by_key(issue_key)
            fields = raw.get("fields", {})

            # Extract description (Atlassian doc format or plain text)
            desc_raw = fields.get("description")
            desc = ""
            if isinstance(desc_raw, str):
                desc = desc_raw[:400]
            elif isinstance(desc_raw, dict):
                # Atlassian Document Format
                try:
                    texts = []
                    for block in desc_raw.get("content", []):
                        for inline in block.get("content", []):
                            if inline.get("type") == "text":
                                texts.append(inline.get("text", ""))
                    desc = " ".join(texts)[:400]
                except Exception:
                    desc = str(desc_raw)[:400]

            jira_data = {
                "key": raw.get("key", issue_key),
                "summary": fields.get("summary", ""),
                "description": desc,
                "status": fields.get("status", {}).get("name", "Unknown"),
                "priority": fields.get("priority", {}).get("name", "Medium"),
                "url": f"https://{settings.jira_domain}/browse/{issue_key}" if settings.jira_domain else None,
            }
        except Exception as exc:
            logger.warning("Could not fetch Jira ticket %s: %s", issue_key, exc)

    # 2. Get linked GitHub events from DB
    github_events = _get_github_events_for_ticket(issue_key, db)

    # 3. Generate AI summary
    ai_summary = await _generate_ai_summary(issue_key, jira_data, github_events)

    return {
        "issue_key": issue_key,
        "jira": jira_data,
        "github": {
            "total_events": len(github_events),
            "events": github_events,
        },
        "ai_summary": ai_summary,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
