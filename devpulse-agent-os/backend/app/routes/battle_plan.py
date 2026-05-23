"""
DevPulse Agent OS — Battle Plan (AI Task Prioritization)
Route: GET /api/battle-plan
"""

import logging
from fastapi import APIRouter, HTTPException
from app.services import jira_service
from app.services.priority_engine import analyze_task, extract_jira_description
from app.utils.formatting import format_hour, get_last_sync_time

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Battle Plan"])


@router.get(
    "/battle-plan",
    summary="AI-Powered Daily Battle Plan",
    response_description="Prioritized task list with time slots and health metrics.",
)
async def get_battle_plan():
    """
    Generates an AI-prioritized daily work plan from Jira backlog.
    Uses Groq LLM (if configured) or keyword-based priority analysis.
    Falls back gracefully if Jira is not configured.
    """
    if not jira_service.is_jira_configured():
        return {
            "jiraBaseUrl": "",
            "user": {"name": "Developer", "email": ""},
            "summary": {
                "totalTasks": 0,
                "criticalTasks": 0,
                "reviewTasks": 0,
                "focusHours": 0,
                "healthScore": 100,
                "healthStatus": "Healthy",
                "lastSync": get_last_sync_time(),
            },
            "battlePlan": [],
            "taskList": [],
            "notice": "Jira not configured. Set JIRA_EMAIL, JIRA_TOKEN, and JIRA_DOMAIN in .env",
        }

    try:
        try:
            user_details = await jira_service.get_user_details()
        except HTTPException as e:
            if e.status_code == 401:
                raise
            user_details = {"name": "Developer", "email": ""}

        try:
            issues = await jira_service.get_issues()
        except HTTPException as e:
            if e.status_code == 401:
                raise
            raise HTTPException(status_code=503, detail=f"Jira Unavailable: {e.detail}")

        if not issues:
            return {
                "jiraBaseUrl": jira_service.get_browse_base_url(),
                "user": user_details,
                "summary": {
                    "totalTasks": 0,
                    "criticalTasks": 0,
                    "reviewTasks": 0,
                    "focusHours": 0,
                    "healthScore": 100,
                    "healthStatus": "Healthy",
                    "lastSync": get_last_sync_time(),
                },
                "battlePlan": [],
                "taskList": [],
            }

        enriched_tasks = []
        for issue in issues:
            fields = issue.get("fields", {})
            summary = fields.get("summary", "Untitled Task")
            description = fields.get("description")
            analysis = await analyze_task(summary, description)
            status = fields.get("status", {}).get("name", "To Do")

            enriched_tasks.append({
                "id": issue.get("id"),
                "key": issue.get("key"),
                "summary": summary,
                "description": extract_jira_description(description),
                "status": status,
                "priority": analysis["priority"],
                "reason": analysis["reason"],
                "estimatedEffort": analysis["estimatedEffort"],
                "color": analysis["color"],
            })

        priority_order = {"P0": 0, "P1": 1, "P2": 2}
        enriched_tasks.sort(key=lambda t: priority_order.get(t["priority"], 3))

        current_hour = 9
        battle_plan = []
        for task in enriched_tasks:
            start = current_hour
            end = current_hour + task["estimatedEffort"]
            current_hour = end
            task_copy = task.copy()
            task_copy["timeSlot"] = f"{format_hour(start)} - {format_hour(end)}"
            battle_plan.append(task_copy)

        total_tasks = len(battle_plan)
        critical_tasks = sum(1 for t in battle_plan if t["priority"] == "P0")
        review_tasks = sum(1 for t in battle_plan if t["priority"] == "P1")
        focus_hours = sum(t["estimatedEffort"] for t in battle_plan)

        health_score = round(100 - (critical_tasks / max(total_tasks, 1)) * 100)
        if health_score >= 90:
            health_status = "Healthy"
        elif health_score >= 60:
            health_status = "Medium Risk"
        else:
            health_status = "Blocked"

        return {
            "jiraBaseUrl": jira_service.get_browse_base_url(),
            "user": user_details,
            "summary": {
                "totalTasks": total_tasks,
                "criticalTasks": critical_tasks,
                "reviewTasks": review_tasks,
                "focusHours": focus_hours,
                "healthScore": health_score,
                "healthStatus": health_status,
                "lastSync": get_last_sync_time(),
            },
            "battlePlan": battle_plan,
            "taskList": enriched_tasks,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Battle plan generation failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))
