# Telegram Bot Service Monitor Setup Guide

## Overview
The service monitor automatically starts the Telegram bot and performs health checks every 15 minutes. If the bot crashes or becomes unresponsive, it automatically restarts.

**Features:**
- ✅ Auto-starts bot on system startup
- ✅ Health checks every 15 minutes
- ✅ Automatic restart if bot fails
- ✅ Comprehensive logging
- ✅ Graceful shutdown handling

---

## Installation & Setup

### Option 1: Windows Task Scheduler (Recommended - Runs at System Startup)

**Step 1:** Open PowerShell as Administrator
```powershell
# Right-click PowerShell → Run as Administrator
```

**Step 2:** Navigate to bot directory and run setup script
```powershell
cd C:\Apps\telegram-bot-freshdesk
PowerShell -ExecutionPolicy Bypass -File setup-service.ps1 -Install
```

**Step 3:** Verify installation
```powershell
Get-ScheduledTask -TaskName TelegramBotServiceMonitor | Get-ScheduledTaskInfo
```

Expected output shows task is ready to run at system startup.

**Step 4:** Restart your system
The bot will automatically start with the Windows service monitor.

**To remove the auto-start task:**
```powershell
PowerShell -ExecutionPolicy Bypass -File setup-service.ps1 -Remove
```

---

### Option 2: Manual Start

Start the service monitor manually anytime with:

```bash
npm run monitor
```

Or:

```bash
node service-monitor.js
```

---

## Health Check Behavior

The service monitor performs the following checks every 15 minutes:

1. **Health Check:** Requests `/webhook/health` endpoint on `http://localhost:3001`
2. **Response Validation:** Expects HTTP 200 with `{"status":"healthy"}`
3. **Recovery:** If health check fails:
   - Stops the current bot process
   - Waits 2 seconds
   - Restarts the bot automatically
   - Performs another health check to verify recovery

**Log Output Example:**
```
✅ Health check #1: HEALTHY (4/8/2026, 9:40:00 AM)
✅ Health check #2: HEALTHY (4/8/2026, 9:55:00 AM)
❌ Health check #3 FAILED: connect ECONNREFUSED
🔄 Health check failed - restarting bot...
✅ Bot recovered after restart
```

---

## Monitoring Logs

**Service Monitor Logs:**
- Location: `C:\Apps\telegram-bot-freshdesk\logs\service-monitor.log`
- Log entries include:
  - Service startup details
  - Health check results
  - Restart events
  - Process IDs
  - Error messages

**To view logs in real-time:**
```powershell
Get-Content -Path "C:\Apps\telegram-bot-freshdesk\logs\service-monitor.log" -Wait
```

---

## Troubleshooting

**Problem:** Task is not running at startup
- **Solution:** 
  1. Verify admin privileges: `whoami /groups | findstr /C:"S-1-5-32-544"`
  2. Check Task Scheduler: `Get-ScheduledTask -TaskName TelegramBotServiceMonitor`
  3. Re-run setup: `PowerShell -ExecutionPolicy Bypass -File setup-service.ps1 -Install`

**Problem:** Health checks show failures
- **Ensure bot dependencies:** `npm install`
- **Check Freshdesk credentials:** Verify `.env` file has `FRESHDESK_API_KEY` and `FRESHDESK_DOMAIN`
- **Check port availability:** Verify port 3001 is not in use: `netstat -ano | findstr :3001`

**Problem:** Task Logger script shows errors
- **Solution:** 
  1. Open Task Scheduler
  2. Right-click `TelegramBotServiceMonitor` → Properties
  3. Go to "Actions" tab → Edit action
  4. Verify script path is correct

**To manually check bot health:**
```powershell
Invoke-WebRequest -Uri "http://localhost:3001/webhook/health"
```

---

## Manual Process Management

**Start bot directly:**
```bash
npm start
```

**Start with service monitor:**
```bash
npm run monitor
```

**Stop bot process:**
```powershell
Get-Process node | Stop-Process -Force
```

**List all Node processes:**
```powershell
Get-Process node
```

---

## Configuration

The service monitor uses these constants (edit in `service-monitor.js` if needed):

```javascript
HEALTH_CHECK_INTERVAL = 15 * 60 * 1000  // 15 minutes
HEALTH_CHECK_TIMEOUT = 5000             // 5 seconds timeout
HEALTH_CHECK_URL = 'http://localhost:3001/webhook/health'
```

---

## Next Steps

1. **Run setup:** `PowerShell -ExecutionPolicy Bypass -File setup-service.ps1 -Install`
2. **Restart computer** or run `npm run monitor` to test
3. **Monitor logs** to verify health checks are working: `Get-Content "logs/service-monitor.log" -Wait`
4. **Simulate failure** (optional): Stop bot manually and watch it auto-restart

---

## Health Check Statistics

The service monitor tracks:
- **Health Check Count:** Total checks performed since startup
- **Restart Count:** Number of auto-restarts triggered
- **Last Status:** Latest health check status and timestamp
- **Check Duration:** Response time for health checks

View current stats in log files or by checking the service monitor console output.
