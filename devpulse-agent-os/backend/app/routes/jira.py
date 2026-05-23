"""
DevPulse Agent OS — Jira Data Routes
Routes:
  GET /api/jira/issues    — Fetch active Jira issues
  GET /api/jira/status    — Integration connectivity status
  GET /api/jira/issue/{key} — Fetch a single issue by key
"""

import logging
from fastapi import APIRouter, HTTPException
from app.services import jira_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/jira", tags=["Jira Data"])


@router.get("/status", summary="Jira Integration Status")
async def get_jira_status():
    return await jira_service.get_jira_status()


@router.get("/issues", summary="Fetch Active Jira Issues")
async def get_jira_issues():
    if not jira_service.is_jira_configured():
        return []
    return await jira_service.get_issues()


@router.get("/issue/{issue_key}", summary="Fetch Single Jira Issue")
async def get_jira_issue(issue_key: str):
    if not jira_service.is_jira_configured():
        raise HTTPException(status_code=503, detail="Jira not configured.")
    issue = await jira_service.get_issue_by_key(issue_key)
    if not issue:
        raise HTTPException(status_code=404, detail=f"Issue {issue_key} not found.")
    return issue
