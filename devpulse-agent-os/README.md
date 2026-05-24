# DevPulse Agent OS

> **Enterprise Developer Workflow Intelligence Platform**  
> GitHub + Jira correlation · AI-powered battle plans · Real-time activity dashboard · **GitHub Intelligence Dashboard**

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Problem Statement](#2-problem-statement)
3. [Architecture Explanation](#3-architecture-explanation)
4. [Folder Structure](#4-folder-structure)
5. [Tech Stack](#5-tech-stack)
6. [Setup Instructions](#6-setup-instructions)
7. [Environment Variables](#7-environment-variables)
8. [PostgreSQL Setup](#8-postgresql-setup)
9. [Running the Backend](#9-running-the-backend)
10. [Running the Frontend](#10-running-the-frontend)
11. [Docker Instructions](#11-docker-instructions)
12. [ngrok Setup](#12-ngrok-setup)
13. [GitHub App Setup](#13-github-app-setup)
14. [GitHub Webhook Setup](#14-github-webhook-setup)
15. [Private Key Setup](#15-private-key-setup)
16. [Jira Setup](#16-jira-setup)
17. [GitHub Intelligence Dashboard](#17-github-intelligence-dashboard)
18. [AI Commit Analysis](#18-ai-commit-analysis)
19. [Swagger API Usage](#19-swagger-api-usage)
20. [Example Webhook Testing Flow](#20-example-webhook-testing-flow)
21. [Demo Flow](#21-demo-flow)
22. [Troubleshooting](#22-troubleshooting)

---

## 1. Project Overview

DevPulse Agent OS is an enterprise-grade developer productivity platform that:

- **Ingests GitHub webhooks** (push, pull_request, workflow events)
- **Auto-extracts Jira ticket IDs** from commit messages, PR titles, and branch names using regex `[A-Z][A-Z0-9_]+-\d+`
- **Creates linked activity records** in PostgreSQL bridging GitHub events to Jira tickets
- **Fetches live Jira data** via the Jira REST API v3
- **Generates AI-prioritized daily battle plans** using keyword analysis (or Groq LLM)
- **GitHub Intelligence Dashboard** — view repos, commits, PRs, and AI-analyze any commit
- **Visualizes everything** in a modern Next.js dashboard with real-time correlation view

**Core Correlation Flow:**
```
GitHub Commit "DEV-101 Added auth middleware"
       ↓
  POST /webhooks/github
       ↓
  Extract ticket ID: DEV-101
       ↓
  Store in github_events table
       ↓
  Auto-create linked_activity record
       ↓
  Display on dashboard correlation timeline
```

---

## 2. Problem Statement

Engineering teams lose 15-30% of productivity to context-switching between GitHub, Jira, Slack, and CI/CD dashboards. There is no single pane of glass that:

- Shows *what* to work on next (priority-ordered)
- Explains *why* it's important (AI reasoning)
- Links GitHub activity *automatically* to Jira tickets
- Tracks real-time workflow velocity

DevPulse Agent OS solves this with automated correlation and AI-driven daily planning.

---

## 3. Architecture Explanation

```
┌─────────────────────────────────────────────────────────┐
│                    DEVPULSE AGENT OS                     │
│                                                          │
│  ┌─────────────────┐    ┌─────────────────────────────┐ │
│  │  Next.js Front  │───▶│     FastAPI Backend          │ │
│  │  (Port 3000)    │    │     (Port 8000)              │ │
│  └─────────────────┘    └──────────────┬──────────────┘ │
│                                         │                │
│  ┌──────────────────────────────────────▼─────────────┐ │
│  │                  PostgreSQL 16                       │ │
│  │  github_events │ jira_events │ linked_activity      │ │
│  │  activities    │ cicd_pipelines │ agent_audit_logs  │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                          │
│  External Integrations (outbound only):                  │
│  ├── GitHub App API (authenticated via .pem JWT)        │
│  ├── Jira REST API v3 (Basic auth: email + token)       │
│  └── Groq LLM API (optional AI priority analysis)       │
│                                                          │
│  Webhook Ingress (inbound via ngrok in development):    │
│  ├── POST /webhooks/github                              │
│  ├── POST /webhooks/jira                                │
│  ├── POST /webhooks/slack                               │
│  └── POST /webhooks/cicd                                │
└─────────────────────────────────────────────────────────┘
```

### Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Sync SQLAlchemy | Simple, reliable, no async complexity for DB operations |
| PostgreSQL JSONB | Stores raw webhook payloads for full-fidelity replay |
| Auto-correlation on ingest | Zero-latency linking — no background jobs needed |
| Keyword priority fallback | Works without Groq API key for hackathon demos |
| Single FastAPI service | No microservice overhead — fast to run, easy to demo |

---

## 4. Folder Structure

```
devpulse-agent-os/
├── backend/                          # FastAPI backend
│   ├── app/
│   │   ├── main.py                   # Application entry point
│   │   ├── config/
│   │   │   ├── settings.py           # Pydantic Settings (env vars)
│   │   │   └── database.py           # SQLAlchemy engine + session
│   │   ├── models/
│   │   │   └── events.py             # All ORM models
│   │   ├── routes/
│   │   │   ├── core.py               # Health, events, dashboard, analytics, agents
│   │   │   ├── webhooks.py           # GitHub, Jira, Slack, CI/CD ingestion
│   │   │   ├── battle_plan.py        # AI daily work plan
│   │   │   ├── issues.py             # Jira issue transitions
│   │   │   └── jira.py               # Jira data endpoints
│   │   ├── services/
│   │   │   ├── github_service.py     # GitHub App JWT auth + API
│   │   │   ├── jira_service.py       # Jira REST API v3 integration
│   │   │   ├── correlation_service.py # GitHub↔Jira auto-correlation
│   │   │   └── priority_engine.py    # Task priority analysis (keyword/Groq)
│   │   └── utils/
│   │       └── formatting.py         # Time formatting helpers
│   ├── Dockerfile
│   └── requirements.txt
│
├── frontend/                         # Next.js 14 frontend
│   ├── app/
│   │   ├── layout.tsx                # Root layout
│   │   ├── globals.css               # Tailwind base styles
│   │   └── page.tsx                  # Main dashboard page
│   ├── components/
│   │   ├── Header.tsx                # Top navigation with integration status
│   │   ├── SummaryBanner.tsx         # Metrics summary row
│   │   ├── BattlePlanCard.tsx        # Task card with actions
│   │   ├── JiraBacklogTable.tsx      # Sprint backlog list
│   │   ├── ActivityTimeline.tsx      # Recent issue state changes
│   │   ├── LinkedActivityPanel.tsx   # GitHub↔Jira correlation view
│   │   ├── EventCounter.tsx          # Webhook event counts
│   │   └── Toast.tsx                 # Notification toasts
│   ├── services/
│   │   └── api.ts                    # All API calls to backend
│   ├── types/
│   │   └── index.ts                  # TypeScript type definitions
│   ├── package.json
│   ├── tailwind.config.js
│   └── Dockerfile
│
├── docs/                             # Architecture documentation
├── integrations/
│   ├── github/                       # GitHub App setup guide
│   └── jira/                         # Jira integration guide
├── keys/                             # Private keys (gitignored)
│   └── .gitkeep
├── scripts/
│   ├── start.sh                      # Linux/Mac quick start
│   ├── start.ps1                     # Windows PowerShell quick start
│   └── test-webhooks.sh              # Webhook payload simulator
├── docker-compose.yml
├── .env.example
├── .gitignore
└── README.md
```

---

## 5. Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Backend Framework | FastAPI | 0.111.0 |
| ASGI Server | Uvicorn | 0.29.0 |
| Database ORM | SQLAlchemy (sync) | 2.0.30 |
| Database | PostgreSQL | 16 |
| DB Driver | psycopg2-binary | 2.9.9 |
| HTTP Client | httpx | 0.27.0 |
| Settings | pydantic-settings | 2.2.1 |
| GitHub App JWT | PyJWT + cryptography | 2.8.0 / 42.0.8 |
| Frontend Framework | Next.js | 14.x |
| UI Styling | Tailwind CSS | 3.x |
| Language (frontend) | TypeScript | 5.x |
| Containerization | Docker + Compose | 24.x |
| AI (optional) | Groq LLM API | llama3-8b-8192 |

---

## 6. Setup Instructions

### Prerequisites

- Python 3.11+
- Node.js 20+
- Docker + Docker Compose (recommended)
- PostgreSQL 16 (if running without Docker)

### Option A: Docker (Recommended)

```bash
# 1. Clone or navigate to the project
cd devpulse-agent-os

# 2. Copy and configure environment
cp .env.example .env
# Edit .env with your Jira credentials and GitHub App settings

# 3. Copy your GitHub App private key
cp /path/to/devpulse-agent-os.private-key.pem keys/

# 4. Start everything
docker-compose up -d --build

# 5. Check services
docker-compose ps
curl http://localhost:8000/health
```

### Option B: Local Development

```bash
# Terminal 1: Backend
cd backend
python -m venv .venv
.venv\Scripts\activate        # Windows
# source .venv/bin/activate   # Linux/Mac
pip install -r requirements.txt
cp ../.env.example ../.env    # Edit with your values
uvicorn app.main:app --reload --port 8000

# Terminal 2: Frontend
cd frontend
npm install
npm run dev
```

---

## 7. Environment Variables

Copy `.env.example` to `.env` and fill in these values:

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `DEBUG` | No | Enable debug logging (default: false) |
| `JIRA_EMAIL` | For Jira | Atlassian account email |
| `JIRA_TOKEN` | For Jira | Jira API token |
| `JIRA_DOMAIN` | For Jira | e.g. `mycompany.atlassian.net` |
| `GITHUB_APP_ID` | For GitHub App | From your GitHub App settings |
| `GITHUB_INSTALLATION_ID` | For GitHub App | Installation ID for your org/repo |
| `GITHUB_PRIVATE_KEY_PATH` | For GitHub App | Path to .pem file (default: `keys/*.pem`) |
| `GITHUB_WEBHOOK_SECRET` | Recommended | For webhook signature verification |
| `GROQ_API_KEY` | Optional | For AI priority analysis |
| `GROQ_MODEL` | Optional | Groq model (default: `llama3-8b-8192`) |
| `OLLAMA_HOST` | Optional | Ollama SLM endpoint |

---

## 8. PostgreSQL Setup

### Using Docker (Automatic)

PostgreSQL is included in `docker-compose.yml`. Tables are created automatically on startup via `Base.metadata.create_all()`.

### Manual Setup

```sql
-- Create database and user
CREATE USER devpulse WITH PASSWORD 'devpulse_secret';
CREATE DATABASE devpulse_db OWNER devpulse;
GRANT ALL PRIVILEGES ON DATABASE devpulse_db TO devpulse;

-- Tables are auto-created by SQLAlchemy on first start
```

Set your `DATABASE_URL`:
```
DATABASE_URL=postgresql://devpulse:devpulse_secret@localhost:5432/devpulse_db
```

### Tables Created Automatically

| Table | Purpose |
|-------|---------|
| `github_events` | Raw GitHub webhook payloads with extracted Jira key |
| `jira_events` | Raw Jira webhook payloads |
| `linked_activity` | GitHub↔Jira correlation bridge |
| `activities` | User-initiated issue state changes |
| `slack_threads` | Slack message ingestion |
| `cicd_pipelines` | CI/CD pipeline run tracking |
| `agent_audit_logs` | Multi-agent orchestration telemetry |

---

## 9. Running the Backend

```bash
cd backend

# Install dependencies
pip install -r requirements.txt

# Run with auto-reload (development)
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Run production
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 2
```

**API is available at:**
- `http://localhost:8000` — Root
- `http://localhost:8000/docs` — Swagger UI
- `http://localhost:8000/redoc` — ReDoc
- `http://localhost:8000/health` — Health check

---

## 10. Running the Frontend

```bash
cd frontend

# Install dependencies
npm install

# Development server
npm run dev

# Production build
npm run build
npm start
```

**Frontend is available at:** `http://localhost:3000`

The frontend connects to the backend at `NEXT_PUBLIC_API_URL` (default: `http://localhost:8000`). Edit `frontend/.env.local` to change this.

---

## 11. Docker Instructions

```bash
# Start all services (builds if needed)
docker-compose up -d --build

# Start without rebuilding
docker-compose up -d

# View logs
docker-compose logs -f backend
docker-compose logs -f frontend
docker-compose logs -f postgres

# Stop services
docker-compose down

# Stop and remove volumes (clean reset)
docker-compose down -v

# Rebuild single service
docker-compose build backend
docker-compose up -d backend

# Connect to PostgreSQL
docker exec -it devpulse_postgres psql -U devpulse -d devpulse_db

# Shell into backend container
docker exec -it devpulse_backend bash
```

### Port Mapping

| Service | Container Port | Host Port |
|---------|---------------|-----------|
| Backend (FastAPI) | 8000 | 8000 |
| Frontend (Next.js) | 3000 | 3000 |
| PostgreSQL | 5432 | 5434 |

---

## 12. ngrok Setup

ngrok is required to expose your local backend to GitHub's webhook delivery system during development.

### Install ngrok

```bash
# Download from https://ngrok.com/download
# Or via npm:
npm install -g ngrok

# Authenticate (create free account at ngrok.com)
ngrok authtoken <your_auth_token>
```

### Start ngrok

```bash
ngrok http 8000
```

You'll get a URL like: `https://abc123.ngrok-free.app`

Your webhook endpoint will be:
```
https://abc123.ngrok-free.app/webhooks/github
```

**Important:** ngrok URLs change each restart (free tier). Update your GitHub App webhook URL when you restart ngrok.

---

## 13. GitHub App Setup

### Step 1: Create GitHub App

1. Go to **GitHub → Settings → Developer settings → GitHub Apps → New GitHub App**
2. Fill in:
   - **Name:** `DevPulse Agent OS`
   - **Homepage URL:** `http://localhost:3000`
   - **Webhook URL:** `https://<ngrok-url>/webhooks/github`
   - **Webhook Secret:** Generate a random string (save it as `GITHUB_WEBHOOK_SECRET`)
3. Under **Permissions:**
   - Repository: Contents (Read), Pull requests (Read), Webhooks (Read)
4. Under **Subscribe to events:**
   - ✅ Push
   - ✅ Pull request
   - ✅ Workflow run
5. Click **Create GitHub App**

### Step 2: Get App Credentials

After creation:
- **App ID** → Copy to `GITHUB_APP_ID` in `.env`
- **Client ID** → Note for reference

### Step 3: Generate Private Key

1. Scroll to **Private keys** section
2. Click **Generate a private key**
3. Save the downloaded `.pem` file to `keys/` directory:
   ```bash
   cp ~/Downloads/devpulse-agent-os.*.private-key.pem keys/
   ```
4. Set `GITHUB_PRIVATE_KEY_PATH=keys/devpulse-agent-os.private-key.pem`

### Step 4: Install the App

1. From your GitHub App page, click **Install App**
2. Select your organization or personal account
3. Select the repositories you want DevPulse to monitor
4. After installation, copy the **Installation ID** from the URL:
   - URL will be: `https://github.com/settings/installations/<INSTALLATION_ID>`
5. Set `GITHUB_INSTALLATION_ID=<installation_id>`

---

## 14. GitHub Webhook Setup

The GitHub App automatically creates webhooks for installed repositories. However, you can also manually configure repository webhooks:

1. Go to **Repository → Settings → Webhooks → Add webhook**
2. **Payload URL:** `https://<ngrok-url>/webhooks/github`
3. **Content type:** `application/json`
4. **Secret:** Same as `GITHUB_WEBHOOK_SECRET`
5. **Which events:**
   - ✅ Pushes
   - ✅ Pull requests
   - ✅ Workflow jobs (optional)
6. Click **Add webhook**

### Verify Webhook Delivery

```bash
# Check if GitHub events are reaching your backend
curl http://localhost:8000/events
# Should show: {"github_events": N, ...}
```

---

## 15. Private Key Setup

The GitHub App `.pem` private key is used to generate short-lived JWTs for authenticated API calls.

```bash
# Place the key in the keys/ directory
cp /path/to/your-app.private-key.pem keys/

# Set in .env
GITHUB_PRIVATE_KEY_PATH=keys/your-app.private-key.pem

# Verify it loads correctly
curl http://localhost:8000/api/github/status
```

Expected response when configured:
```json
{
  "configured": true,
  "status": "connected",
  "app_id": "12345",
  "accessible_repos": 3
}
```

**Security Notes:**
- The `keys/` directory is gitignored — never commit `.pem` files
- In Docker, keys are mounted read-only: `./keys:/app/keys:ro`
- Rotate keys regularly from GitHub App settings

---

## 16. Jira Setup

### Get Jira API Token

1. Go to [https://id.atlassian.com/manage-profile/security/api-tokens](https://id.atlassian.com/manage-profile/security/api-tokens)
2. Click **Create API token**
3. Label it: `devpulse-agent-os`
4. Copy the token

### Configure .env

```bash
JIRA_EMAIL=your-email@company.com
JIRA_TOKEN=your_api_token_here
JIRA_DOMAIN=your-workspace.atlassian.net
```

### Verify Jira Connection

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

### Set Up Jira Webhook (Optional)

To receive real-time Jira events in DevPulse:

1. Go to **Jira Settings → System → WebHooks**
2. Click **+ Create a WebHook**
3. **URL:** `https://<ngrok-url>/webhooks/jira`
4. **Events:** Issue created, Issue updated, Issue deleted
5. Click **Create**

---

## 17. GitHub Intelligence Dashboard

The GitHub Intelligence Dashboard at **http://localhost:3000/github** provides:

### Layout

```
┌──────────────────────────────────────────────────────────────┐
│                    Navigation Header                          │
├──────────────┬─────────────────────────┬─────────────────────┤
│   Repo List  │    Activity / Commits   │   AI Analysis Panel │
│  (sidebar)   │       / PRs Feed        │   + Repo Insights   │
│              │                         │                     │
│  • Search    │  Tabs:                  │  • Summary          │
│  • Language  │  • Live Feed            │  • Risk Level       │
│    dot       │  • Commits + [Analyze]  │  • What Changed     │
│  • Issues    │  • Pull Requests        │  • Why Changed      │
│    count     │                         │  • Impact           │
│  • Last push │  Auto-refresh: 30s      │  • Affected Modules │
│              │                         │  • Linked Jira      │
└──────────────┴─────────────────────────┴─────────────────────┘
```

### Features

1. **Repository List** — All repos connected to your GitHub App, searchable, with language indicators
2. **Live Activity Feed** — All webhook events in real-time (push, PR, create), auto-refreshes every 30 seconds
3. **Commits View** — Recent commits per repo with `+/-` stats, Jira ticket links, and `[Analyze]` button
4. **Pull Requests View** — Open/closed/merged PRs with branch info, Jira correlation, and status badges
5. **AI Analysis** — Click `Analyze` on any commit to get instant AI-powered explanation
6. **Engineering Insights** — When a repo is selected (without analysis), shows branches, contributors, and repo stats

### Repository Sync

Repositories are fetched live from the GitHub App installation — no manual configuration needed. Any repo the GitHub App is installed on will appear automatically.

---

## 18. AI Commit Analysis

### How It Works

```
Click [Analyze] on a commit
        ↓
Backend fetches commit detail from GitHub API
(includes file diffs, +/- line counts, patches)
        ↓
Sends structured prompt to AI:
  - Commit message
  - Changed files with patches
  - Linked Jira ticket (if detected)
        ↓
AI returns structured JSON:
  - summary
  - what_changed
  - why_it_changed
  - impact
  - risk_level (low / medium / high)
  - affected_modules
        ↓
Displayed in right-side Analysis Panel
```

### AI Backend Selection

| Condition | AI Used |
|---|---|
| `GROQ_API_KEY` is set | Groq (`llama3-8b-8192`) — fast, cloud |
| No Groq key, Ollama running | Ollama (`qwen2.5:3b`) — local, private |
| Both unavailable | Keyword fallback (no AI, heuristic only) |

### Example Analysis Output

```json
{
  "summary": "Refactors the authentication middleware to use JWT instead of session cookies.",
  "what_changed": "Replaced express-session with jsonwebtoken. Added token verification in auth.middleware.ts.",
  "why_it_changed": "Likely migrating to a stateless architecture for scalability across multiple services.",
  "impact": "All protected API routes now require Bearer tokens. Frontend auth flow must be updated.",
  "risk_level": "high",
  "risk_reason": "Core authentication system change affecting all protected routes.",
  "affected_modules": ["auth", "middleware", "routes"]
}
```

### Groq Setup

1. Create a free account at [console.groq.com](https://console.groq.com)
2. Generate an API key
3. Add to `.env`:
   ```
   GROQ_API_KEY=gsk_your_key_here
   GROQ_MODEL=llama3-8b-8192
   ```
4. Restart the backend — AI analysis is now live

### Ollama Setup (Local Fallback)

```bash
# Install Ollama from https://ollama.com
ollama pull qwen2.5:3b
ollama serve
```

Ollama runs at `http://localhost:11434` by default. The Docker container accesses it via `host.docker.internal:11434`.

---

## 19. Swagger API Usage

The full interactive API documentation is available at:

```
http://localhost:8000/docs
```

### Key Endpoint Categories

**Webhooks:**
- `POST /webhooks/github` — Ingest GitHub events
- `POST /webhooks/jira` — Ingest Jira events
- `POST /webhooks/cicd` — Ingest CI/CD events

**Core Data:**
- `GET /health` — System health check
- `GET /events` — Event pipeline counts
- `GET /linked-activity` — GitHub↔Jira correlation records

**Correlation:**
- `POST /api/correlate` — Manual correlation pass

**Dashboard:**
- `GET /api/v1/dashboard/priorities` — Workspace priorities
- `GET /api/v1/dashboard/integration-status` — GitHub + Jira status

**Analytics:**
- `GET /api/v1/analytics/velocity` — Delivery velocity metrics

**Jira:**
- `GET /api/jira/status` — Jira connectivity
- `GET /api/jira/issues` — Active sprint issues
- `GET /api/battle-plan` — AI-prioritized daily work plan
- `POST /api/issues/{key}/start` — Move issue to In Progress
- `POST /api/issues/{key}/done` — Move issue to Done

**Agents:**
- `GET /api/v1/agents/health` — Agent health matrix
- `POST /api/v1/agents/orchestrate` — Trigger orchestration pass

---

## 18. Example Webhook Testing Flow

Use the included test script:

```bash
# Linux/Mac
bash scripts/test-webhooks.sh

# Windows (using curl)
curl -X POST http://localhost:8000/webhooks/github \
  -H "Content-Type: application/json" \
  -H "X-GitHub-Event: push" \
  -d "{\"ref\": \"refs/heads/main\", \"commits\": [{\"message\": \"DEV-101 Fix authentication bug\", \"id\": \"abc123\", \"author\": {\"name\": \"Developer\"}}], \"repository\": {\"full_name\": \"company/app\"}}"
```

### Manual Test Sequence

```bash
# 1. Send GitHub push with Jira ticket
curl -X POST http://localhost:8000/webhooks/github \
  -H "Content-Type: application/json" \
  -H "X-GitHub-Event: push" \
  -d '{"commits": [{"message": "DEV-101 Added auth middleware"}], "repository": {"full_name": "company/api"}}'

# 2. Send corresponding Jira event
curl -X POST http://localhost:8000/webhooks/jira \
  -H "Content-Type: application/json" \
  -d '{"webhookEvent": "jira:issue_updated", "issue": {"key": "DEV-101", "fields": {"summary": "Auth middleware"}}}'

# 3. Check auto-correlation was created
curl http://localhost:8000/linked-activity

# 4. Check event counts
curl http://localhost:8000/events

# 5. Manually trigger correlation pass (for backfill)
curl -X POST http://localhost:8000/api/correlate
```

---

## 21. Demo Flow

This is the recommended demo sequence for the hackathon presentation:

### Setup (before demo)
1. Start services: `docker-compose up -d`
2. Start ngrok: `ngrok http 8000`
3. Update GitHub App webhook URL with ngrok URL
4. Open frontend: `http://localhost:3000`
5. Open Swagger: `http://localhost:8000/docs`

### Demo Script

**Step 1 — Show Dashboard Welcome State**
- Open `http://localhost:3000`
- Point out the integration status badges (GitHub/Jira)
- Show the correlation flow diagram

**Step 2 — Demonstrate GitHub Webhook Correlation**
```bash
# Simulate a developer commit
curl -X POST http://localhost:8000/webhooks/github \
  -H "X-GitHub-Event: push" \
  -H "Content-Type: application/json" \
  -d '{"commits": [{"message": "DEV-101 Implement user authentication", "id": "abc123", "author": {"name": "Jane Dev"}}], "repository": {"full_name": "company/backend"}}'
```
- Show `linked-activity` panel update in the dashboard
- Navigate to `GET /linked-activity` in Swagger

**Step 3 — Generate AI Battle Plan**
- Click "Generate Battle Plan" in the dashboard
- Show tasks sorted by AI priority (P0 → P1 → P2)
- Demonstrate "Start Now" to move issue to In Progress

**Step 4 — GitHub Intelligence Dashboard**
- Navigate to `http://localhost:3000/github`
- Show the repository list on the left
- Click a repository — commits and PRs load instantly
- Click **[Analyze]** on a commit
- Watch AI explain the change in plain English:
  - What changed, why it changed, impact, risk level
  - Linked Jira ticket shown automatically if detected
- Demonstrate live activity feed updating in real time

**Step 5 — Show Correlation Engine**
```bash
curl -X POST http://localhost:8000/api/correlate
```
- Show the response: `{"events_processed": N, "links_created": N}`

**Step 5 — Analytics**
- Navigate to `GET /api/v1/dashboard/priorities` in Swagger
- Show `GET /api/v1/analytics/velocity`

---

## 20. Troubleshooting

### Backend won't start

```bash
# Check for import errors
cd backend
python -c "from app.main import app; print('OK')"

# Check database connection
curl http://localhost:8000/health
```

**Common issue:** `DATABASE_URL` wrong format.  
Correct format: `postgresql://user:password@host:port/dbname`

### PostgreSQL connection refused

```bash
# Check PostgreSQL is running
docker ps | grep postgres

# For Docker, use service name (not localhost)
DATABASE_URL=postgresql://devpulse:devpulse_secret@postgres:5432/devpulse_db

# For local dev, use localhost
DATABASE_URL=postgresql://devpulse:devpulse_secret@localhost:5434/devpulse_db
```

### GitHub webhooks not arriving

1. Check ngrok is running: `ngrok http 8000`
2. Verify webhook URL in GitHub App settings matches ngrok URL
3. Check backend is accessible: `curl https://<ngrok-url>/health`
4. Check GitHub webhook delivery logs in: Repository → Settings → Webhooks → Recent Deliveries

### Jira API 401 Unauthorized

1. Verify `JIRA_EMAIL` is your Atlassian account email
2. Verify `JIRA_TOKEN` is an API token (not your Atlassian password)
3. Create a new token at: https://id.atlassian.com/manage-profile/security/api-tokens
4. Verify `JIRA_DOMAIN` format: `company.atlassian.net` (no https://)

### GitHub App JWT errors

1. Ensure `GITHUB_APP_ID` matches your GitHub App
2. Ensure `.pem` file is in the `keys/` directory
3. Ensure `GITHUB_INSTALLATION_ID` is the installation (not app) ID
4. Check key path: `GITHUB_PRIVATE_KEY_PATH=keys/filename.pem`

### Frontend can't connect to backend

1. Check `frontend/.env.local` has correct API URL
2. Verify CORS — `DEBUG=true` in `.env` allows all origins
3. Check backend is running: `curl http://localhost:8000`
4. If using Docker, use `http://backend:8000` for container-to-container

### Jira tickets not being extracted from commits

The regex pattern is: `\b([A-Z][A-Z0-9_]+-\d+)\b`

Valid examples: `DEV-101`, `PROJ-42`, `BACKEND-1234`

Ensure your commit messages contain the pattern, e.g.:
```
DEV-101 Fix authentication bug
feat: DEV-101 Add rate limiting
[DEV-101] Refactor auth service
```

### Tables not created

```bash
# Restart backend to trigger create_all
docker-compose restart backend

# Or manually via Python
cd backend
python -c "
from app.config.database import Base, engine
import app.models.events
Base.metadata.create_all(bind=engine)
print('Tables created')
"
```

---

## License

MIT — Built for enterprise hackathon demonstration purposes.

---

*DevPulse Agent OS — Making engineering workflows intelligent.*
