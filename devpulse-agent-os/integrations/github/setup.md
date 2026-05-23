# GitHub App Integration Guide

## Overview

DevPulse Agent OS uses a **GitHub App** (not a personal token) for:
1. Receiving webhook events from GitHub repositories
2. Making authenticated GitHub API calls to fetch PR/commit data
3. Verifying webhook signatures for security

---

## Step-by-Step Setup

### 1. Create the GitHub App

Visit: https://github.com/settings/apps/new

Configure:
```
Name: DevPulse Agent OS
Homepage URL: http://localhost:3000
Webhook URL: https://<your-ngrok-url>/webhooks/github
Webhook Secret: <generate with: openssl rand -hex 32>
```

**Permissions (Repository):**
- Contents: Read
- Metadata: Read
- Pull requests: Read

**Subscribe to Events:**
- Push ✅
- Pull request ✅

### 2. Generate Private Key

After creation → Scroll to **Private keys** → Click **Generate a private key**

Place it in the `keys/` directory of this project.

### 3. Install the App

Click **Install App** → Select your org → Select repositories

Copy the **Installation ID** from the URL:
```
https://github.com/settings/installations/XXXXXXXX
                                          ^^^^^^^^ ← This number
```

### 4. Configure Environment

```bash
GITHUB_APP_ID=your_app_id
GITHUB_INSTALLATION_ID=your_installation_id
GITHUB_PRIVATE_KEY_PATH=keys/devpulse-agent-os.private-key.pem
GITHUB_WEBHOOK_SECRET=your_webhook_secret
```

---

## Authentication Flow

```
DevPulse Backend
    ↓ Load private key from keys/*.pem
    ↓ Generate short-lived JWT (RS256, 9 min)
    ↓ POST /app/installations/{id}/access_tokens
    ↓ Receive installation token (valid 1 hour)
    ↓ Use token for GitHub API calls
```

## Webhook Flow

```
Developer pushes commit "DEV-101 Fix auth bug"
    ↓ GitHub sends POST to /webhooks/github
    ↓ DevPulse extracts ticket: DEV-101
    ↓ Stores in github_events table
    ↓ Auto-creates linked_activity record
    ↓ Available in /linked-activity endpoint
    ↓ Displayed in dashboard correlation panel
```

## Jira Ticket Extraction

Pattern: `\b([A-Z][A-Z0-9_]+-\d+)\b`

Checked in order:
1. Commit messages (push events)
2. PR title (pull_request events)
3. Branch name/ref

Examples that match:
- `DEV-101 Fix login bug`
- `feat/DEV-101-auth-service`
- `[DEV-101] Implement middleware`
