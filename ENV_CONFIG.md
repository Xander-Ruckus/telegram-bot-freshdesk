# Environment Configuration Guide

This guide covers setting up the `.env` file for server deployment at **169.1.17.113**.

## File Location

- **Linux**: `/opt/telegram-bot-freshdesk/.env`
- **Windows**: `C:\Apps\telegram-bot-freshdesk\.env`

## Complete Configuration Template

```env
# ============================================================
# TELEGRAM BOT CONFIGURATION
# ============================================================

# Telegram Bot Token (Already provided, do not change)
TELEGRAM_BOT_TOKEN=8498347303:AAF0ApLxQQYvypzel_sCLRHVWNVe309BKKY

# Telegram Bot Username (Used for bot identification)
TELEGRAM_BOT_USERNAME=Fresh_Note_Bot

# ============================================================
# FRESHDESK CONFIGURATION
# ============================================================

# Your Freshdesk API Key (from Freshdesk Admin → API Tokens)
FRESHDESK_API_KEY=your_api_key_here

# Your Freshdesk domain (e.g., mycompany.freshdesk.com)
FRESHDESK_DOMAIN=yourcompany.freshdesk.com

# ============================================================
# SERVER CONFIGURATION
# ============================================================

# Port for webhook server (ensure firewall allows this)
WEBHOOK_PORT=3000

# Webhook URL (must match Freshdesk webhook configuration)
WEBHOOK_URL=http://169.1.17.113:3000/webhook

# Environment (production or development)
NODE_ENV=production

# ============================================================
# OPTIONAL: LOGGING (Production)
# ============================================================

# Log level: error, warn, info, debug
LOG_LEVEL=info

# Optional: External logging service
# LOG_SERVICE=sentry
# SENTRY_DSN=your_sentry_dsn
```

## Step-by-Step Configuration

### 1. Get Your Freshdesk API Key

