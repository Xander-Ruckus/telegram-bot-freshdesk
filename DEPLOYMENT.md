# Deployment Guide - Physical Server (169.1.17.113)

This guide covers deploying the Telegram Bot to your physical server at IP **169.1.17.113**.

## Quick Start

### Linux Server (Recommended)

```bash
# 1. SSH into your server
ssh root@169.1.17.113

# 2. Clone or copy the project
cd /tmp
git clone <your-repo> telegram-bot-freshdesk
# OR copy files using rsync/scp

# 3. Run deployment script
cd telegram-bot-freshdesk
chmod +x deploy-server.sh
sudo ./deploy-server.sh

# 4. Configure environment
sudo nano /opt/telegram-bot-freshdesk/.env

# 5. Start the bot
sudo systemctl start telegram-bot
sudo systemctl status telegram-bot
```

### Windows Server

```powershell
# 1. Run PowerShell as Administrator

# 2. Execute deployment script
.\deploy-windows.ps1 -ServerIP "169.1.17.113" -RemoteUser "Administrator"

# 3. Configure .env on remote server
# Edit: C:\Apps\telegram-bot-freshdesk\.env

# 4. Run the bot
# Option A: Double-click run-bot.bat
# Option B: Command line: npm start
```

---

## Deployment Scripts Overview

### 1. `deploy-server.sh` (Linux/Ubuntu)

**Features:**
- Automatic Node.js installation
- Creates application user and directories
- Installs dependencies
- Sets up systemd service for auto-restart
- Configures logging

**What it does:**
1. Installs Node.js 18.x
2. Creates user `telegram-bot`
3. Creates `/opt/telegram-bot-freshdesk` directory
4. Copies project files
5. Installs npm packages
6. Creates systemd service
7. Sets up automatic startup on reboot

**Usage:**
```bash
sudo ./deploy-server.sh
```

**Post-deployment:**
```bash
# Configure environment variables
sudo nano /opt/telegram-bot-freshdesk/.env

# Start the service
sudo systemctl start telegram-bot

# Check status
sudo systemctl status telegram-bot

# View logs
tail -f /var/log/telegram-bot-freshdesk/bot.log
```

---

### 2. `deploy-windows.ps1` (Windows Server)

**Features:**
- Remote PowerShell deployment
- Copies files to remote server
- Installs dependencies remotely
- Creates batch runner script
- Optional Task Scheduler integration

**What it does:**
1. Validates Node.js and npm
2. Connects to remote server via PowerShell Remoting
3. Creates application directory
4. Copies project files
5. Installs npm packages
6. Creates `.env` file
7. Optionally creates Task Scheduler job

**Usage:**
```powershell
.\deploy-windows.ps1 -ServerIP "169.1.17.113" -RemoteUser "Administrator"
```

**Post-deployment:**
```powershell
# To run the bot:
# Option 1: Double-click C:\Apps\telegram-bot-freshdesk\run-bot.bat
# Option 2: Open Command Prompt and run:
cd C:\Apps\telegram-bot-freshdesk
npm start
```

---

### 3. `telegram-bot.service` (Systemd Service Unit)

Linux systemd service file. Automatically created by `deploy-server.sh`, but can also be used manually:

```bash
sudo cp telegram-bot.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable telegram-bot
sudo systemctl start telegram-bot
```

---

## Configuration

### Environment Variables

Create `.env` file with these required variables:

```env
# Telegram Bot Token (already provided)
TELEGRAM_BOT_TOKEN=8498347303:AAF0ApLxQQYvypzel_sCLRHVWNVe309BKKY
TELEGRAM_BOT_USERNAME=Fresh_Note_Bot

# Freshdesk API Credentials
FRESHDESK_API_KEY=your_api_key_here
FRESHDESK_DOMAIN=yourcompany.freshdesk.com

# Server Configuration
WEBHOOK_PORT=3000
WEBHOOK_URL=http://169.1.17.113:3000/webhook
NODE_ENV=production
```

### Update Freshdesk Webhook

After deployment, configure Freshdesk to send webhook events to your server:

1. Log into Freshdesk Admin Panel
2. Go to **Automation & Visibility** → **Webhooks**
3. Create new webhook:
   - **Title**: "Telegram Bot Notifications"
   - **URL**: `http://169.1.17.113:3000/webhook/freshdesk`
   - **Method**: POST
   - **Authentication**: None (adjust if needed)
4. Select events:
   - ✅ Ticket Created
   - ✅ Ticket Updated
   - ✅ Ticket Closed
   - ✅ Conversation Created
5. Click **Create**

---

## Service Management

### Linux (Systemd)

```bash
# Start the bot
sudo systemctl start telegram-bot

# Stop the bot
sudo systemctl stop telegram-bot

# Restart the bot
sudo systemctl restart telegram-bot

# Check status
sudo systemctl status telegram-bot

# Enable auto-start on reboot
sudo systemctl enable telegram-bot

# Disable auto-start
sudo systemctl disable telegram-bot

# View logs
journalctl -u telegram-bot -f

# View detailed logs
tail -f /var/log/telegram-bot-freshdesk/bot.log
```

