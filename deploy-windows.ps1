# ============================================================
# Telegram Bot - Windows Server Deployment Script
# Target: 169.1.17.113
# ============================================================

param(
    [string]$ServerIP = "169.1.17.113",
    [string]$RemoteUser = "Administrator",
    [string]$RemotePath = "C:\Apps\telegram-bot-freshdesk"
)

$ErrorActionPreference = "Stop"

function Write-Header {
    param([string]$Message)
    Write-Host ""
    Write-Host "===========================================" -ForegroundColor Blue
    Write-Host $Message -ForegroundColor Blue
    Write-Host "===========================================" -ForegroundColor Blue
}

function Write-Success {
    param([string]$Message)
    Write-Host "✅ $Message" -ForegroundColor Green
}

function Write-Warning {
    param([string]$Message)
    Write-Host "⚠️  $Message" -ForegroundColor Yellow
}

function Write-Error {
    param([string]$Message)
    Write-Host "❌ $Message" -ForegroundColor Red
}

Write-Header "Telegram Bot - Windows Server Deployment"

# ============================================================
# 1. Check Prerequisites
# ============================================================

Write-Header "[1/6] Checking Prerequisites"

# Check if running as Administrator
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Error "This script must be run as Administrator"
    exit 1
}

Write-Success "Running as Administrator"

# Check Node.js
try {
    $nodeVersion = node --version
    Write-Success "Node.js installed: $nodeVersion"
} catch {
    Write-Error "Node.js not found. Please install Node.js from https://nodejs.org/"
    exit 1
}

# Check npm
try {
    $npmVersion = npm --version
    Write-Success "npm installed: $npmVersion"
} catch {
    Write-Error "npm not found. Please ensure Node.js is properly installed"
    exit 1
}

# ============================================================
# 2. Validate Local Project
# ============================================================

Write-Header "[2/6] Validating Project"

if (-not (Test-Path "package.json")) {
    Write-Error "package.json not found. Run this script from the project directory"
    exit 1
}

Write-Success "Project files found"

# ============================================================
# 3. Create Remote Directory
# ============================================================

Write-Header "[3/6] Setting Up Remote Directory"

Write-Host "Creating remote directory: $RemotePath"

$session = New-PSSession -ComputerName $ServerIP -Credential (Get-Credential -UserName $RemoteUser -Message "Enter password for $RemoteUser@$ServerIP")

if (-not $session) {
    Write-Error "Failed to connect to server"
    exit 1
}

Write-Success "Connected to $ServerIP"

Invoke-Command -Session $session -ScriptBlock {
    param($path)
    if (-not (Test-Path $path)) {
        New-Item -ItemType Directory -Path $path -Force | Out-Null
        Write-Host "Created directory: $path"
    } else {
        Write-Host "Directory already exists: $path"
    }
} -ArgumentList $RemotePath

Write-Success "Remote directory ready"

# ============================================================
# 4. Copy Project Files
# ============================================================

Write-Header "[4/6] Copying Project Files"

$excludeItems = @("node_modules", ".git", ".env", ".gitignore", "*.log", "deploy-server.sh", "deploy.ps1")

Write-Host "Copying files to $ServerIP`:$RemotePath..."

Copy-Item -Path "." -Destination "\\$ServerIP\$($RemotePath -replace ':', '$')" -Container -Recurse -Force -Exclude $excludeItems

Write-Success "Files copied successfully"

# ============================================================
# 5. Install Dependencies on Remote Server
# ============================================================

Write-Header "[5/6] Installing Dependencies"

Invoke-Command -Session $session -ScriptBlock {
    param($appPath)
    Set-Location $appPath
    Write-Host "Installing npm packages..."
    npm install --production
} -ArgumentList $RemotePath

Write-Success "Dependencies installed"

# ============================================================
# 6. Create Environment and Setup Service
# ============================================================

Write-Header "[6/6] Configuring Environment"

