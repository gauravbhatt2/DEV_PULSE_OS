"""
DevPulse Agent OS — Reusable AI Service Layer
Supports:
  - Groq (preferred when GROQ_API_KEY is set)
  - Ollama (local fallback)

Primary use: commit diff analysis, code change explanation.
"""

import json
import logging
import re
from typing import Any, Dict, List, Optional

import httpx

from app.config.settings import settings

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Low-level callers
# ---------------------------------------------------------------------------

async def _call_groq(prompt: str, max_tokens: int = 800) -> str:
    headers = {
        "Authorization": f"Bearer {settings.groq_api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": settings.groq_model,
        "messages": [
            {
                "role": "system",
                "content": (
                    "You are a senior software engineer. "
                    "Always respond with ONLY valid JSON — no markdown, no backticks, no explanation text before or after."
                ),
            },
            {"role": "user", "content": prompt},
        ],
        "max_tokens": max_tokens,
        "temperature": 0.2,
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers=headers,
            json=payload,
        )
        resp.raise_for_status()
        data = resp.json()
        return data["choices"][0]["message"]["content"]


async def _call_ollama(prompt: str, max_tokens: int = 800) -> str:
    payload = {
        "model": settings.ollama_model,
        "prompt": prompt,
        "stream": False,
        "options": {"num_predict": max_tokens, "temperature": 0.2},
    }
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            f"{settings.ollama_host}/api/generate",
            json=payload,
        )
        resp.raise_for_status()
        data = resp.json()
        return data.get("response", "")


def _extract_json(text: str) -> Optional[dict]:
    """
    Robustly extract a JSON object from LLM output.
    Handles: raw JSON, ```json blocks, JSON wrapped in text.
    """
    # Strip markdown code fences if present
    text = re.sub(r"```(?:json)?\s*", "", text).strip()

    # Try direct parse first
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Find the outermost JSON object
    start = text.find("{")
    if start == -1:
        return None

    # Walk from start, counting braces
    depth = 0
    for i, ch in enumerate(text[start:], start):
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                try:
                    return json.loads(text[start : i + 1])
                except json.JSONDecodeError:
                    return None
    return None


async def complete(prompt: str, max_tokens: int = 800) -> str:
    """Call AI with automatic Groq → Ollama fallback."""
    if settings.groq_api_key:
        try:
            result = await _call_groq(prompt, max_tokens)
            logger.debug("Groq call succeeded, response length: %d", len(result))
            return result
        except Exception as exc:
            logger.warning("Groq call failed (%s), falling back to Ollama", exc)

    try:
        result = await _call_ollama(prompt, max_tokens)
        logger.debug("Ollama call succeeded, response length: %d", len(result))
        return result
    except Exception as exc:
        logger.error("Ollama call also failed: %s", exc)
        raise RuntimeError(f"All AI backends unavailable. Groq/Ollama both failed.") from exc


# ---------------------------------------------------------------------------
# Commit Analysis
# ---------------------------------------------------------------------------

def _build_commit_prompt(
    commit_sha: str,
    commit_message: str,
    repo_full_name: str,
    files_changed: List[Dict[str, Any]],
    jira_ticket: Optional[str],
) -> str:
    # Build file diff section — keep newlines, more chars per file
    file_sections = []
    for f in files_changed[:8]:
        fname = f.get("filename", "?")
        status = f.get("status", "modified")
        additions = f.get("additions", 0)
        deletions = f.get("deletions", 0)
        patch = (f.get("patch", "") or "")[:500]  # 500 chars of actual diff

        file_sections.append(
            f"File: {fname} [{status}] +{additions}/-{deletions}\n"
            + (f"Diff:\n{patch}\n" if patch else "(no diff available)\n")
        )

    files_block = "\n".join(file_sections) if file_sections else "No file details available."
    jira_line = f"Linked Jira Ticket: {jira_ticket}\n" if jira_ticket else ""

    total_files = len(files_changed)
    total_additions = sum(f.get("additions", 0) for f in files_changed)
    total_deletions = sum(f.get("deletions", 0) for f in files_changed)

    return f"""Analyze this git commit and explain it clearly for engineering stakeholders.

Repository: {repo_full_name}
Commit: {commit_sha[:8]}
Message: {commit_message}
{jira_line}Stats: {total_files} files, +{total_additions}/-{total_deletions} lines

Changed Files with Diffs:
{files_block}

Return ONLY this JSON (no extra text, no markdown):
{{
  "summary": "One clear sentence describing what this commit does, using the actual code changes — NOT just repeating the commit message.",
  "what_changed": "2-3 sentences describing the specific technical changes made (mention file names, functions, or logic that changed).",
  "why_it_changed": "1-2 sentences explaining the likely business or technical reason for this change, inferred from the code and message.",
  "impact": "Which parts of the system, users, or workflows are affected by this change.",
  "risk_level": "low",
  "risk_reason": "One sentence explaining why this is low/medium/high risk.",
  "affected_modules": ["list", "of", "top-level", "folders", "or", "modules"]
}}

For risk_level use exactly: low, medium, or high."""


