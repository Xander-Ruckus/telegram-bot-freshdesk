# Troubleshooting Guide

## Common Issues and Solutions

### 1. Bot Won't Start

#### Error: `Cannot find module 'telegraf'`

**Cause:** Dependencies not installed or package.json is corrupted.

**Solution:**
```bash
rm -rf node_modules package-lock.json
npm install
npm run dev
```

#### Error: `Error: ETELEGRAM: 401 Unauthorized`

**Cause:** Invalid or expired Telegram bot token.

**Solution:**
1. Verify token in `.env` file
2. Token provided: `8498347303:AAF0ApLxQQYvypzel_sCLRHVWNVe309BKKY`
3. If expired, get new token from BotFather:
   - Chat: https://t.me/botfather
   - Command: `/newtoken`

#### Error: `Missing required environment variables`

**Cause:** `.env` file is incomplete.

**Solution:**
```bash
cp .env.example .env
# Edit .env and fill in all required values
```

---

### 2. Bot Starts But Doesn't Respond to Commands

#### Issue: `/help` command doesn't work

**Cause:** Bot not connected to Telegram API.

**Solution:**
```bash
# Check internet connection
ping core.telegram.org

# Verify bot is actually running
npm run dev

# Watch for connection message:
# ✅ Telegram bot @Fresh_Note_Bot started
```

#### Issue: Commands timeout or are very slow

**Cause:** Network latency or Freshdesk API is slow.

**Solution:**
```bash
# Test Freshdesk API connectivity
curl -X GET https://your-domain.freshdesk.com/api/v2/tickets \
  -H "Authorization: Basic $(echo -n 'API_KEY:X' | base64)"

# If this fails, check:
# 1. Domain name spelling
# 2. API key validity
# 3. Network/firewall settings
```

---

### 3. Webhook Notifications Not Received

#### Issue: No notifications even though webhook is set up

**Cause:** Webhook URL not accessible or incorrectly configured.

**Solution:**

1. **Test webhook endpoint directly:**
   ```bash
   curl -X GET http://localhost:3000/webhook/health
   ```
   Should return:
   ```json
   {"status": "healthy", "timestamp": "2026-02-16T..."}
   ```

2. **Verify webhook is public:**
   - Test from different machine/network
   - Firewall may be blocking requests
   - Use ngrok for tunneling if behind NAT:
     ```bash
     ngrok http 3000
     # Use ngrok URL in Freshdesk webhook
     ```

3. **Check Freshdesk webhook configuration:**
   - Admin → Automation → Webhooks
   - Verify URL matches exactly
   - Check "Event" is selected and active
   - Try sending test webhook

4. **Check logs:**
   ```bash
   curl http://localhost:3000/webhook/logs
   ```

#### Issue: Webhooks fire but no Telegram message sent

**Cause:** Bot not running or user not subscribed.

**Solution:**
```bash
# Check bot is running
npm run dev

# Check console for errors
# Look for: "Notification sent for..."

# Verify user started bot
# /start initializes user settings
```

#### Issue: 401 Unauthorized on webhook

**Cause:** Freshdesk API key invalid or expired.

**Solution:**
1. Generate new API key from Freshdesk
2. Update `.env` with new key
3. Restart bot: `npm run dev`

---

### 4. Database/Storage Issues

#### Issue: User settings not persisting

**Cause:** Currently using in-memory storage (Map).

**Note:** For production, implement persistent storage:
```javascript
// Replace Map with:
// - Database (PostgreSQL, MongoDB)
// - Redis
// - File system
// - Cloud storage
```

**Temporary solution:**
```bash
npm run dev  # Keep bot running
# Settings lost when bot restarts
```

---

### 5. API Errors

#### Error: `Error: connect ECONNREFUSED 127.0.0.1:5432`

**Cause:** Database connection issue (if database is added).

**Note:** Current version doesn't use database by default.

#### Error: `Freshdesk API: 429 Too Many Requests`

**Cause:** Rate limit exceeded (600 req/min).

**Solution:**
- Reduce polling frequency
- Implement request queuing
- Cache results aggressively

#### Error: `Error: ETELEGRAM: 429 Too Many Requests`

**Cause:** Sending too many messages to Telegram.

**Solution:**
- Don't broadcast to users too frequently
- Batch notifications
- Add delays between messages

