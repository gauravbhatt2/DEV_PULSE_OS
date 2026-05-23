"""
DevPulse Agent OS — Jira API Service
Real integration with the Jira REST API v3.
Supports: issue fetching, transitions, user lookup.
"""

import base64
import logging
from typing import Any, Dict, List, Optional

import httpx
from fastapi import HTTPException

from app.config.settings import settings

logger = logging.getLogger(__name__)


def get_auth_headers() -> dict:
    if not settings.jira_email or not settings.jira_token:
        raise ValueError("Missing JIRA_EMAIL or JIRA_TOKEN in environment configuration.")

    auth_str = f"{settings.jira_email}:{settings.jira_token}"
    b64_auth = base64.b64encode(auth_str.encode()).decode()

    return {
        "Authorization": f"Basic {b64_auth}",
        "Accept": "application/json",
        "Content-Type": "application/json",
    }


def get_jira_host() -> str:
    if not settings.jira_domain:
        raise ValueError("Missing JIRA_DOMAIN in environment configuration.")

    domain = settings.jira_domain.strip()
    domain = domain.replace("http://", "").replace("https://", "").rstrip("/")
    if domain.endswith(".atlassian.net"):
        return domain
    return f"{domain}.atlassian.net"


def get_jira_url(path: str) -> str:
    return f"https://{get_jira_host()}{path}"


def get_browse_base_url() -> str:
    return f"https://{get_jira_host()}"


def normalize_name(name: str) -> str:
    return str(name or "").strip().lower()


def is_jira_configured() -> bool:
    return bool(settings.jira_email and settings.jira_token and settings.jira_domain)


async def get_user_details() -> dict:
    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            response = await client.get(
                get_jira_url("/rest/api/3/myself"),
                headers=get_auth_headers(),
            )
            response.raise_for_status()
            data = response.json()
            return {
                "name": data.get("displayName", "Developer"),
                "email": data.get("emailAddress", ""),
            }
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 401:
                raise HTTPException(status_code=401, detail="Jira API credentials unauthorized.")
            raise HTTPException(status_code=e.response.status_code, detail=str(e))


def filter_done_issues(issues: list) -> list:
    filtered = []
    for issue in issues:
        fields = issue.get("fields", {})
        status = fields.get("status", {})
        category = status.get("statusCategory", {}).get("name", "")
        if normalize_name(category) != "done":
            filtered.append(issue)
    return filtered


async def get_issues() -> list:
    url = get_jira_url("/rest/api/3/search/jql")
    headers = get_auth_headers()

    async with httpx.AsyncClient(timeout=20.0) as client:
        try:
            response = await client.get(
                url,
                headers=headers,
                params={
                    "jql": "project=SCRUM AND statusCategory != Done ORDER BY updated DESC",
                    "fields": "summary,description,status,priority",
                    "maxResults": 50,
                },
            )
            response.raise_for_status()
            return filter_done_issues(response.json().get("issues", []))

        except httpx.HTTPStatusError as e:
            if e.response.status_code == 400:
                logger.info("Project SCRUM not found, falling back to generic JQL")
                fallback_resp = await client.get(
                    url,
                    headers=headers,
                    params={
                        "jql": "statusCategory != Done ORDER BY updated DESC",
                        "fields": "summary,description,status,priority",
                        "maxResults": 50,
                    },
                )
                fallback_resp.raise_for_status()
                return filter_done_issues(fallback_resp.json().get("issues", []))

            if e.response.status_code == 401:
                raise HTTPException(status_code=401, detail="Jira API credentials unauthorized.")
            raise HTTPException(status_code=e.response.status_code, detail=str(e))


async def get_issue_by_key(issue_key: str) -> Optional[Dict[str, Any]]:
    """Fetch a single Jira issue by key (e.g. DEV-101)."""
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(
                get_jira_url(f"/rest/api/3/issue/{issue_key}"),
                headers=get_auth_headers(),
                params={"fields": "summary,description,status,priority,assignee"},
            )
            response.raise_for_status()
            return response.json()
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 404:
            return None
        logger.error("Failed to fetch Jira issue %s: %s", issue_key, e)
        return None
    except Exception as exc:
        logger.error("Jira get_issue_by_key error: %s", exc)
        return None


