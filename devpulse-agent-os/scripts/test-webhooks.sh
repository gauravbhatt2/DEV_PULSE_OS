#!/usr/bin/env bash
# ==============================================================================
# DevPulse Agent OS — Test Webhook Simulator
# Sends test payloads to local webhook endpoints.
# Usage: bash scripts/test-webhooks.sh
# ==============================================================================

BASE_URL="${1:-http://localhost:8000}"

echo ""
echo "🔥 DevPulse Webhook Test Suite"
echo "Target: $BASE_URL"
echo ""

# ── Test 1: GitHub push with Jira ticket in commit message ────────────────────
echo "1. GitHub Push Event (with DEV-101 ticket reference)..."
curl -s -X POST "$BASE_URL/webhooks/github" \
  -H "Content-Type: application/json" \
  -H "X-GitHub-Event: push" \
  -d '{
    "ref": "refs/heads/feature/DEV-101-auth-middleware",
    "commits": [
      {
        "id": "abc123",
        "message": "DEV-101 Added authentication middleware for API endpoints",
        "author": {"name": "Jane Dev", "email": "jane@company.com"}
      }
    ],
    "repository": {"full_name": "company/backend-api"}
  }' | python3 -m json.tool 2>/dev/null || echo "Response received"

echo ""

# ── Test 2: GitHub PR with Jira ticket in title ───────────────────────────────
echo "2. GitHub Pull Request Event (with DEV-102 in PR title)..."
curl -s -X POST "$BASE_URL/webhooks/github" \
  -H "Content-Type: application/json" \
  -H "X-GitHub-Event: pull_request" \
  -d '{
    "action": "opened",
    "pull_request": {
      "number": 42,
      "title": "DEV-102 Add rate limiting to public endpoints",
      "head": {"ref": "feature/DEV-102-rate-limiting"},
      "state": "open"
    },
    "repository": {"full_name": "company/backend-api"}
  }' | python3 -m json.tool 2>/dev/null || echo "Response received"

echo ""

# ── Test 3: Jira webhook ──────────────────────────────────────────────────────
echo "3. Jira Issue Updated Event..."
curl -s -X POST "$BASE_URL/webhooks/jira" \
  -H "Content-Type: application/json" \
  -d '{
    "webhookEvent": "jira:issue_updated",
    "issue": {
      "key": "DEV-101",
      "fields": {
        "summary": "Authentication middleware implementation",
        "status": {"name": "In Progress"},
        "priority": {"name": "High"}
      }
    }
  }' | python3 -m json.tool 2>/dev/null || echo "Response received"

echo ""

# ── Test 4: CI/CD Pipeline event ──────────────────────────────────────────────
echo "4. CI/CD Pipeline Success Event..."
curl -s -X POST "$BASE_URL/webhooks/cicd" \
  -H "Content-Type: application/json" \
  -d '{
    "repository": "company/backend-api",
    "run_id": "gh-run-12345",
    "status": "success",
    "duration_seconds": 142,
    "commit_sha": "abc123def456789"
  }' | python3 -m json.tool 2>/dev/null || echo "Response received"

echo ""

# ── Test 5: Trigger correlation pass ─────────────────────────────────────────
echo "5. Trigger Correlation Engine..."
curl -s -X POST "$BASE_URL/api/correlate" \
  -H "Content-Type: application/json" | python3 -m json.tool 2>/dev/null || echo "Response received"

echo ""

# ── Test 6: Check linked activity ─────────────────────────────────────────────
echo "6. Fetch Linked Activity (GitHub ↔ Jira)..."
curl -s "$BASE_URL/linked-activity?limit=5" | python3 -m json.tool 2>/dev/null || echo "Response received"

echo ""

# ── Test 7: Event counts ──────────────────────────────────────────────────────
echo "7. Event Pipeline Counts..."
curl -s "$BASE_URL/events" | python3 -m json.tool 2>/dev/null || echo "Response received"

echo ""
echo "✓ Webhook test suite complete!"
echo "Visit $BASE_URL/docs to explore the full API."
echo ""