# Create .env template
$envTemplate = @"
# Telegram Configuration
TELEGRAM_BOT_TOKEN=8498347303:AAF0ApLxQQYvypzel_sCLRHVWNVe309BKKY
TELEGRAM_BOT_USERNAME=Fresh_Note_Bot

# Freshdesk Configuration
FRESHDESK_API_KEY=your_api_key_here
FRESHDESK_DOMAIN=yourcompany.freshdesk.com

# Server Configuration
WEBHOOK_PORT=3000
WEBHOOK_URL=http://169.1.17.113:3000/webhook
NODE_ENV=production
"@

Invoke-Command -Session $session -ScriptBlock {
    param($appPath, $envContent)
    $envPath = Join-Path $appPath ".env"
    if (-not (Test-Path $envPath)) {
        $envContent | Out-File -FilePath $envPath -Encoding UTF8
        Write-Host "Created .env file"
    }
} -ArgumentList $RemotePath, $envTemplate

Write-Success "Environment configured"

# Create batch file to run the bot
$batchContent = @"
@echo off
cd $RemotePath
node src/bot.js
pause
"@

Invoke-Command -Session $session -ScriptBlock {
    param($appPath, $batchContent)
    $batchPath = Join-Path $appPath "run-bot.bat"
    $batchContent | Out-File -FilePath $batchPath -Encoding ASCII
} -ArgumentList $RemotePath, $batchContent

Write-Success "Created run-bot.bat"

# ============================================================
# Optional: Create Windows Task Scheduler Job
# ============================================================

Write-Host ""
Write-Host "Would you like to create a Windows Task Scheduler job to auto-start the bot? (y/n)" -ForegroundColor Cyan
$response = Read-Host

if ($response -eq 'y') {
    Invoke-Command -Session $session -ScriptBlock {
        param($appPath)
        
        $taskName = "TelegramBotFreshdesk"
        $taskPath = "\Telegram Bot\"
        $action = New-ScheduledTaskAction -Execute "node.exe" -Argument "src\bot.js" -WorkingDirectory $appPath
        $trigger = New-ScheduledTaskTrigger -AtStartup
        $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -Compatibility Win8
        
        Register-ScheduledTask -TaskName $taskName -TaskPath $taskPath -Action $action -Trigger $trigger -Settings $settings -Force
        
        Write-Host "Task Scheduler job created: $taskName"
    } -ArgumentList $RemotePath
    
    Write-Success "Task Scheduler job created"
}

# ============================================================
# Summary
# ============================================================

Write-Header "Deployment Complete!"

Write-Host ""
Write-Host "📋 Next Steps:" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Configure environment on remote server:"
Write-Host "   Edit: $RemotePath\.env" -ForegroundColor Yellow
Write-Host ""
Write-Host "2. To start the bot, run on the remote server:"
Write-Host "   Option A: Double-click $RemotePath\run-bot.bat" -ForegroundColor Yellow
Write-Host "   Option B: Run 'npm start' from $RemotePath" -ForegroundColor Yellow
Write-Host "   Option C: Use Task Scheduler (if you created the job)" -ForegroundColor Yellow
Write-Host ""
Write-Host "3. Update Freshdesk webhook URL to:" -ForegroundColor Cyan
Write-Host "   http://169.1.17.113:3000/webhook/freshdesk" -ForegroundColor Yellow
Write-Host ""
Write-Host "📁 Remote Application Path:" -ForegroundColor Cyan
Write-Host "   $RemotePath" -ForegroundColor Yellow
Write-Host ""
Write-Host "🔗 Server Information:" -ForegroundColor Cyan
Write-Host "   IP Address: $ServerIP" -ForegroundColor Yellow
Write-Host "   Access: Start → Services → Telegram Bot (Task Scheduler)" -ForegroundColor Yellow
Write-Host ""

# Cleanup
Remove-PSSession -Session $session -ErrorAction SilentlyContinue

Write-Host "✅ Session closed" -ForegroundColor Green
