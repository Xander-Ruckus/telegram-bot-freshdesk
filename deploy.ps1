# Deployment script for Windows PowerShell

Write-Host "🚀 Starting deployment..." -ForegroundColor Green

# Check Node.js
try {
    $nodeVersion = node --version
    Write-Host "✅ Node.js version: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Node.js is not installed" -ForegroundColor Red
    exit 1
}

# Check npm
try {
    $npmVersion = npm --version
    Write-Host "✅ npm version: $npmVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ npm is not installed" -ForegroundColor Red
    exit 1
}

# Install dependencies
Write-Host "📦 Installing dependencies..." -ForegroundColor Yellow
npm install

# Check environment variables
Write-Host "🔍 Checking environment variables..." -ForegroundColor Yellow
if (-not (Test-Path ".env")) {
    Write-Host "❌ .env file not found!" -ForegroundColor Red
    Write-Host "Please create .env from .env.example and fill in your credentials" -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "✅ Deployment ready!" -ForegroundColor Green
Write-Host ""
Write-Host "To start the bot, run:" -ForegroundColor Cyan
Write-Host "  npm start     (production)" -ForegroundColor White
Write-Host "  npm run dev   (development)" -ForegroundColor White
Write-Host ""