async def get_issue_status(issue_key: str) -> dict:
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.get(
            get_jira_url(f"/rest/api/3/issue/{issue_key}"),
            headers=get_auth_headers(),
            params={"fields": "status"},
        )
        response.raise_for_status()
        status = response.json().get("fields", {}).get("status", {})
        return {
            "name": status.get("name", "Unknown"),
            "category": status.get("statusCategory", {}).get("name", ""),
        }


async def get_available_transitions(issue_key: str) -> list:
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.get(
            get_jira_url(f"/rest/api/3/issue/{issue_key}/transitions"),
            headers=get_auth_headers(),
        )
        response.raise_for_status()
        return response.json().get("transitions", [])


def find_transition(transitions: list, target_status: str) -> Optional[dict]:
    target = normalize_name(target_status)
    for t in transitions:
        if normalize_name(t.get("name")) == target or normalize_name(t.get("to", {}).get("name")) == target:
            return t
    for t in transitions:
        if target in normalize_name(t.get("name")) or target in normalize_name(t.get("to", {}).get("name")):
            return t
    return None


async def post_transition(issue_key: str, transition_id: str):
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.post(
            get_jira_url(f"/rest/api/3/issue/{issue_key}/transitions"),
            json={"transition": {"id": transition_id}},
            headers=get_auth_headers(),
        )
        response.raise_for_status()


async def start_issue(issue_key: str) -> dict:
    try:
        current = await get_issue_status(issue_key)
        if normalize_name(current["name"]) == "in progress":
            return {
                "issueKey": issue_key,
                "status": current["name"],
                "changed": False,
                "alreadyActive": True,
                "message": "Already active",
            }

        transitions = await get_available_transitions(issue_key)
        t = find_transition(transitions, "In Progress")

        if not t:
            available = [tr.get("name") for tr in transitions]
            raise HTTPException(
                status_code=409,
                detail=f"No transition to In Progress available. Available: {available}",
            )

        await post_transition(issue_key, t["id"])
        return {
            "issueKey": issue_key,
            "status": t.get("to", {}).get("name", "In Progress"),
            "changed": True,
            "alreadyActive": False,
            "message": f"{issue_key} moved to In Progress",
        }
    except httpx.HTTPError as e:
        raise HTTPException(status_code=500, detail=str(e))


def is_done_status(status: dict) -> bool:
    cat = normalize_name(status.get("category", ""))
    name = normalize_name(status.get("name", ""))
    return cat == "done" or name in ["done", "resolved"]


async def mark_issue_done(issue_key: str) -> dict:
    try:
        current = await get_issue_status(issue_key)
        if is_done_status(current):
            return {
                "issueKey": issue_key,
                "status": current["name"],
                "changed": False,
                "message": "Task completed",
            }

        transitions = await get_available_transitions(issue_key)
        t = find_transition(transitions, "Done")

        if not t:
            available = [tr.get("name") for tr in transitions]
            raise HTTPException(
                status_code=409,
                detail=f"No transition to Done available. Available: {available}",
            )

        await post_transition(issue_key, t["id"])
        return {
            "issueKey": issue_key,
            "status": t.get("to", {}).get("name", "Done"),
            "changed": True,
            "message": "Task completed",
        }
    except httpx.HTTPError as e:
        raise HTTPException(status_code=500, detail=str(e))


async def get_jira_status() -> Dict[str, Any]:
    """Check Jira integration connectivity status."""
    if not is_jira_configured():
        return {
            "configured": False,
            "status": "unconfigured",
            "domain": None,
        }

    try:
        user = await get_user_details()
        return {
            "configured": True,
            "status": "connected",
            "domain": settings.jira_domain,
            "user": user.get("name"),
            "email": user.get("email"),
        }
    except HTTPException as e:
        return {
            "configured": True,
            "status": "auth_failed",
            "domain": settings.jira_domain,
            "detail": e.detail,
        }
    except Exception as exc:
        return {
            "configured": True,
            "status": "unreachable",
            "domain": settings.jira_domain,
            "detail": str(exc),
        }
