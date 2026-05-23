#!/usr/bin/env bash
# ==============================================================================
# DevPulse Agent OS — Quick Start Script
# Usage: bash scripts/start.sh
# ==============================================================================

set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║        DevPulse Agent OS — Quick Start           ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

# ── Check .env ────────────────────────────────────────────────────────────────
if [ ! -f ".env" ]; then
  echo "⚠  .env not found. Copying from .env.example..."
  cp .env.example .env
  echo "✓  .env created. Edit it with your credentials before proceeding."
  echo ""
fi

# ── Docker Compose ────────────────────────────────────────────────────────────
echo "🐳 Starting services via Docker Compose..."
docker-compose up -d --build

echo ""
echo "✓  Services started!"
echo ""
echo "  Backend API:    http://localhost:8000"
echo "  API Docs:       http://localhost:8000/docs"
echo "  Frontend:       http://localhost:3000"
echo "  PostgreSQL:     localhost:5434"
echo ""
echo "📋 To set up ngrok for GitHub webhooks:"
echo "  ngrok http 8000"
echo "  Then configure your GitHub App webhook URL to:"
echo "  https://<your-ngrok-url>/webhooks/github"
echo ""
