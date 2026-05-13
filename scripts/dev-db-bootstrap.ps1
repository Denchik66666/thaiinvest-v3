# Raises local Postgres via docker-compose.dev-db.yml when Docker is available.
# Docker install from winget requires UAC - run: npm run db:dev:install-docker

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Test-DockerCompose {
  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    return $false
  }
  docker compose version 1>$null 2>$null
  return $LASTEXITCODE -eq 0
}

if (Test-DockerCompose) {
  Write-Host "[ok] Docker found - starting Postgres container (host port 15432 -> 5432)..." -ForegroundColor Green
  docker compose -f docker-compose.dev-db.yml up -d
  if ($LASTEXITCODE -ne 0) {
    Write-Host "[!] docker compose failed. Start Docker Desktop and retry." -ForegroundColor Yellow
    exit $LASTEXITCODE
  }
  Write-Host ""
  Write-Host "Done. Copy DATABASE_URL from .env.local.example into .env.local, then:" -ForegroundColor Cyan
  Write-Host "  npm run db:migrate:dev" -ForegroundColor Cyan
  Write-Host "  npm run db:seed" -ForegroundColor Cyan
  exit 0
}

Write-Host "[!] Docker not available (not installed or Docker Desktop not running)." -ForegroundColor Yellow
Write-Host ""
Write-Host "Install Docker Desktop once and approve UAC (Yes):" -ForegroundColor White
Write-Host "  npm run db:dev:install-docker" -ForegroundColor Cyan
Write-Host ""
Write-Host "After install: open Docker Desktop, wait for Engine running, then:" -ForegroundColor White
Write-Host "  npm run db:dev:bootstrap" -ForegroundColor Cyan
Write-Host ""
Write-Host "Without Docker: keep DATABASE_URL in `.env` (e.g. Supabase) — no local DB setup needed." -ForegroundColor DarkGray
exit 1
