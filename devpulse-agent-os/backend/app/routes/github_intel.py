"""
DevPulse Agent OS — GitHub Intelligence Dashboard Routes

Endpoints:
  GET  /api/v1/github/repos
  GET  /api/v1/github/activity
  GET  /api/v1/github/repos/{owner}/{repo}/details
  GET  /api/v1/github/repos/{owner}/{repo}/commits
  GET  /api/v1/github/repos/{owner}/{repo}/pulls
  POST /api/v1/github/analyze-commit
"""

import logging
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config.database import get_db
from app.config.settings import settings
from app.models.events import GitHubEvent, LinkedActivity
from app.services import ai_service, github_service
from app.services.correlation_service import extract_jira_key

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/github", tags=["GitHub Intelligence"])

_JIRA_KEY_RE = re.compile(r"\b([A-Z][A-Z0-9_]+-\d+)\b")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _get_token() -> str:
    token = await github_service.get_installation_token()
    if not token:
        raise HTTPException(
            status_code=503,
            detail="GitHub App not connected. Check GITHUB_APP_ID, GITHUB_INSTALLATION_ID, and private key.",
        )
    return token


def _extract_jira_from_text(text: str) -> Optional[str]:
    if not text:
        return None
    m = _JIRA_KEY_RE.search(text)
    return m.group(1) if m else None


# ---------------------------------------------------------------------------
# GET /api/v1/github/repos
# ---------------------------------------------------------------------------

@router.get("/repos", summary="List repositories accessible to the GitHub App")
async def list_repos() -> List[Dict[str, Any]]:
    token = await _get_token()
    repos = await github_service.get_installation_repositories(token)

    result = []
    for r in repos:
        result.append({
            "id": r.get("id"),
            "name": r.get("name"),
            "full_name": r.get("full_name"),
            "private": r.get("private", False),
            "visibility": r.get("visibility", "public"),
            "description": r.get("description"),
            "html_url": r.get("html_url"),
            "default_branch": r.get("default_branch", "main"),
            "language": r.get("language"),
            "open_issues_count": r.get("open_issues_count", 0),
            "stargazers_count": r.get("stargazers_count", 0),
            "forks_count": r.get("forks_count", 0),
            "updated_at": r.get("updated_at"),
            "pushed_at": r.get("pushed_at"),
        })

    return result


# ---------------------------------------------------------------------------
# GET /api/v1/github/activity
# ---------------------------------------------------------------------------

@router.get("/activity", summary="Live activity feed from webhook events")
def get_activity_feed(
    limit: int = Query(50, le=100),
    db: Session = Depends(get_db),
) -> List[Dict[str, Any]]:
    """Returns recent GitHub webhook events with enrichment from the DB."""
    events = (
        db.execute(
            select(GitHubEvent)
            .order_by(GitHubEvent.created_at.desc())
            .limit(limit)
        )
        .scalars()
        .all()
    )

    result = []
    for ev in events:
        p = ev.payload
        repo = p.get("repository", {}).get("full_name", "unknown/unknown")

        # Extract human-readable title
        title = ""
        author = ""
        sha = ""
        branch = ""
        pr_number = None
        pr_state = None

        if ev.event_type == "push":
            commits = p.get("commits", [])
            if commits:
                title = commits[0].get("message", "")[:120]
                author = commits[0].get("author", {}).get("name", "")
                sha = commits[0].get("id", "")[:8]
            branch = p.get("ref", "").replace("refs/heads/", "")

        elif ev.event_type == "pull_request":
            pr = p.get("pull_request", {})
            title = pr.get("title", "")[:120]
            author = pr.get("user", {}).get("login", "")
            pr_number = pr.get("number")
            pr_state = pr.get("state")
            sha = pr.get("head", {}).get("sha", "")[:8]
            branch = pr.get("head", {}).get("ref", "")

        elif ev.event_type == "create":
            title = f"Branch created: {p.get('ref', '')}"
            author = p.get("sender", {}).get("login", "")

        else:
            title = f"{ev.event_type} event"

        result.append({
            "id": ev.id,
            "event_type": ev.event_type,
            "repository": repo,
            "title": title,
            "author": author,
            "sha": sha,
            "branch": branch,
            "pr_number": pr_number,
            "pr_state": pr_state,
            "jira_ticket": ev.extracted_ticket_id,
            "jira_url": (
                f"https://{settings.jira_domain}/browse/{ev.extracted_ticket_id}"
                if ev.extracted_ticket_id and settings.jira_domain
                else None
            ),
            "created_at": ev.created_at.isoformat() if ev.created_at else None,
        })

    return result


