# Server Deployment Checklist

Complete this checklist when deploying to **169.1.17.113**.

## Pre-Deployment ✅

### Server Access & Connectivity
- [ ] SSH access to server verified (Linux) or RDP/WinRM (Windows)
- [ ] Server IP confirmed: `169.1.17.113`
- [ ] Internet connectivity available on server
- [ ] Firewall admin access available

### Credentials & Keys
- [ ] Telegram Bot Token obtained: `8498347303:AAF0ApLxQQYvypzel_sCLRHVWNVe309BKKY`
- [ ] Freshdesk API Key retrieved
- [ ] Freshdesk Domain name confirmed (e.g., `company.freshdesk.com`)
- [ ] Server admin credentials available

### Project Files
- [ ] All source files ready: `src/`, `package.json`, etc.
- [ ] `.env.example` available for reference
- [ ] Deployment scripts downloaded/ready:
  - [ ] `deploy-server.sh` (Linux)
  - [ ] `deploy-windows.ps1` (Windows)
  - [ ] `quick-commands.sh` (for reference)

---

## Deployment Phase ✅

### Linux Server Deployment

- [ ] **SSH into server**
  ```bash
  ssh root@169.1.17.113
  ```

- [ ] **Copy project to server** (choose one):
  ```bash
  # Option 1: Via Git
  git clone <repository-url> /tmp/telegram-bot-freshdesk
  
  # Option 2: Via SCP
  scp -r telegram-bot-freshdesk/ root@169.1.17.113:/tmp/
  
  # Option 3: Via rsync
  rsync -av telegram-bot-freshdesk/ root@169.1.17.113:/tmp/telegram-bot-freshdesk/
  ```

- [ ] **Navigate to project**
  ```bash
  cd /tmp/telegram-bot-freshdesk
  ```

- [ ] **Make deployment script executable**
  ```bash
  chmod +x deploy-server.sh
  ```

- [ ] **Run deployment script**
  ```bash
  sudo ./deploy-server.sh
  ```
  ✅ Script will:
  - Install Node.js 18.x
  - Create `telegram-bot` user
  - Setup directories
  - Install dependencies
  - Create systemd service
  - Setup logging

- [ ] **Configure environment variables**
  ```bash
  sudo nano /opt/telegram-bot-freshdesk/.env
  ```
  Update with:
  - `FRESHDESK_API_KEY=your_key`
  - `FRESHDESK_DOMAIN=yourcompany.freshdesk.com`

- [ ] **Start the service**
  ```bash
  sudo systemctl start telegram-bot
  ```

- [ ] **Verify service is running**
  ```bash
  sudo systemctl status telegram-bot
  ```
  Expected output: `● telegram-bot.service - Telegram Freshdesk Bot Service`
  Status: `active (running)`

---

### Windows Server Deployment

- [ ] **Open PowerShell as Administrator**

- [ ] **Copy project to local machine** if not already there

- [ ] **Navigate to project directory**
  ```powershell
  cd C:\Path\To\telegram-bot-freshdesk
  ```

- [ ] **Check execution policy for scripts**
  ```powershell
  Get-ExecutionPolicy
  # If "Restricted", run:
  Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
  ```

- [ ] **Run Windows deployment script**
  ```powershell
  .\deploy-windows.ps1 -ServerIP "169.1.17.113" -RemoteUser "Administrator"
  ```
  ✅ Script will:
  - Validate Node.js/npm
  - Connect to remote server
  - Copy project files
  - Install dependencies
  - Create `.env` template
  - Offer to create Task Scheduler job

- [ ] **Configure environment on remote server**
  - Edit: `C:\Apps\telegram-bot-freshdesk\.env`
  - Update:
    - `FRESHDESK_API_KEY=your_key`
    - `FRESHDESK_DOMAIN=yourcompany.freshdesk.com`

- [ ] **Start the bot** (choose one):
  ```cmd
  # Option 1: Double-click C:\Apps\telegram-bot-freshdesk\run-bot.bat
  # Option 2: Command Prompt as Admin
  cd C:\Apps\telegram-bot-freshdesk
  npm start
  
  # Option 3: Task Scheduler (if created during deployment)
  ```

---

## Post-Deployment Configuration ✅

### Freshdesk Webhook Setup

- [ ] **Log into Freshdesk Admin Panel**

- [ ] **Navigate to Webhooks**
  - Admin → Automation & Visibility → Webhooks

- [ ] **Create New Webhook**
  - [ ] **Title**: "Telegram Bot Notifications"
  - [ ] **URL**: `http://169.1.17.113:3000/webhook/freshdesk`
  - [ ] **Method**: POST
  - [ ] **Authentication**: None

- [ ] **Select Events** (enable all relevant ones):
  - [ ] Ticket Created
  - [ ] Ticket Updated
  - [ ] Ticket Closed
  - [ ] Conversation Created
  - [ ] Ticket Status Changed
  - [ ] Ticket Assigned

- [ ] **Create Webhook**

---

## Testing ✅

### Service Health Checks

- [ ] **Service Running** (Linux)
  ```bash
  sudo systemctl status telegram-bot
  ```
  ✅ Should show: `active (running)`

- [ ] **Port Check**
  ```bash
  lsof -i :3000
  # or
  telnet 169.1.17.113 3000
  ```
  ✅ Should show connection on port 3000

- [ ] **Process Check**
  ```bash
  ps aux | grep "node.*bot.js"
  ```
  ✅ Should show running Node.js process

### Webhook Connectivity

- [ ] **Test Webhook Endpoint**
  ```bash
  curl -X POST http://169.1.17.113:3000/webhook/freshdesk \
    -H "Content-Type: application/json" \
    -d '{"test": "webhook"}'
  ```
  ✅ Should return HTTP 200