---

### 6. Deployment Issues

#### Issue: Port 3000 already in use

**Cause:** Another process is using port 3000.

**Solution:**
```bash
# Windows
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# macOS/Linux
lsof -i :3000
kill -9 <PID>

# Or change port
# Update .env: WEBHOOK_PORT=3001
```

#### Issue: HTTPS certificate error

**Cause:** Self-signed or invalid certificate.

**Solution:**
```bash
# For local testing with ngrok:
ngrok http 3000

# For production:
# Use Let's Encrypt with nginx/Apache
# Configure proper certificate
```

#### Deployment to Heroku failing

**Issue:** `error: the Heroku dyno type is not specified`

**Solution:**
```bash
# Create Procfile
echo "worker: npm start" > Procfile

# Deploy
git add .
git commit -m "Add Procfile"
git push heroku main
```

---

### 7. Freshdesk API Issues

#### Error: `Invalid API key` or `Unauthorized`

**Cause:** Wrong or expired API key.

**Solution:**
1. Login to Freshdesk
2. Navigate: Admin → Settings → API Tokens
3. Generate new token
4. Update `.env` and restart

#### Error: Ticket details return empty

**Cause:** Ticket ID doesn't exist or user lacks permissions.

**Solution:**
1. Verify ticket exists in Freshdesk
2. Check API key has read permissions
3. Try with different ticket ID

#### No agents returned with `/agents` command

**Cause:** API key lacks agent permissions.

**Solution:**
- Verify API key has "Read agents" permission
- Admin account may be required

---

### 8. Performance Issues

#### Bot is slow responding

**Cause:**
- Network latency
- Freshdesk API slow
- Too many users subscribed

**Solution:**
```javascript
// Add caching in src/services/freshdesk.js
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Reduce broadcast frequency
// Implement rate limiting
```

#### High memory usage

**Cause:** User settings Map growing without limit.

**Solution:**
- Implement persistent storage (database)
- Periodic cleanup of inactive users
- Implement pagination

---

### 9. Testing Commands

#### Quick verification script

```bash
#!/bin/bash

echo "🔍 Testing bot setup..."

# Check Node.js
echo -n "Node.js: "
node --version

# Check npm
echo -n "npm: "
npm --version

# Check .env
echo -n ".env exists: "
[ -f .env ] && echo "✅" || echo "❌"

# Check dependencies installed
echo -n "node_modules: "
[ -d node_modules ] && echo "✅" || echo "❌"

# Test health endpoint
echo -n "Health endpoint: "
curl -s http://localhost:3000/webhook/health > /dev/null && echo "✅" || echo "❌"

echo "✅ All checks passed!"
```

---

### 10. Getting Help

#### Check logs
```bash
# Real-time logs
npm run dev

# View webhook logs
curl http://localhost:3000/webhook/logs | jq

# Export logs to file
npm run dev > bot.log 2>&1 &
```

#### Enable debug mode
```bash
# Add to .env
DEBUG=true

# Then run
npm run dev
```

#### Ask for help
- Telegram: Contact @Fresh_Note_Bot support
- Freshdesk API: https://developers.freshdesk.com/support
- Telegraf: https://github.com/telegraf/telegraf/discussions
- GitHub Issues: [Your repo]/issues

---

## Diagnostic Checklist

Before reporting issues, check:

- [ ] `.env` file contains all required variables
- [ ] Telegram token is valid and not expired
- [ ] Freshdesk API key is valid
- [ ] Domain name is spelled correctly (e.g., `company.freshdesk.com`)
- [ ] `npm install` has been run
- [ ] No errors in `npm run dev` output
- [ ] `curl http://localhost:3000/webhook/health` returns success
- [ ] Firewall isn't blocking port 3000
- [ ] Bot has been /start by the user in Telegram
- [ ] Freshdesk webhook is configured and active

---

## Performance Monitoring

### Monitor bot health:
```bash
# In separate terminal
watch -n 5 'curl -s http://localhost:3000/webhook/health'
```

### Monitor webhook events:
```bash
# Stream logs in real-time
npm run dev 2>&1 | grep -E "(Received|Notification|error)"
```

### Check resource usage:
```bash
# Node.js process info
node -e "console.log(process.memoryUsage())"
```