# ---------------------------------------------------------------------------
# GET /api/v1/github/repos/{owner}/{repo}/details
# ---------------------------------------------------------------------------

@router.get("/repos/{owner}/{repo}/details", summary="Repository details with branches and contributors")
async def get_repo_details(owner: str, repo: str) -> Dict[str, Any]:
    token = await _get_token()

    details, branches, contributors = await _fetch_repo_meta(owner, repo, token)

    if not details:
        raise HTTPException(status_code=404, detail=f"Repository {owner}/{repo} not found or not accessible.")

    return {
        "name": details.get("name"),
        "full_name": details.get("full_name"),
        "description": details.get("description"),
        "html_url": details.get("html_url"),
        "default_branch": details.get("default_branch"),
        "language": details.get("language"),
        "visibility": details.get("visibility"),
        "open_issues_count": details.get("open_issues_count", 0),
        "stargazers_count": details.get("stargazers_count", 0),
        "forks_count": details.get("forks_count", 0),
        "created_at": details.get("created_at"),
        "updated_at": details.get("updated_at"),
        "pushed_at": details.get("pushed_at"),
        "branches": [{"name": b.get("name"), "protected": b.get("protected", False)} for b in branches],
        "contributors": [
            {
                "login": c.get("login"),
                "avatar_url": c.get("avatar_url"),
                "contributions": c.get("contributions", 0),
                "html_url": c.get("html_url"),
            }
            for c in contributors
        ],
    }


async def _fetch_repo_meta(owner: str, repo: str, token: str):
    import asyncio
    details, branches, contributors = await asyncio.gather(
        github_service.get_repo_details(owner, repo, token),
        github_service.get_branches(owner, repo, token),
        github_service.get_contributors(owner, repo, token),
    )
    return details, branches, contributors


# ---------------------------------------------------------------------------
# GET /api/v1/github/repos/{owner}/{repo}/commits
# ---------------------------------------------------------------------------

@router.get("/repos/{owner}/{repo}/commits", summary="Recent commits for a repository")
async def get_repo_commits(
    owner: str,
    repo: str,
    per_page: int = Query(20, le=50),
    db: Session = Depends(get_db),
) -> List[Dict[str, Any]]:
    token = await _get_token()
    commits = await github_service.get_commits(owner, repo, token, per_page=per_page)

    # Build a lookup of jira tickets from DB events for this repo
    repo_full_name = f"{owner}/{repo}"
    db_events = (
        db.execute(
            select(GitHubEvent).where(
                GitHubEvent.payload["repository"]["full_name"].astext == repo_full_name,
                GitHubEvent.event_type == "push",
                GitHubEvent.extracted_ticket_id.isnot(None),
            )
        )
        .scalars()
        .all()
    )
    sha_to_ticket: Dict[str, str] = {}
    for ev in db_events:
        for commit in ev.payload.get("commits", []):
            if ev.extracted_ticket_id:
                sha_to_ticket[commit.get("id", "")[:8]] = ev.extracted_ticket_id

    result = []
    for c in commits:
        sha = c.get("sha", "")
        short_sha = sha[:8]
        commit_data = c.get("commit", {})
        message = commit_data.get("message", "").split("\n")[0][:120]
        author = commit_data.get("author", {}).get("name", "") or c.get("author", {}).get("login", "")
        jira_ticket = sha_to_ticket.get(short_sha) or _extract_jira_from_text(message)

        result.append({
            "sha": sha,
            "short_sha": short_sha,
            "message": message,
            "author": author,
            "avatar_url": c.get("author", {}).get("avatar_url") if c.get("author") else None,
            "html_url": c.get("html_url"),
            "date": commit_data.get("author", {}).get("date"),
            "files_changed": c.get("stats", {}).get("total", 0) if c.get("stats") else 0,
            "additions": c.get("stats", {}).get("additions", 0) if c.get("stats") else 0,
            "deletions": c.get("stats", {}).get("deletions", 0) if c.get("stats") else 0,
            "jira_ticket": jira_ticket,
            "jira_url": (
                f"https://{settings.jira_domain}/browse/{jira_ticket}"
                if jira_ticket and settings.jira_domain
                else None
            ),
        })

    return result


