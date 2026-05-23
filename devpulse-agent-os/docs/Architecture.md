# DevPulse Agent OS — Architecture

## System Overview

DevPulse Agent OS is a unified developer workflow intelligence platform that
automatically correlates GitHub activity with Jira tickets and presents it in
a single-pane-of-glass dashboard.

## Core Flow

```
GitHub Commit "DEV-101 Fix auth bug"
       │
       ▼ POST /webhooks/github
┌──────────────────────────────────┐
│  Webhook Ingress (FastAPI)        │
│  Extract Jira key: DEV-101        │
│  Store in github_events (JSONB)   │
└──────────────────┬───────────────┘
                   │ Auto-correlate
                   ▼
┌──────────────────────────────────┐
│  Correlation Engine               │
│  linked_activity record created  │
│  github_event_id → DEV-101       │
└──────────────────┬───────────────┘
                   │
                   ▼
┌──────────────────────────────────┐
│  PostgreSQL 16                    │
│  github_events, jira_events,     │
│  linked_activity, activities     │
└──────────────────┬───────────────┘
                   │
                   ▼
┌──────────────────────────────────┐
│  Next.js Dashboard                │
│  - GitHub ↔ Jira Correlation View │
│  - AI Battle Plan (priority order)│
│  - Event Pipeline Counts          │
│  - Integration Status             │
└──────────────────────────────────┘
```

## Component Architecture

```
devpulse-agent-os/
├── backend/  (FastAPI + PostgreSQL)
│   ├── Webhook Ingress        /webhooks/{github,jira,slack,cicd}
│   ├── Correlation Engine     auto-create linked_activity
│   ├── Jira Service           REST API v3 integration
│   ├── GitHub Service         App JWT auth + API calls
│   ├── Priority Engine        keyword/Groq AI classification
│   └── Analytics              velocity, dashboard metrics
│
└── frontend/  (Next.js 14 + Tailwind)
    ├── Dashboard Page         main /
    ├── Header                 integration status badges
    ├── Battle Plan Cards      AI-prioritized task list
    ├── Linked Activity Panel  GitHub ↔ Jira correlation
    ├── Event Counter          webhook pipeline metrics
    └── Activity Timeline      recent issue state changes
```

## Database Schema

```
github_events        — Raw GitHub webhook payloads
  └── extracted_ticket_id  ← Jira key parsed from message

jira_events          — Raw Jira webhook payloads
  └── ticket_id            ← Issue key (e.g. DEV-101)

linked_activity      — Correlation bridge
  ├── github_event_id  FK → github_events
  └── jira_ticket_id   ← Matched Jira key

activities           — User issue transitions
  └── issue_key, status, action_type

cicd_pipelines       — Pipeline execution tracking
agent_audit_logs     — Multi-agent orchestration telemetry
slack_threads        — Slack message storage
```

## Jira Ticket Extraction

Regex: `\b([A-Z][A-Z0-9_]+-\d+)\b`

Search locations (in order):
1. Commit messages (push events)
2. PR title (pull_request events)
3. Branch name (head.ref)
4. Git ref (refs/heads/...)

## Technology Choices

| Component | Technology | Why |
|-----------|-----------|-----|
| Backend | FastAPI | Async HTTP, OpenAPI native, performant |
| DB ORM | SQLAlchemy sync | Simple, reliable for this scale |
| Database | PostgreSQL 16 | JSONB for raw payloads, ACID compliance |
| GitHub Auth | PyJWT + RS256 | Standard GitHub App authentication |
| Frontend | Next.js 14 | SSR, fast, TypeScript native |
| Styling | Tailwind CSS | Rapid UI, consistent design |
| AI (optional) | Groq LLM | Fast inference, free tier available |
