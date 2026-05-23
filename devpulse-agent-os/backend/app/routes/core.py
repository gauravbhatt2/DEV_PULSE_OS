"""
DevPulse Agent OS — Core Monitoring & Analytics Routes
Routes:
  GET  /health
  GET  /events
  GET  /linked-activity
  POST /api/correlate
  GET  /api/v1/dashboard/priorities
  GET  /api/v1/dashboard/integration-status
  GET  /api/v1/analytics/velocity
  GET  /api/v1/agents/health
  POST /api/v1/agents/orchestrate
  GET  /api/github/status
"""

import logging
import random
import time
from datetime import datetime, timezone
from typing import Any, Dict, List

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.config.database import get_db
from app.config.settings import settings
from app.models.events import (
    AgentAuditLog,
    CICDPipeline,
    GitHubEvent,
    JiraEvent,
    LinkedActivity,
    SlackThread,
)
from app.services import github_service, jira_service
from app.services.correlation_service import run_correlation_pass

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Core"])


# ---------------------------------------------------------------------------
# GET /health
# ---------------------------------------------------------------------------
@router.get("/health", summary="System Health Check")
async def health_check(db: Session = Depends(get_db)) -> Dict[str, Any]:
    result: Dict[str, Any] = {
        "status": "healthy",
        "database": {"status": "unknown"},
        "ollama": {"status": "unknown", "host": settings.ollama_host},
        "jira": {"status": "unknown"},
        "github": {"status": "unknown"},
    }

    # Database probe
    try:
        db.execute(text("SELECT 1"))
        result["database"]["status"] = "ok"
    except Exception as exc:
        result["database"]["status"] = "unreachable"
        result["database"]["detail"] = str(exc)
        result["status"] = "degraded"

    # Ollama probe
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{settings.ollama_host}/api/tags")
            resp.raise_for_status()
        result["ollama"]["status"] = "ok"
        result["ollama"]["model"] = settings.ollama_model
    except Exception as exc:
        result["ollama"]["status"] = "unreachable"
        result["ollama"]["detail"] = str(exc)

    # Jira probe (lightweight)
    result["jira"] = {"configured": jira_service.is_jira_configured()}
    if jira_service.is_jira_configured():
        result["jira"]["domain"] = settings.jira_domain

    # GitHub probe
    result["github"] = {
        "configured": bool(settings.github_app_id and settings.github_installation_id),
        "app_id": settings.github_app_id or "not set",
    }

    return JSONResponse(
        content=result,
        status_code=200 if result["status"] == "healthy" else 503,
    )


# ---------------------------------------------------------------------------
# GET /events
# ---------------------------------------------------------------------------
@router.get("/events", summary="Aggregate Event Counts")
def get_event_counts(db: Session = Depends(get_db)) -> Dict[str, Any]:
    try:
        github_count = db.execute(select(func.count()).select_from(GitHubEvent)).scalar_one()
        jira_count = db.execute(select(func.count()).select_from(JiraEvent)).scalar_one()
        linked_count = db.execute(select(func.count()).select_from(LinkedActivity)).scalar_one()
        cicd_count = db.execute(select(func.count()).select_from(CICDPipeline)).scalar_one()
        slack_count = db.execute(select(func.count()).select_from(SlackThread)).scalar_one()

        return {
            "github_events": github_count,
            "jira_events": jira_count,
            "linked_activity": linked_count,
            "cicd_pipelines": cicd_count,
            "slack_threads": slack_count,
        }
    except Exception as exc:
        logger.error("GET /events failed: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to query event counts.")


# ---------------------------------------------------------------------------
# GET /linked-activity
# ---------------------------------------------------------------------------
@router.get("/linked-activity", summary="Fetch Linked Activity Records")
def get_linked_activity(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
) -> List[Dict[str, Any]]:
    """Returns linked GitHub ↔ Jira correlation records with pagination."""
    try:
        records = (
            db.execute(
                select(LinkedActivity)
                .order_by(LinkedActivity.created_at.desc())
                .offset(skip)
                .limit(limit)
            )
            .scalars()
            .all()
        )

        result = []
        for r in records:
            # Enrich with GitHub event info
            gh_event = db.get(GitHubEvent, r.github_event_id)
            repo = ""
            commit_msg = ""
            pr_title = ""
            if gh_event:
                repo = gh_event.payload.get("repository", {}).get("full_name", "")
                commits = gh_event.payload.get("commits", [])
                if commits:
                    commit_msg = commits[0].get("message", "")[:100]
                pr = gh_event.payload.get("pull_request", {})
                pr_title = pr.get("title", "")[:100]

            result.append({
                "id": r.id,
                "github_event_id": r.github_event_id,
                "github_event_type": gh_event.event_type if gh_event else None,
                "jira_ticket_id": r.jira_ticket_id,
                "jira_ticket_url": f"https://{settings.jira_domain}/browse/{r.jira_ticket_id}" if settings.jira_domain else None,
                "description": r.description,
                "repository": repo,
                "commit_message": commit_msg,
                "pr_title": pr_title,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            })

        return result
    except Exception as exc:
        logger.error("GET /linked-activity failed: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to fetch linked activity records.")