1. Log into **Freshdesk Admin Panel**
2. Click your **Profile Icon** (top-right corner)
3. Select **Settings**
4. Navigate to **API & Apps** → **API Tokens**
5. Click **Generate Token** (if you don't have one)
6. Copy the **API Token**

Example: `abcd1234efgh5678ijkl9012`

### 2. Find Your Freshdesk Domain

Your domain is the subdomain in your Freshdesk URL:
- If your Freshdesk URL is: `https://mycompany.freshdesk.com`
- Then your domain is: `mycompany.freshdesk.com`

### 3. Configure on Your Server

**Linux:**
```bash
sudo nano /opt/telegram-bot-freshdesk/.env
```

**Windows (Command Prompt as Admin):**
```cmd
notepad C:\Apps\telegram-bot-freshdesk\.env
```

**Windows (PowerShell as Admin):**
```powershell
notepad "C:\Apps\telegram-bot-freshdesk\.env"
```

Copy and paste the template, then fill in:
- `FRESHDESK_API_KEY` - Your API key from step 1
- `FRESHDESK_DOMAIN` - Your Freshdesk domain

Save and close the editor.

### 4. Verify Configuration

**Linux:**
```bash
# Check .env is readable
cat /opt/telegram-bot-freshdesk/.env

# Restart service
sudo systemctl restart telegram-bot

# Check logs
journalctl -u telegram-bot -f
```

**Windows:**
```powershell
# Check .env exists and is readable
Get-Content "C:\Apps\telegram-bot-freshdesk\.env"

# Restart the bot (via Task Scheduler or manual restart)
```

## Detailed Variable Reference

| Variable | Required | Example | Notes |
|----------|----------|---------|-------|
| `TELEGRAM_BOT_TOKEN` | ✅ Yes | `8498347303:AAF0...` | Do not change - already provided |
| `TELEGRAM_BOT_USERNAME` | ✅ Yes | `Fresh_Note_Bot` | Your bot's username on Telegram |
| `FRESHDESK_API_KEY` | ✅ Yes | `abcd1234...` | From Freshdesk Admin Panel |
| `FRESHDESK_DOMAIN` | ✅ Yes | `company.freshdesk.com` | Your Freshdesk subdomain |
| `WEBHOOK_PORT` | ❌ Optional | `3000` | Default: 3000 (must be open in firewall) |
| `WEBHOOK_URL` | ❌ Optional | `http://169.1.17.113:3000/webhook` | Full webhook URL for Freshdesk |
| `NODE_ENV` | ❌ Optional | `production` | Set to `production` for server |
| `LOG_LEVEL` | ❌ Optional | `info` | Logging verbosity (error, warn, info, debug) |

## Validation

The bot will validate your `.env` on startup. Required variables:
```
✅ TELEGRAM_BOT_TOKEN
✅ TELEGRAM_BOT_USERNAME
✅ FRESHDESK_API_KEY
✅ FRESHDESK_DOMAIN
```

**If any are missing**, the bot will fail with:
```
❌ Missing required environment variables:
  - FRESHDESK_API_KEY
  - FRESHDESK_DOMAIN
```

## Security Best Practices

### File Permissions (Linux)

```bash
# Restrict access to .env file
sudo chmod 600 /opt/telegram-bot-freshdesk/.env

# Ensure only telegram-bot user can read it
sudo chown telegram-bot:telegram-bot /opt/telegram-bot-freshdesk/.env

# Verify
ls -la /opt/telegram-bot-freshdesk/.env
# Output should be: -rw------- telegram-bot telegram-bot
```

### Never commit .env to Git

Add to `.gitignore`:
```
.env
.env.local
.env.production
```

### Rotate API Keys Regularly

1. Generate a new API key in Freshdesk
2. Update `.env`
3. Restart the service
4. Delete the old API key from Freshdesk

### Windows File Permissions

```powershell
# Restrict .env to current user
icacls "C:\Apps\telegram-bot-freshdesk\.env" /inheritance:r /grant:r "%USERNAME%:F"
```

## Environment-Specific Configurations

### Development (Local Machine)

```env
NODE_ENV=development
LOG_LEVEL=debug
WEBHOOK_PORT=3000
WEBHOOK_URL=http://localhost:3000/webhook
```

### Staging (Test Server)

```env
NODE_ENV=production
LOG_LEVEL=warn
WEBHOOK_PORT=3000
WEBHOOK_URL=http://169.1.17.113:3000/webhook
```

### Production (Live Server)

```env
NODE_ENV=production
LOG_LEVEL=error
WEBHOOK_PORT=3000
WEBHOOK_URL=http://169.1.17.113:3000/webhook
```

## Troubleshooting

### "Missing required environment variables" Error

**Solution**: Ensure all required variables are set:
```bash
# Check .env file exists
ls -la /opt/telegram-bot-freshdesk/.env

# View content
cat /opt/telegram-bot-freshdesk/.env

# Restart bot
sudo systemctl restart telegram-bot

# Check logs
journalctl -u telegram-bot -f
```

### Bot starts but no messages from Freshdesk

**Check these:**
1. Verify `FRESHDESK_API_KEY` is correct
2. Verify `FRESHDESK_DOMAIN` is exactly right (case-sensitive expected)
3. Ensure Freshdesk webhook is configured: `http://169.1.17.113:3000/webhook/freshdesk`
4. Check firewall allows port 3000
5. Test: `curl http://169.1.17.113:3000/webhook/freshdesk`

### "API Key invalid" Error

**Solution**:
1. Verify the API key from Freshdesk is correct
2. Check for extra spaces in `.env`:
   ```env
   # WRONG:
   FRESHDESK_API_KEY = abcd1234

   # CORRECT:
   FRESHDESK_API_KEY=abcd1234
   ```
3. Generate a new API key if the old one expired

### Webhook URL format issues

**Must be**: `http://169.1.17.113:3000/webhook` (HTTP, not HTTPS for internal IP)

**Wrong formats**:
- ❌ `http://169.1.17.113:3000/webhook/` (trailing slash)
- ❌ `https://169.1.17.113:3000/webhook` (HTTPS for internal IP)
- ❌ `http://169.1.17.113:3000` (missing /webhook)

## Testing Configuration

After updating `.env`, test the connection:

```bash
# 1. Restart the service
sudo systemctl restart telegram-bot

# 2. Check service is running
sudo systemctl status telegram-bot

# 3. View recent logs
journalctl -u telegram-bot -n 20

# 4. Test webhook endpoint
curl -i http://169.1.17.113:3000/webhook/freshdesk

# 5. Create a test ticket in Freshdesk
# Watch the logs to see if webhook is received
journalctl -u telegram-bot -f
```

## Example Valid .env File

```env
TELEGRAM_BOT_TOKEN=8498347303:AAF0ApLxQQYvypzel_sCLRHVWNVe309BKKY
TELEGRAM_BOT_USERNAME=Fresh_Note_Bot
FRESHDESK_API_KEY=d7f8g9h0i1j2k3l4m5n6
FRESHDESK_DOMAIN=acmecorp.freshdesk.com
WEBHOOK_PORT=3000
WEBHOOK_URL=http://169.1.17.113:3000/webhook
NODE_ENV=production
LOG_LEVEL=info
```

## Support

If configuration issues persist:

1. Check [DEPLOYMENT.md](DEPLOYMENT.md) for deployment details
2. Review [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for common issues
3. Check application logs: `tail -f /var/log/telegram-bot-freshdesk/bot.log`
4. Verify Freshdesk API key at: https://developers.freshdesk.com/api/

---

**Last Updated:** February 17, 2026