### Windows (Task Scheduler)

```powershell
# Start task
Start-ScheduledTask -TaskName "TelegramBotFreshdesk" -TaskPath "\Telegram Bot\"

# Stop task (not directly supported, but you can disable it)
Disable-ScheduledTask -TaskName "TelegramBotFreshdesk" -TaskPath "\Telegram Bot\"

# View task status
Get-ScheduledTask -TaskName "TelegramBotFreshdesk" -TaskPath "\Telegram Bot\"
```

Or manually via Task Scheduler GUI:
- Open Task Scheduler
- Navigate to `Telegram Bot` folder
- Select `TelegramBotFreshdesk`
- Click Run, Stop, Disable, etc.

---

## Monitoring and Troubleshooting

### Check if Bot is Running

**Linux:**
```bash
ps aux | grep "node.*bot.js"
sudo systemctl status telegram-bot
```

**Windows:**
```powershell
Get-Process | Where-Object {$_.ProcessName -like "*node*"}
```

### View Logs

**Linux:**
```bash
# Last 50 lines
tail -50 /var/log/telegram-bot-freshdesk/bot.log

# Continuous monitoring
tail -f /var/log/telegram-bot-freshdesk/bot.log

# Errors only
tail -f /var/log/telegram-bot-freshdesk/error.log
```

**Windows:**
Check `C:\Apps\telegram-bot-freshdesk\` for any .log files created by the application.

### Test Webhook Connection

```bash
# From your local machine
curl -X POST http://169.1.17.113:3000/webhook/freshdesk \
  -H "Content-Type: application/json" \
  -d '{"test": "webhook"}'

# Should return 200 OK
```

### Common Issues

| Issue | Solution |
|-------|----------|
| Bot won't start | Check `.env` file, ensure all required variables are set |
| Webhook not working | Verify firewall allows port 3000, check WEBHOOK_URL in `.env` |
| Application crashes | Check logs, ensure Node.js version ≥ 16.x |
| Service won't restart | Check systemd status: `journalctl -u telegram-bot -n 50` |
| Files not copied | Verify SSH keys/credentials, check disk space on server |

---

## Database Persistence (Optional)

Currently, user settings are stored in memory (lost on restart). For production, add a database:

### MongoDB Example

```bash
# Install MongoDB
sudo apt-get install -y mongodb

# Update config.js to use MongoDB
# Install mongoose: npm install mongoose
```

### PostgreSQL Example

```bash
# Install PostgreSQL
sudo apt-get install -y postgresql postgresql-contrib

# Install node-postgres: npm install pg
```

See [DATABASE_SETUP.md](DATABASE_SETUP.md) for detailed instructions.

---

## Firewall Configuration

Ensure your firewall allows inbound traffic on port 3000:

**Ubuntu (UFW):**
```bash
sudo ufw allow 3000/tcp
sudo ufw status
```

**Iptables:**
```bash
sudo iptables -A INPUT -p tcp --dport 3000 -j ACCEPT
sudo iptables-save > /etc/iptables/rules.v4
```

---

## Backup Strategy

Regular backups of critical files:

```bash
# Backup configuration
tar -czf telegram-bot-backup-$(date +%Y%m%d).tar.gz /opt/telegram-bot-freshdesk/.env

# Backup logs
tar -czf telegram-bot-logs-$(date +%Y%m%d).tar.gz /var/log/telegram-bot-freshdesk/
```

---

## Rollback Plan

If deployment fails:

**Linux:**
```bash
# Stop the service
sudo systemctl stop telegram-bot

# Restore from backup
cp telegram-bot-backup-20260217.tar.gz /opt/
tar -xzf /opt/telegram-bot-backup-20260217.tar.gz -C /

# Restart
sudo systemctl start telegram-bot
```

**Windows:**
```powershell
# Stop the task
Stop-ScheduledTask -TaskName "TelegramBotFreshdesk"

# Restore from backup
# Manually copy backed-up files back

# Restart
Start-ScheduledTask -TaskName "TelegramBotFreshdesk"
```

---

## Support & Documentation

- **Telegraf Documentation**: https://telegraf.js.org/
- **Freshdesk API Docs**: https://developers.freshdesk.com/api/
- **Systemd Documentation**: https://systemd.io/
- **Node.js Documentation**: https://nodejs.org/docs/

---

## Checklist

Before going live, verify:

- [ ] Node.js v16+ installed on server
- [ ] `.env` file configured with correct credentials
- [ ] Firewall allows port 3000 (or configured port)
- [ ] Freshdesk webhook URL points to `http://169.1.17.113:3000/webhook/freshdesk`
- [ ] Bot service starts and stays running
- [ ] Logs show no errors
- [ ] Test webhook received in Freshdesk
- [ ] Telegram bot responds to `/start` command
- [ ] Auto-restart configured (systemd or Task Scheduler)
- [ ] Backup strategy in place

---

**Last Updated:** February 17, 2026