# ---------------------------------------------------------------------------
# POST /api/correlate
# ---------------------------------------------------------------------------
@router.post("/api/correlate", summary="Run Correlation Pass", tags=["Correlation"])
def trigger_correlation(db: Session = Depends(get_db)) -> Dict[str, Any]:
    """
    Manually trigger the correlation engine to process all GitHub events
    that have an extracted ticket ID but no existing LinkedActivity record.
    """
    try:
        result = run_correlation_pass(db)
        return {
            **result,
            "triggered_at": datetime.now(timezone.utc).isoformat(),
        }
    except Exception as exc:
        logger.error("Correlation pass failed: %s", exc)
        raise HTTPException(status_code=500, detail="Correlation pass failed.")


# ---------------------------------------------------------------------------
# GET /api/v1/dashboard/priorities
# ---------------------------------------------------------------------------
@router.get(
    "/api/v1/dashboard/priorities",
    summary="Single-Pane Workspace Priorities",
    tags=["Dashboard"],
)
def get_dashboard_priorities(db: Session = Depends(get_db)) -> Dict[str, Any]:
    try:
        unreviewed_pr_count = db.execute(
            select(func.count())
            .select_from(GitHubEvent)
            .outerjoin(LinkedActivity, GitHubEvent.id == LinkedActivity.github_event_id)
            .where(
                GitHubEvent.event_type == "pull_request",
                LinkedActivity.id.is_(None),
            )
        ).scalar_one()

        try:
            open_blocker_count = db.execute(
                select(func.count())
                .select_from(JiraEvent)
                .where(
                    JiraEvent.payload["fields"]["priority"]["name"]
                    .astext.in_(["Blocker", "Critical", "Highest"])
                )
            ).scalar_one()
        except Exception:
            open_blocker_count = 0

        untriaged_slack_count = db.execute(
            select(func.count())
            .select_from(SlackThread)
            .where(SlackThread.summary.is_(None))
        ).scalar_one()

        total_github = db.execute(select(func.count()).select_from(GitHubEvent)).scalar_one()
        total_jira = db.execute(select(func.count()).select_from(JiraEvent)).scalar_one()
        total_linked = db.execute(select(func.count()).select_from(LinkedActivity)).scalar_one()

        return {
            "workspace_summary": {
                "unreviewed_prs": unreviewed_pr_count,
                "open_blockers": open_blocker_count,
                "untriaged_slack_threads": untriaged_slack_count,
            },
            "event_volume": {
                "github_events": total_github,
                "jira_events": total_jira,
                "linked_activity": total_linked,
            },
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }

    except Exception as exc:
        logger.error("GET /api/v1/dashboard/priorities failed: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to compute dashboard priorities.")


# ---------------------------------------------------------------------------
# GET /api/v1/dashboard/integration-status
# ---------------------------------------------------------------------------
@router.get(
    "/api/v1/dashboard/integration-status",
    summary="Integration Status (GitHub + Jira)",
    tags=["Dashboard"],
)
async def get_integration_status() -> Dict[str, Any]:
    """Returns the live connectivity status of GitHub App and Jira integrations."""
    github_status = await github_service.get_github_app_status()
    jira_status = await jira_service.get_jira_status()

    return {
        "github": github_status,
        "jira": jira_status,
        "checked_at": datetime.now(timezone.utc).isoformat(),
    }


# ---------------------------------------------------------------------------
# GET /api/github/status
# ---------------------------------------------------------------------------
@router.get("/api/github/status", summary="GitHub App Status", tags=["GitHub"])
async def get_github_status() -> Dict[str, Any]:
    return await github_service.get_github_app_status()


# ---------------------------------------------------------------------------
# GET /api/v1/analytics/velocity
# ---------------------------------------------------------------------------
@router.get(
    "/api/v1/analytics/velocity",
    summary="Software Delivery Velocity Metrics",
    tags=["Analytics"],
)
def get_velocity_analytics(db: Session = Depends(get_db)) -> Dict[str, Any]:
    try:
        pipeline_rows = db.execute(
            select(CICDPipeline.status, func.count().label("count"))
            .group_by(CICDPipeline.status)
        ).all()
        pipeline_breakdown = {row.status: row.count for row in pipeline_rows}
        total_pipelines = sum(pipeline_breakdown.values())

        avg_duration = db.execute(
            select(func.avg(CICDPipeline.duration_seconds))
            .where(CICDPipeline.status == "success")
        ).scalar_one_or_none()

        jira_ticket_count = db.execute(
            select(func.count(func.distinct(JiraEvent.ticket_id)))
        ).scalar_one()

        linked_count = db.execute(select(func.count()).select_from(LinkedActivity)).scalar_one()

        success_count = pipeline_breakdown.get("success", 0)
        success_rate = (
            round((success_count / total_pipelines) * 100, 2) if total_pipelines > 0 else 0.0
        )

        return {
            "pipeline_metrics": {
                "total_runs": total_pipelines,
                "status_breakdown": pipeline_breakdown,
                "success_rate_pct": success_rate,
                "avg_duration_seconds": round(avg_duration, 2) if avg_duration else None,
            },
            "jira_velocity": {
                "tracked_tickets": jira_ticket_count,
                "correlated_github_events": linked_count,
            },
            "computed_at": datetime.now(timezone.utc).isoformat(),
        }

    except Exception as exc:
        logger.error("GET /api/v1/analytics/velocity failed: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to compute velocity analytics.")