- [ ] **Firewall Check**
  ```bash
  sudo ufw status
  # Port 3000 should be allowed
  ```

### Application Tests

- [ ] **Check Logs** (Linux)
  ```bash
  tail -f /var/log/telegram-bot-freshdesk/bot.log
  ```
  ✅ Should show bot initialization messages

- [ ] **Test Telegram Bot**
  - Find: `@Fresh_Note_Bot` on Telegram
  - Send: `/start`
  - Verify: Bot responds with welcome message

- [ ] **Create Test Freshdesk Ticket**
  - Create a new ticket in Freshdesk
  - Check bot logs for webhook receipt
  - Verify: Logs show incoming webhook
  ```bash
  # Look for messages like:
  # "✅ Webhook received from Freshdesk"
  # "📬 Processing ticket: #12345"
  ```

---

## Verification Checklist ✅

### All Systems Operational

- [ ] Service status: `active (running)`
- [ ] Logs showing no errors
- [ ] Webhook responding on port 3000
- [ ] Freshdesk webhook configured correctly
- [ ] Telegram bot responding to commands
- [ ] Test ticket in Freshdesk triggers notification

### Auto-Restart & Persistence

- [ ] Service auto-starts on server reboot (Linux):
  ```bash
  sudo systemctl is-enabled telegram-bot
  # Output: enabled
  ```

- [ ] Test restart:
  ```bash
  sudo systemctl restart telegram-bot
  # Verify still running:
  sudo systemctl status telegram-bot
  ```

- [ ] Windows Task Scheduler job (if created):
  - [ ] Task exists and is enabled
  - [ ] Task runs at startup
  - [ ] Test: Restart Windows and verify bot is running

---

## Monitoring Setup ✅

### Linux Monitoring

- [ ] **Set up log rotation** (optional):
  ```bash
  sudo nano /etc/logrotate.d/telegram-bot
  # Add configuration for log rotation
  ```

- [ ] **Create monitoring script** (optional):
  ```bash
  # Create a cron job to check service health
  sudo crontab -e
  # Add: */5 * * * * systemctl is-active telegram-bot || systemctl start telegram-bot
  ```

### Regular Maintenance

- [ ] **Daily**: Check logs for errors
  ```bash
  tail -50 /var/log/telegram-bot-freshdesk/error.log
  ```

- [ ] **Weekly**: Backup `.env` file
  ```bash
  sudo cp /opt/telegram-bot-freshdesk/.env ~/backup/.env.$(date +%Y%m%d)
  ```

- [ ] **Monthly**: Update dependencies
  ```bash
  sudo systemctl stop telegram-bot
  cd /opt/telegram-bot-freshdesk
  sudo -u telegram-bot npm install
  sudo systemctl start telegram-bot
  ```

---

## Troubleshooting Verification ✅

If something doesn't work, verify:

### Service Won't Start

- [ ] `.env` file exists and is readable
  ```bash
  ls -la /opt/telegram-bot-freshdesk/.env
  cat /opt/telegram-bot-freshdesk/.env
  ```

- [ ] All required variables are set
  ```bash
  grep -E "TELEGRAM_BOT_TOKEN|FRESHDESK_API_KEY|FRESHDESK_DOMAIN" /opt/telegram-bot-freshdesk/.env
  ```

- [ ] Check error logs
  ```bash
  journalctl -u telegram-bot -n 50
  ```

### Webhook Not Received

- [ ] Firewall allows port 3000
  ```bash
  sudo ufw allow 3000/tcp
  sudo ufw status
  ```

- [ ] Webhook URL is correct
  - Should be: `http://169.1.17.113:3000/webhook/freshdesk`
  - Check in Freshdesk: Admin → Webhooks → Edit

- [ ] Test webhook endpoint
  ```bash
  curl http://169.1.17.113:3000/webhook/freshdesk
  ```

### Telegram Bot Not Responding

- [ ] Bot token is correct (already provided, should not need change)
- [ ] Check logs for Telegram connection errors
  ```bash
  journalctl -u telegram-bot | grep -i telegram
  ```

---

## Go-Live Checklist ✅

Before marking as complete:

- [ ] All tests passed
- [ ] No errors in logs
- [ ] Freshdesk webhook delivering messages
- [ ] Telegram bot receiving notifications
- [ ] Auto-restart configured
- [ ] Backups in place
- [ ] Monitoring enabled
- [ ] Documentation reviewed
- [ ] Support contacts available
- [ ] Rollback plan documented

---

## Quick Access Commands

**Linux:**
```bash
# Status
sudo systemctl status telegram-bot

# Logs
tail -f /var/log/telegram-bot-freshdesk/bot.log

# Restart
sudo systemctl restart telegram-bot

# Edit config
sudo nano /opt/telegram-bot-freshdesk/.env
```

**Windows:**
```cmd
# View files
explorer C:\Apps\telegram-bot-freshdesk

# Restart via Task Scheduler
taskkill /F /IM node.exe
cd C:\Apps\telegram-bot-freshdesk && npm start
```

---

## Support Resources

- [DEPLOYMENT.md](DEPLOYMENT.md) - Detailed deployment guide
- [ENV_CONFIG.md](ENV_CONFIG.md) - Environment configuration details
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md) - Common issues and solutions
- [README.md](README.md) - Project overview
- [quick-commands.sh](quick-commands.sh) - Quick reference commands

---

**Deployment Date:** ________________

**Deployed By:** ________________

**Notes:** ________________________________________________

---

**Last Updated:** February 17, 2026