# ---------------------------------------------------------------------------
# GET /api/v1/github/repos/{owner}/{repo}/pulls
# ---------------------------------------------------------------------------

@router.get("/repos/{owner}/{repo}/pulls", summary="Pull requests for a repository")
async def get_repo_pulls(
    owner: str,
    repo: str,
    state: str = Query("open", pattern="^(open|closed|all)$"),
) -> List[Dict[str, Any]]:
    token = await _get_token()
    pulls = await github_service.get_pull_requests(owner, repo, token, state=state)

    result = []
    for pr in pulls:
        title = pr.get("title", "")
        jira_ticket = _extract_jira_from_text(title) or _extract_jira_from_text(
            pr.get("head", {}).get("ref", "")
        )
        result.append({
            "number": pr.get("number"),
            "title": title[:120],
            "state": pr.get("state"),
            "draft": pr.get("draft", False),
            "author": pr.get("user", {}).get("login"),
            "avatar_url": pr.get("user", {}).get("avatar_url"),
            "html_url": pr.get("html_url"),
            "base_branch": pr.get("base", {}).get("ref"),
            "head_branch": pr.get("head", {}).get("ref"),
            "created_at": pr.get("created_at"),
            "updated_at": pr.get("updated_at"),
            "merged_at": pr.get("merged_at"),
            "additions": pr.get("additions", 0),
            "deletions": pr.get("deletions", 0),
            "changed_files": pr.get("changed_files", 0),
            "jira_ticket": jira_ticket,
            "jira_url": (
                f"https://{settings.jira_domain}/browse/{jira_ticket}"
                if jira_ticket and settings.jira_domain
                else None
            ),
        })

    return result


# ---------------------------------------------------------------------------
# POST /api/v1/github/analyze-commit
# ---------------------------------------------------------------------------

class AnalyzeCommitRequest(BaseModel):
    owner: str
    repo: str
    sha: str


@router.post("/analyze-commit", summary="AI-powered commit analysis")
async def analyze_commit(body: AnalyzeCommitRequest) -> Dict[str, Any]:
    token = await _get_token()

    commit_detail = await github_service.get_commit_detail(body.owner, body.repo, body.sha, token)
    if not commit_detail:
        raise HTTPException(status_code=404, detail=f"Commit {body.sha} not found.")

    commit_data = commit_detail.get("commit", {})
    message = commit_data.get("message", "").split("\n")[0][:200]
    files_changed = commit_detail.get("files", [])
    repo_full_name = f"{body.owner}/{body.repo}"
    jira_ticket = _extract_jira_from_text(message)

    try:
        analysis = await ai_service.analyze_commit(
            commit_sha=body.sha,
            commit_message=message,
            repo_full_name=repo_full_name,
            files_changed=files_changed,
            jira_ticket=jira_ticket,
        )
    except Exception as exc:
        logger.error("Commit analysis failed: %s", exc)
        raise HTTPException(status_code=503, detail=f"AI analysis failed: {exc}")

    return {
        "sha": body.sha,
        "short_sha": body.sha[:8],
        "message": message,
        "repository": repo_full_name,
        "author": commit_data.get("author", {}).get("name", ""),
        "date": commit_data.get("author", {}).get("date"),
        "files_changed": [
            {
                "filename": f.get("filename"),
                "status": f.get("status"),
                "additions": f.get("additions", 0),
                "deletions": f.get("deletions", 0),
            }
            for f in files_changed[:20]
        ],
        "jira_ticket": jira_ticket,
        "jira_url": (
            f"https://{settings.jira_domain}/browse/{jira_ticket}"
            if jira_ticket and settings.jira_domain
            else None
        ),
        "analysis": analysis,
        "analyzed_at": datetime.now(timezone.utc).isoformat(),
    }