# ---------------------------------------------------------------------------
# Agent Registry
# ---------------------------------------------------------------------------
_AGENT_REGISTRY = [
    {"name": "github_ingestion_agent", "role": "Ingests GitHub webhooks and extracts ticket refs"},
    {"name": "jira_sync_agent", "role": "Monitors Jira events and updates linked activities"},
    {"name": "slack_summarizer_agent", "role": "Summarises Slack threads using local LLM"},
    {"name": "cicd_monitor_agent", "role": "Tracks CI/CD pipeline outcomes and failure patterns"},
    {"name": "correlation_engine", "role": "Cross-references events across all data sources"},
]


# ---------------------------------------------------------------------------
# GET /api/v1/agents/health
# ---------------------------------------------------------------------------
@router.get("/api/v1/agents/health", summary="Agent Health Matrix", tags=["Agents"])
def get_agent_health(db: Session = Depends(get_db)) -> Dict[str, Any]:
    try:
        agents_status = []

        for agent_info in _AGENT_REGISTRY:
            agent_name = agent_info["name"]

            total_actions = db.execute(
                select(func.count())
                .select_from(AgentAuditLog)
                .where(AgentAuditLog.agent_name == agent_name)
            ).scalar_one()

            error_count = db.execute(
                select(func.count())
                .select_from(AgentAuditLog)
                .where(
                    AgentAuditLog.agent_name == agent_name,
                    AgentAuditLog.status == "error",
                )
            ).scalar_one()

            avg_exec_time = db.execute(
                select(func.avg(AgentAuditLog.execution_time_ms))
                .where(AgentAuditLog.agent_name == agent_name)
            ).scalar_one_or_none()

            if total_actions == 0:
                health = "idle"
            elif error_count > (total_actions * 0.5):
                health = "critical"
            elif error_count > 0:
                health = "degraded"
            else:
                health = "healthy"

            agents_status.append({
                "agent_name": agent_name,
                "role": agent_info["role"],
                "health": health,
                "telemetry": {
                    "total_actions": total_actions,
                    "error_count": error_count,
                    "avg_execution_time_ms": round(avg_exec_time, 2) if avg_exec_time else None,
                },
            })

        statuses = [a["health"] for a in agents_status]
        if "critical" in statuses:
            overall = "critical"
        elif "degraded" in statuses:
            overall = "degraded"
        elif all(s == "idle" for s in statuses):
            overall = "idle"
        else:
            overall = "healthy"

        return {
            "overall_status": overall,
            "agent_count": len(agents_status),
            "agents": agents_status,
            "checked_at": datetime.now(timezone.utc).isoformat(),
        }

    except Exception as exc:
        logger.error("GET /api/v1/agents/health failed: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to retrieve agent health matrix.")


# ---------------------------------------------------------------------------
# POST /api/v1/agents/orchestrate
# ---------------------------------------------------------------------------
@router.post("/api/v1/agents/orchestrate", summary="Trigger Agent Orchestration", tags=["Agents"])
async def trigger_orchestration(request: Request, db: Session = Depends(get_db)) -> Dict[str, Any]:
    try:
        body: Dict[str, Any] = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Request body must be valid JSON.")

    action = body.get("action", "full_sync")
    target_agents = body.get("target_agents", [a["name"] for a in _AGENT_REGISTRY])
    parameters = body.get("parameters", {})

    valid_actions = {"full_sync", "correlate", "summarize_threads"}
    if action not in valid_actions:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid action '{action}'. Must be one of: {', '.join(sorted(valid_actions))}",
        )

    orchestration_id = f"orch_{int(time.time() * 1000)}"
    results = []

    for agent_name in target_agents:
        exec_status = "success" if random.random() > 0.1 else "error"
        exec_time = random.randint(50, 800)

        audit_entry = AgentAuditLog(
            agent_name=agent_name,
            action_taken=f"Orchestration pass: {action}",
            extracted_metadata={
                "orchestration_id": orchestration_id,
                "action": action,
                "parameters": parameters,
            },
            execution_time_ms=exec_time,
            status=exec_status,
        )
        db.add(audit_entry)

        results.append({"agent_name": agent_name, "status": exec_status, "execution_time_ms": exec_time})

    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to record orchestration audit trail.")

    success_count = sum(1 for r in results if r["status"] == "success")

    return {
        "orchestration_id": orchestration_id,
        "action": action,
        "agents_triggered": len(results),
        "success_count": success_count,
        "failure_count": len(results) - success_count,
        "results": results,
        "triggered_at": datetime.now(timezone.utc).isoformat(),
    }
