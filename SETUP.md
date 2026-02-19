# Telegram Bot - Quick Setup Guide

## Pre-requisites

- Node.js v16+ installed
- npm or yarn
- Freshdesk account with API access
- Telegram bot token (provided: `8498347303:AAF0ApLxQQYvypzel_sCLRHVWNVe309BKKY`)

## Step 1: Clone/Create Project

```bash
cd d:\OneDrive\ -\ Emtelle\ \(Pty\)\ Ltd\Documents\VisualStudios\telegram-bot-freshdesk
```

## Step 2: Setup Environment Variables

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Edit `.env` and add your Freshdesk credentials:

```env
TELEGRAM_BOT_TOKEN=8498347303:AAF0ApLxQQYvypzel_sCLRHVWNVe309BKKY
TELEGRAM_BOT_USERNAME=Fresh_Note_Bot

FRESHDESK_API_KEY=your_api_key_here
FRESHDESK_DOMAIN=yourcompany.freshdesk.com

WEBHOOK_PORT=3000
WEBHOOK_URL=https://your-domain.com/webhook
```

### Getting Freshdesk API Key

1. Go to Freshdesk Dashboard
2. Click your profile icon (top right) → **Settings**
3. Go to **API & Apps** → **API Tokens**
4. Copy your API key

## Step 3: Install Dependencies

```bash
npm install
```

This will install:
- `telegraf` - Telegram bot framework
- `express` - Web server for webhooks
- `axios` - HTTP client for Freshdesk API
- `dotenv` - Environment variable management
- `nodemon` - Development auto-reload

## Step 4: Run the Bot

**Development (with auto-reload):**
```bash
npm run dev
```

**Production:**
```bash
npm start
```

You should see:
```
✅ Webhook server running on port 3000
✅ Telegram bot @Fresh_Note_Bot started
🤖 Bot successfully launched
```

## Step 5: Configure Freshdesk Webhooks

1. Log into Freshdesk
2. Go to **Admin** → **Automation & Visibility** → **Webhooks**
3. Click **New Webhook**
4. Configure:
   - **Title**: "Telegram Bot Notifications"
   - **URL**: `https://your-domain.com/webhook/freshdesk`
   - **HTTP Method**: POST
   - **Event**: Select events (Ticket Created, Ticket Updated, etc.)
5. Click **Create**

### Webhook Events to Enable

✅ Ticket Created
✅ Ticket Updated
✅ Ticket Closed
✅ Conversation Created
✅ Ticket Status Changed
✅ Ticket Assigned

## Step 6: Test the Bot

1. Find the bot: **@Fresh_Note_Bot** on Telegram
2. Start a chat: `/start`
3. Test commands:
   - `/help` - See all commands
   - `/status` - Check bot status
   - `/tickets` - Get recent tickets
   - `/agents` - List agents
   - `/settings` - View notification settings

## Deployment

### Option 1: Local/On-Premise

Keep the bot running on your server:

**Using PM2 (recommended):**
```bash
npm install -g pm2
pm2 start src/bot.js --name "telegram-bot"
pm2 startup
pm2 save
```

### Option 2: Cloud Deployment

Deploy to cloud platforms:
- Railway
- Heroku
- AWS Lambda
- Digital Ocean

Ensure you set the same environment variables on the platform.

### Option 3: Docker

Create `Dockerfile`:

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

CMD ["npm", "start"]
```

Build and run:
```bash
docker build -t telegram-bot-freshdesk .
docker run -e TELEGRAM_BOT_TOKEN=xxx -e FRESHDESK_API_KEY=xxx telegram-bot-freshdesk
```

## Troubleshooting

### Bot doesn't start

```bash
# Check Node.js version
node --version

# Check all environment variables are set
cat .env
```

### No notifications received

1. Check webhook URL is accessible: `curl https://your-domain.com/webhook/health`
2. Verify Freshdesk webhook is configured correctly
3. Check bot logs: `npm run dev`

### "Cannot find module" error

```bash
# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

## Project Structure

```
src/
├── bot.js                 # Main bot entry point
├── handlers/              # Command handlers (extensible)
├── services/
│   └── freshdesk.js       # Freshdesk API wrapper
├── webhooks/
│   └── index.js           # Webhook event handlers
└── utils/
    └── logger.js          # Logging utility
```

## Architecture

```
Freshdesk
    ↓ (webhook POST)
Express Server (port 3000)
    ↓
Bot processes event
    ↓
Telegram API
    ↓
User receives notification
```

## Next Steps

1. ✅ Install and run the bot
2. ✅ Configure Freshdesk webhooks
3. ✅ Test notifications
4. 📌 Add custom handlers in `src/handlers/` as needed
5. 📌 Extend Freshdesk service in `src/services/freshdesk.js`
6. 📌 Deploy to production

## Support

- Telegram Bot API: https://core.telegram.org/bots/api
- Freshdesk API: https://developers.freshdesk.com/api/
- Telegraf Docs: https://telegraf.js.org/

## License

MIT
