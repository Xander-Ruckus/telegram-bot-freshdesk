# PowerShell script to setup Windows Task Scheduler for auto-starting the service monitor
# Run as Administrator

param(
    [switch]$Install,
    [switch]$Remove
)

$TaskName = "TelegramBotServiceMonitor"
$TaskDescription = "Automatic Telegram Bot Service Monitor with health checks every 15 minutes"
$ScriptPath = "C:\Apps\telegram-bot-freshdesk\start-service-monitor.bat"
$LogPath = "C:\Apps\telegram-bot-freshdesk\logs\service-monitor.log"

function Test-Admin {
    $currentUser = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($currentUser)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Install-Task {
    Write-Host "Installing Windows Task Scheduler task..." -ForegroundColor Green
    
    # Check if admin
    if (-not (Test-Admin)) {
        Write-Host "ERROR: This script must be run as Administrator!" -ForegroundColor Red
        exit 1
    }
    
    # Check if script exists
    if (-not (Test-Path $ScriptPath)) {
        Write-Host "ERROR: Start script not found at $ScriptPath" -ForegroundColor Red
        exit 1
    }
    
    # Create log directory if it doesn't exist
    $LogDir = Split-Path -Parent $LogPath
    if (-not (Test-Path $LogDir)) {
        New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
        Write-Host "Created log directory: $LogDir" -ForegroundColor Yellow
    }
    
    # Remove task if it already exists
    $existingTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if ($existingTask) {
        Write-Host "Removing existing task..." -ForegroundColor Yellow
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    }
    
    # Create new task action
    $action = New-ScheduledTaskAction `
        -Execute "cmd.exe" `
        -Argument "/c `"$ScriptPath >> `"$LogPath`" 2>&1`""
    
    # Create new task trigger - at system startup
    $trigger = New-ScheduledTaskTrigger -AtStartup
    
    # Create task principal (run with highest privileges)
    $principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
    
    # Create task settings
    $settings = New-ScheduledTaskSettingsSet `
        -AllowStartIfOnBatteries `
        -DontStopIfGoingOnBatteries `
        -StartWhenAvailable `
        -RunOnlyIfNetworkAvailable `
        -MultipleInstances IgnoreNew
    
    # Register the task
    try {
        Register-ScheduledTask `
            -TaskName $TaskName `
            -Action $action `
            -Trigger $trigger `
            -Principal $principal `
            -Settings $settings `
            -Description $TaskDescription `
            -Force | Out-Null
        
        Write-Host "✅ Task installed successfully!" -ForegroundColor Green
        Write-Host "Task Name: $TaskName" -ForegroundColor Cyan
        Write-Host "Trigger: At system startup" -ForegroundColor Cyan
        Write-Host "Log File: $LogPath" -ForegroundColor Cyan
        Write-Host "`nTask Details:" -ForegroundColor Green
        Get-ScheduledTask -TaskName $TaskName | Get-ScheduledTaskInfo
    }
    catch {
        Write-Host "ERROR: Failed to install task: $_" -ForegroundColor Red
        exit 1
    }
}

function Remove-Task {
    if (-not (Test-Admin)) {
        Write-Host "ERROR: This script must be run as Administrator!" -ForegroundColor Red
        exit 1
    }
    
    $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if ($task) {
        Write-Host "Removing scheduled task: $TaskName" -ForegroundColor Yellow
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
        Write-Host "✅ Task removed successfully!" -ForegroundColor Green
    }
    else {
        Write-Host "Task not found: $TaskName" -ForegroundColor Yellow
    }
}

# Main execution
if ($Install) {
    Install-Task
}
elseif ($Remove) {
    Remove-Task
}
else {
    Write-Host "Windows Task Scheduler Setup for Telegram Bot Service Monitor" -ForegroundColor Cyan
    Write-Host "==========================================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Usage:" -ForegroundColor Yellow
    Write-Host "  PowerShell -ExecutionPolicy Bypass -File setup-service.ps1 -Install" -ForegroundColor White
    Write-Host "    (Install auto-start task - requires Administrator)" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  PowerShell -ExecutionPolicy Bypass -File setup-service.ps1 -Remove" -ForegroundColor White
    Write-Host "    (Remove auto-start task - requires Administrator)" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Examples:" -ForegroundColor Yellow
    Write-Host "  Setup auto-start:" -ForegroundColor Cyan
    Write-Host "    cd C:\Apps\telegram-bot-freshdesk" -ForegroundColor White
    Write-Host "    PowerShell -ExecutionPolicy Bypass -File setup-service.ps1 -Install" -ForegroundColor White
    Write-Host ""
    Write-Host "  Verify installation:" -ForegroundColor Cyan
    Write-Host "    Get-ScheduledTask -TaskName TelegramBotServiceMonitor" -ForegroundColor White
    Write-Host ""
    Write-Host "  Remove auto-start:" -ForegroundColor Cyan
    Write-Host "    PowerShell -ExecutionPolicy Bypass -File setup-service.ps1 -Remove" -ForegroundColor White
}
