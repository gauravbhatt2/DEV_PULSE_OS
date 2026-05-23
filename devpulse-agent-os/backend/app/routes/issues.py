"""
DevPulse Agent OS — Jira Issue Management Routes
Routes:
  POST /api/issues/{issue_key}/start  — Move issue to In Progress
  POST /api/issues/{issue_key}/done   — Move issue to Done
"""

import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.config.database import get_db
from app.models.events import Activity
from app.services import jira_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/issues", tags=["Issues"])


@router.post("/{issue_key}/start", summary="Move Jira Issue to In Progress")
async def start_issue(issue_key: str, db: Session = Depends(get_db)):
    if not jira_service.is_jira_configured():
        raise HTTPException(status_code=503, detail="Jira not configured.")

    result = await jira_service.start_issue(issue_key)

    if result.get("changed"):
        activity = Activity(
            issue_key=issue_key,
            status=result["status"],
            action_type="start",
        )
        db.add(activity)
        try:
            db.commit()
        except Exception as exc:
            db.rollback()
            logger.warning("Failed to record activity for %s: %s", issue_key, exc)

    return result


@router.post("/{issue_key}/done", summary="Move Jira Issue to Done")
async def mark_issue_done(issue_key: str, db: Session = Depends(get_db)):
    if not jira_service.is_jira_configured():
        raise HTTPException(status_code=503, detail="Jira not configured.")

    result = await jira_service.mark_issue_done(issue_key)

    if result.get("changed"):
        activity = Activity(
            issue_key=issue_key,
            status=result["status"],
            action_type="done",
        )
        db.add(activity)
        try:
            db.commit()
        except Exception as exc:
            db.rollback()
            logger.warning("Failed to record activity for %s: %s", issue_key, exc)

    return result
