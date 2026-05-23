# ==============================================================================
# DevPulse Agent OS — PowerShell Quick Start
# Usage: .\scripts\start.ps1
# ==============================================================================

$RootDir = Split-Path -Parent $PSScriptRoot
Set-Location $RootDir

Write-Host ""
Write-Host "╔══════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║        DevPulse Agent OS — Quick Start           ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Check .env
if (-not (Test-Path ".env")) {
    Write-Host "⚠  .env not found. Copying from .env.example..." -ForegroundColor Yellow
    Copy-Item ".env.example" ".env"
    Write-Host "✓  .env created. Edit it with your credentials." -ForegroundColor Green
    Write-Host ""
}

# Start Docker Compose
Write-Host "🐳 Starting services via Docker Compose..." -ForegroundColor Blue
docker-compose up -d --build

Write-Host ""
Write-Host "✓  Services started!" -ForegroundColor Green
Write-Host ""
Write-Host "  Backend API:    http://localhost:8000" -ForegroundColor White
Write-Host "  API Docs:       http://localhost:8000/docs" -ForegroundColor White
Write-Host "  Frontend:       http://localhost:3000" -ForegroundColor White
Write-Host "  PostgreSQL:     localhost:5434" -ForegroundColor White
Write-Host ""
Write-Host "📋 For local development without Docker:" -ForegroundColor Yellow
Write-Host "  cd backend && pip install -r requirements.txt && uvicorn app.main:app --reload" -ForegroundColor Gray
Write-Host "  cd frontend && npm install && npm run dev" -ForegroundColor Gray
Write-Host ""