async def analyze_commit(
    commit_sha: str,
    commit_message: str,
    repo_full_name: str,
    files_changed: List[Dict[str, Any]],
    jira_ticket: Optional[str] = None,
) -> Dict[str, Any]:
    """Generate AI-powered analysis of a git commit."""
    prompt = _build_commit_prompt(
        commit_sha, commit_message, repo_full_name, files_changed, jira_ticket
    )

    logger.info(
        "Analyzing commit %s in %s (%d files)",
        commit_sha[:8], repo_full_name, len(files_changed),
    )

    try:
        raw = await complete(prompt, max_tokens=800)
    except RuntimeError as exc:
        logger.warning("AI unavailable, using smart fallback: %s", exc)
        return _smart_fallback(commit_message, files_changed, str(exc))

    parsed = _extract_json(raw)
    if not parsed:
        logger.warning("Could not extract JSON from AI response. Raw: %.200s", raw)
        return _smart_fallback(commit_message, files_changed, "non-JSON AI response")

    # Normalise and validate
    risk = str(parsed.get("risk_level", "medium")).lower().split()[0]
    if risk not in ("low", "medium", "high"):
        risk = "medium"
    parsed["risk_level"] = risk

    # If AI echoed back the placeholder text, it didn't understand — use fallback
    if "cannot be determined" in str(parsed.get("why_it_changed", "")).lower():
        fallback = _smart_fallback(commit_message, files_changed, "AI returned placeholder")
        parsed["why_it_changed"] = fallback["why_it_changed"]
        parsed["impact"] = fallback["impact"]

    logger.info("Commit analysis complete for %s, risk=%s", commit_sha[:8], risk)
    return parsed


# ---------------------------------------------------------------------------
# Smart Fallback (no AI)
# ---------------------------------------------------------------------------

def _smart_fallback(
    commit_message: str,
    files_changed: List[Dict[str, Any]],
    reason: str,
) -> Dict[str, Any]:
    """
    Keyword-based fallback when AI is unavailable.
    Produces meaningful output by analyzing file paths and commit message.
    """
    msg_lower = (commit_message or "").lower()
    filenames = [f.get("filename", "") for f in files_changed if f.get("filename")]
    modules = list({f.split("/")[0] for f in filenames if "/" in f} |
                   {f.rsplit(".", 1)[0] for f in filenames if "." in f and "/" not in f})
    modules = [m for m in modules if m][:5]

    # Determine change type from message
    is_fix = any(w in msg_lower for w in ["fix", "bug", "error", "crash", "hotfix", "patch"])
    is_feat = any(w in msg_lower for w in ["add", "implement", "create", "new", "feature", "build"])
    is_refactor = any(w in msg_lower for w in ["refactor", "cleanup", "rename", "move", "reorganize", "restructure"])
    is_test = any(w in msg_lower for w in ["test", "spec", "coverage", "unit", "integration"])
    is_docs = any(w in msg_lower for w in ["doc", "readme", "comment", "changelog"])
    is_config = any(w in msg_lower for w in ["config", "env", "settings", "docker", "ci", "yml", "yaml"])
    is_security = any(w in msg_lower for w in ["auth", "security", "token", "password", "encrypt", "secret"])
    is_perf = any(w in msg_lower for w in ["perf", "optimize", "speed", "cache", "slow", "latency"])

    # Risk assessment
    if is_security or is_fix:
        risk = "high"
    elif is_feat or is_config:
        risk = "medium"
    else:
        risk = "low"

    # Build why_it_changed from actual file paths + message keywords
    changed_types = []
    if any(".test." in f or "test/" in f or "spec/" in f for f in filenames):
        changed_types.append("test files")
    if any(".md" in f or "docs/" in f for f in filenames):
        changed_types.append("documentation")
    if any("config" in f or ".env" in f or "docker" in f.lower() for f in filenames):
        changed_types.append("configuration")
    if any(".py" in f for f in filenames):
        changed_types.append("Python backend")
    if any(".ts" in f or ".tsx" in f for f in filenames):
        changed_types.append("TypeScript frontend")

    # why_it_changed: infer from keywords
    if is_fix:
        why = f"A bug or error was identified and corrected in {', '.join(modules[:2]) or 'the codebase'}."
    elif is_feat:
        why = f"New functionality was being added to {', '.join(modules[:2]) or 'the system'}."
    elif is_refactor:
        why = f"The code in {', '.join(modules[:2]) or 'these modules'} was restructured to improve maintainability or readability."
    elif is_test:
        why = "Test coverage was being improved to ensure reliability of existing functionality."
    elif is_docs:
        why = "Documentation was updated to reflect recent changes or improve clarity for developers."
    elif is_config:
        why = "Configuration or infrastructure settings were updated, likely due to environment or deployment changes."
    elif is_security:
        why = f"Security-related changes were made to {', '.join(modules[:2]) or 'authentication or access control'}."
    elif is_perf:
        why = f"Performance improvements were made in {', '.join(modules[:2]) or 'the system'}."
    else:
        why = f"Changes were made to {', '.join(modules[:3]) or 'the codebase'} as part of ongoing development."

    # impact: infer from file types
    if changed_types:
        impact = f"Affects {', '.join(changed_types)}."
        if is_security:
            impact += " Authentication and access control logic may need frontend updates."
        elif is_config:
            impact += " Deployment or environment setup may be required."
    else:
        impact = f"Affects {', '.join(modules[:3]) or 'the affected modules'}. Review the changed files for downstream effects."

    total_adds = sum(f.get("additions", 0) for f in files_changed)
    total_dels = sum(f.get("deletions", 0) for f in files_changed)

    what_changed = (
        f"Modified {len(files_changed)} file(s) with +{total_adds}/-{total_dels} lines."
    )
    if modules:
        what_changed += f" Affected areas: {', '.join(modules[:4])}."
    if changed_types:
        what_changed += f" File types: {', '.join(changed_types)}."

    return {
        "summary": commit_message[:140] if commit_message else "Code changes committed.",
        "what_changed": what_changed,
        "why_it_changed": why,
        "impact": impact,
        "risk_level": risk,
        "risk_reason": (
            f"{'Security or bug fix changes carry higher risk.' if risk == 'high' else 'Feature or config changes need testing.' if risk == 'medium' else 'Low-impact change based on commit type.'}"
            f" (AI unavailable: {reason})"
        ),
        "affected_modules": modules,
        "_fallback": True,
    }
