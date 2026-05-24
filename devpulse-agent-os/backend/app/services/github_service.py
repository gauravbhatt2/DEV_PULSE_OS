"""
DevPulse Agent OS — GitHub App Authentication Service
Handles:
  - JWT generation from .pem private key
  - Installation token exchange
  - Authenticated GitHub API calls
"""

import logging
import time
from typing import Any, Dict, Optional

import httpx

from app.config.settings import settings

logger = logging.getLogger(__name__)


def _load_private_key() -> Optional[str]:
    """Load the GitHub App private key from the configured path."""
    try:
        with open(settings.github_private_key_path, "r") as f:
            return f.read()
    except FileNotFoundError:
        logger.warning(
            "GitHub App private key not found at: %s",
            settings.github_private_key_path,
        )
        return None
    except Exception as exc:
        logger.error("Failed to load GitHub private key: %s", exc)
        return None


def _generate_app_jwt() -> Optional[str]:
    """
    Generate a short-lived JWT (10 minutes) signed with the GitHub App private key.
    Required to request installation access tokens.
    """
    try:
        import jwt  # PyJWT
    except ImportError:
        logger.error("PyJWT not installed. Run: pip install PyJWT cryptography")
        return None

    private_key = _load_private_key()
    if not private_key or not settings.github_app_id:
        logger.warning("GitHub App ID or private key not configured — skipping JWT generation.")
        return None

    now = int(time.time())
    payload = {
        "iat": now - 60,   # issued 60s ago to account for clock drift
        "exp": now + 540,  # expires in 9 minutes
        "iss": settings.github_app_id,
    }

    try:
        token = jwt.encode(payload, private_key, algorithm="RS256")
        return token
    except Exception as exc:
        logger.error("JWT generation failed: %s", exc)
        return None


async def get_installation_token() -> Optional[str]:
    """
    Exchange the App JWT for an installation access token.
    The installation token is used for all authenticated GitHub API calls.
    """
    if not settings.github_installation_id:
        logger.warning("GITHUB_INSTALLATION_ID not set — GitHub App API calls will be unauthenticated.")
        return None

    app_jwt = _generate_app_jwt()
    if not app_jwt:
        return None

    url = f"https://api.github.com/app/installations/{settings.github_installation_id}/access_tokens"
    headers = {
        "Authorization": f"Bearer {app_jwt}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(url, headers=headers)
            resp.raise_for_status()
            data = resp.json()
            token = data.get("token")
            expires_at = data.get("expires_at", "unknown")
            logger.info("GitHub installation token obtained, expires: %s", expires_at)
            return token
    except httpx.HTTPStatusError as exc:
        logger.error(
            "GitHub installation token request failed: HTTP %s — %s",
            exc.response.status_code,
            exc.response.text,
        )
        return None
    except Exception as exc:
        logger.error("GitHub installation token request error: %s", exc)
        return None


async def get_installation_repositories(installation_token: str) -> list:
    """List all repositories accessible to this GitHub App installation."""
    headers = {
        "Authorization": f"Bearer {installation_token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                "https://api.github.com/installation/repositories",
                headers=headers,
            )
            resp.raise_for_status()
            data = resp.json()
            return data.get("repositories", [])
    except Exception as exc:
        logger.error("Failed to list installation repositories: %s", exc)
        return []


async def get_pull_requests(owner: str, repo: str, installation_token: str, state: str = "open") -> list:
    """Fetch pull requests for a repository using the installation token."""
    headers = {
        "Authorization": f"Bearer {installation_token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                f"https://api.github.com/repos/{owner}/{repo}/pulls",
                headers=headers,
                params={"state": state, "per_page": 50},
            )
            resp.raise_for_status()
            return resp.json()
    except Exception as exc:
        logger.error("Failed to fetch PRs for %s/%s: %s", owner, repo, exc)
        return []


async def get_commits(
    owner: str, repo: str, installation_token: str, per_page: int = 30
) -> list:
    """Fetch recent commits for a repository."""
    headers = {
        "Authorization": f"Bearer {installation_token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                f"https://api.github.com/repos/{owner}/{repo}/commits",
                headers=headers,
                params={"per_page": per_page},
            )
            resp.raise_for_status()
            return resp.json()
    except Exception as exc:
        logger.error("Failed to fetch commits for %s/%s: %s", owner, repo, exc)
        return []


async def get_commit_detail(
    owner: str, repo: str, sha: str, installation_token: str
) -> Optional[Dict[str, Any]]:
    """Fetch full commit detail including changed files and patches."""
    headers = {
        "Authorization": f"Bearer {installation_token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                f"https://api.github.com/repos/{owner}/{repo}/commits/{sha}",
                headers=headers,
            )
            resp.raise_for_status()
            return resp.json()
    except Exception as exc:
        logger.error("Failed to fetch commit detail %s/%s@%s: %s", owner, repo, sha, exc)
        return None


async def get_repo_details(
    owner: str, repo: str, installation_token: str
) -> Optional[Dict[str, Any]]:
    """Fetch repository metadata including stats."""
    headers = {
        "Authorization": f"Bearer {installation_token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                f"https://api.github.com/repos/{owner}/{repo}",
                headers=headers,
            )
            resp.raise_for_status()
            return resp.json()
    except Exception as exc:
        logger.error("Failed to fetch repo details for %s/%s: %s", owner, repo, exc)
        return None


async def get_branches(
    owner: str, repo: str, installation_token: str
) -> list:
    """Fetch branches for a repository."""
    headers = {
        "Authorization": f"Bearer {installation_token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                f"https://api.github.com/repos/{owner}/{repo}/branches",
                headers=headers,
                params={"per_page": 30},
            )
            resp.raise_for_status()
            return resp.json()
    except Exception as exc:
        logger.error("Failed to fetch branches for %s/%s: %s", owner, repo, exc)
        return []


async def get_contributors(
    owner: str, repo: str, installation_token: str
) -> list:
    """Fetch top contributors for a repository."""
    headers = {
        "Authorization": f"Bearer {installation_token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                f"https://api.github.com/repos/{owner}/{repo}/contributors",
                headers=headers,
                params={"per_page": 10},
            )
            resp.raise_for_status()
            return resp.json()
    except Exception as exc:
        logger.error("Failed to fetch contributors for %s/%s: %s", owner, repo, exc)
        return []


async def get_github_app_status() -> Dict[str, Any]:
    """
    Return the GitHub App integration status.
    Used by the dashboard health endpoint.
    """
    app_id = settings.github_app_id
    key_path = settings.github_private_key_path
    installation_id = settings.github_installation_id

    configured = bool(app_id and installation_id)
    key_available = bool(_load_private_key())

    status: Dict[str, Any] = {
        "configured": configured,
        "app_id": app_id or "not set",
        "installation_id": installation_id or "not set",
        "private_key_loaded": key_available,
        "status": "unconfigured",
    }

    if not configured or not key_available:
        return status

    token = await get_installation_token()
    if token:
        status["status"] = "connected"
        repos = await get_installation_repositories(token)
        status["accessible_repos"] = len(repos)
    else:
        status["status"] = "auth_failed"

    return status
