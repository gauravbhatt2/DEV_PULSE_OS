# Jira Integration Guide

## Overview

DevPulse Agent OS integrates with Jira Cloud via the REST API v3 using Basic Authentication (email + API token).

Capabilities:
- Fetch active sprint issues
- Transition issues (In Progress, Done)
- Receive webhooks for real-time updates
- Correlate Jira tickets with GitHub events

---

## Setup

### 1. Generate Jira API Token

1. Visit: https://id.atlassian.com/manage-profile/security/api-tokens
2. Click **Create API token**
3. Label: `devpulse-agent-os`
4. Copy the token (shown only once)

### 2. Find Your Jira Domain

Your Jira URL format: `https://your-workspace.atlassian.net`

The domain is: `your-workspace.atlassian.net`

### 3. Configure Environment

```bash
JIRA_EMAIL=your-atlassian-account@company.com
JIRA_TOKEN=your_api_token
JIRA_DOMAIN=your-workspace.atlassian.net
```

### 4. Verify Connection

```bash
curl http://localhost:8000/api/jira/status
```

Expected:
```json
{
  "configured": true,
  "status": "connected",
  "domain": "your-workspace.atlassian.net",
  "user": "Your Name"
}
```

---

## Jira Webhook Setup (Optional)

To receive real-time Jira updates in DevPulse:

1. Go to **Jira Settings → System → Webhooks**
2. Create webhook:
   - URL: `https://<ngrok-url>/webhooks/jira`
   - Events: Issue updated, Issue created
3. Test with:

```bash
curl -X POST http://localhost:8000/webhooks/jira \
  -H "Content-Type: application/json" \
  -d '{"webhookEvent":"jira:issue_updated","issue":{"key":"DEV-101","fields":{"summary":"Test"}}}'
```

---

## Available Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/jira/status` | Integration health |
| `GET /api/jira/issues` | Active sprint issues |
| `GET /api/jira/issue/{key}` | Single issue |
| `POST /api/issues/{key}/start` | Move to In Progress |
| `POST /api/issues/{key}/done` | Move to Done |
| `GET /api/battle-plan` | AI-prioritized daily plan |

---

## JQL Configuration

The default query fetches non-done issues:
```
statusCategory != Done ORDER BY updated DESC
```

It first tries `project=SCRUM`, falling back to all projects if SCRUM doesn't exist.

To customize, edit `jira_service.py` → `get_issues()`.
