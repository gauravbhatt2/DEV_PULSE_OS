"""
DevPulse Agent OS — Unified Application Entry Point

Merges:
  - devpulse (GitHub webhook ingestion, PostgreSQL, correlation engine)
  - DevPlus-OS (Jira API integration, battle plan, priority engine)

Routes registered:
  /health, /events, /linked-activity, /api/correlate
  /api/v1/dashboard/*, /api/v1/analytics/*, /api/v1/agents/*
  /api/github/status
  /webhooks/github, /webhooks/jira, /webhooks/slack, /webhooks/cicd
  /api/battle-plan
  /api/issues/{key}/start, /api/issues/{key}/done
  /api/jira/status, /api/jira/issues, /api/jira/issue/{key}
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config.database import Base, engine
from app.config.settings import settings

# Register all models before create_all
import app.models.events  # noqa: F401

from app.routes.core import router as core_router
from app.routes.webhooks import router as webhooks_router
from app.routes.battle_plan import router as battle_plan_router
from app.routes.issues import router as issues_router
from app.routes.jira import router as jira_router
from app.routes.github_intel import router as github_intel_router

logging.basicConfig(
    level=logging.DEBUG if settings.debug else logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s — %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("DevPulse Agent OS starting up…")
    try:
        Base.metadata.create_all(bind=engine)
        logger.info("Database schema sync complete.")
    except Exception as exc:
        logger.error("Schema creation failed: %s", exc)
        raise
    yield
    logger.info("DevPulse Agent OS shutting down.")


app = FastAPI(
    title=settings.project_name,
    description=(
        "DevPulse Agent OS — Enterprise Developer Workflow Intelligence Platform.\n\n"
        "Ingests GitHub webhooks, correlates commits/PRs to Jira tickets, "
        "generates AI-powered daily battle plans, and visualizes engineering activity "
        "in a unified dashboard.\n\n"
        "**Core Flow:** GitHub Commit → Webhook Ingestion → Extract Jira Ticket ID "
        "→ Auto-Correlation → Linked Activity → Dashboard Timeline"
    ),
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if settings.debug else ["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Core: health, events, linked-activity, dashboard, analytics, agents
app.include_router(core_router)

# Webhooks: GitHub, Jira, Slack, CI/CD ingestion
app.include_router(webhooks_router)

# Jira: battle-plan, issues management, jira data
app.include_router(battle_plan_router, prefix="/api")
app.include_router(issues_router, prefix="/api")
app.include_router(jira_router, prefix="/api")

# GitHub Intelligence Dashboard
app.include_router(github_intel_router)


@app.get("/", tags=["Root"], include_in_schema=False)
async def root():
    return {
        "project": settings.project_name,
        "version": "1.0.0",
        "status": "online",
        "docs": "/docs",
        "health": "/health",
        "dashboard": "/api/v1/dashboard/priorities",
        "webhooks": {
            "github": "/webhooks/github",
            "jira": "/webhooks/jira",
        },
    }
