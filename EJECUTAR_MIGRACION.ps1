$ErrorActionPreference = 'Stop'
Write-Host 'EI ERP - Migración Firebase a Supabase' -ForegroundColor Cyan
if (-not (Test-Path '.env')) {
  Copy-Item '.env.example' '.env'
  Write-Host 'Se creó .env. Complételo antes de continuar.' -ForegroundColor Yellow
  notepad .env
  exit 1
}
if (-not (Test-Path 'secrets/firebase-service-account.json')) {
  Write-Host 'Falta secrets/firebase-service-account.json' -ForegroundColor Red
  exit 1
}
Write-Host 'Instalando dependencias...' -ForegroundColor Cyan
npm install
Write-Host 'Ejecutando migración idempotente...' -ForegroundColor Cyan
npm run migrate
