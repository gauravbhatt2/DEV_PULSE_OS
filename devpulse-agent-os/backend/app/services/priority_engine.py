"""
DevPulse Agent OS — Task Priority Engine
Classifies Jira issues by priority using keyword analysis or Groq LLM.
"""

import json
import logging
import re
from typing import Any

import httpx

from app.config.settings import settings

logger = logging.getLogger(__name__)

DEFAULT_PRIORITY_PROPERTIES = {
    "P0": {
        "reason": "Critical issue blocking engineering progress.",
        "estimatedEffort": 2,
        "color": "#ef4444",
    },
    "P1": {
        "reason": "Review pending for collaboration.",
        "estimatedEffort": 1,
        "color": "#f59e0b",
    },
    "P2": {
        "reason": "Standard backlog item in current sprint.",
        "estimatedEffort": 3,
        "color": "#3b82f6",
    },
}


def extract_jira_description(description: Any) -> str:
    if not description:
        return ""
    if isinstance(description, str):
        return description
    if isinstance(description, dict):
        return _parse_atlassian_document(description).strip()
    return ""


def _parse_atlassian_document(node: Any) -> str:
    if not isinstance(node, dict):
        return ""
    node_type = node.get("type", "")
    if node_type == "text":
        return node.get("text", "")
    content = node.get("content")
    if isinstance(content, list):
        return " ".join(_parse_atlassian_document(child) for child in content)
    if isinstance(content, dict):
        return _parse_atlassian_document(content)
    return ""


def _keyword_priority(summary: str) -> dict:
    text = (summary or "").lower()
    is_p0 = any(kw in text for kw in ["fix", "fail", "error", "critical", "bug", "urgent", "broken", "block"])
    is_p1 = any(kw in text for kw in ["review", "pr", "merge", "approval", "deploy", "release"])

    priority = "P2"
    if is_p0:
        priority = "P0"
    elif is_p1:
        priority = "P1"

    prop = DEFAULT_PRIORITY_PROPERTIES[priority]
    return {
        "priority": priority,
        "reason": prop["reason"],
        "estimatedEffort": prop["estimatedEffort"],
        "color": prop["color"],
    }


async def _analyze_with_groq(summary: str, description: str) -> dict:
    if not settings.groq_api_key:
        raise ValueError("Missing GROQ_API_KEY")

    prompt = (
        "Classify this Jira issue into one of three priorities: P0, P1, or P2. "
        "Return only a single JSON object with keys: priority, reason, estimatedEffort (int hours), color. "
        "Colors: #ef4444 for P0, #f59e0b for P1, #3b82f6 for P2. Only produce valid JSON.\n"
        f"Issue Title: {summary}\nIssue Description: {description}"
    )

    headers = {
        "Authorization": f"Bearer {settings.groq_api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": settings.groq_model,
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": 200,
        "temperature": 0.1,
    }

    async with httpx.AsyncClient(timeout=20.0) as client:
        response = await client.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers=headers,
            json=payload,
        )
        response.raise_for_status()

        data = response.json()
        text = data["choices"][0]["message"]["content"]

        json_match = re.search(r"\{.*\}", text, re.S)
        if not json_match:
            raise ValueError("Groq response did not contain JSON")

        parsed = json.loads(json_match.group(0))
        priority = parsed.get("priority")
        if priority not in DEFAULT_PRIORITY_PROPERTIES:
            raise ValueError(f"Invalid priority: {priority}")

        prop = DEFAULT_PRIORITY_PROPERTIES[priority]
        return {
            "priority": priority,
            "reason": parsed.get("reason", prop["reason"]),
            "estimatedEffort": int(parsed.get("estimatedEffort", prop["estimatedEffort"])),
            "color": parsed.get("color", prop["color"]),
        }


async def analyze_task(summary: str, description: Any = None) -> dict:
    description_text = extract_jira_description(description)
    if settings.groq_api_key:
        try:
            return await _analyze_with_groq(summary, description_text)
        except Exception as exc:
            logger.warning("Groq analysis failed, falling back to keyword analysis: %s", exc)
    return _keyword_priority(summary)
