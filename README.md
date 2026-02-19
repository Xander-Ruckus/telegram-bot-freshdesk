# Telegram Bot - Freshdesk Integration

A Telegram bot that integrates with Freshdesk ticketing system to send real-time notifications about tickets, agents, and support updates.

## Bot Details

- **Bot Username**: @Fresh_Note_Bot
- **Bot Link**: https://t.me/Fresh_Note_Bot
- **API Documentation**: https://core.telegram.org/bots/api

## Features

- 📢 Real-time Freshdesk ticket notifications
- 🔔 Customizable alerts and filters
- 🔐 Secure webhook authentication
- 📊 Ticket status updates
- 👤 Agent activity notifications

## Setup

### 1. Environment Variables

Copy `.env.example` to `.env` and fill in your credentials:

```bash
cp .env.example .env
```

**Required credentials:**
- `TELEGRAM_BOT_TOKEN` - From BotFather (already provided: `8498347303:AAF0ApLxQQYvypzel_sCLRHVWNVe309BKKY`)
- `FRESHDESK_API_KEY` - From Freshdesk admin panel
- `FRESHDESK_DOMAIN` - Your Freshdesk domain (e.g., `company.freshdesk.com`)

### 2. Install Dependencies

```bash
npm install
```

### 3. Run the Bot

**Development:**
```bash
npm run dev
```

**Production:**
```bash
npm start
```

## Webhook Configuration

The bot runs a webhook server on `http://localhost:3000` (configurable via `WEBHOOK_PORT`).

### Setting up Freshdesk Webhooks

1. Go to Freshdesk Admin → Automation → Webhooks
2. Create a new webhook with:
   - **URL**: `https://your-domain.com/webhook/freshdesk`
   - **Event**: Select events (Ticket Created, Ticket Updated, etc.)
   - **Method**: POST
   - **Headers**: Add any required authentication

### Webhook Events Supported

- Ticket Created
- Ticket Updated
- Ticket Closed
- Comment Added
- Status Changed
- Assigned Agent Changed

## Bot Commands

The bot supports the following commands:

- `/start` - Start the bot and get help
- `/help` - Show available commands
- `/status` - Check bot status
- `/settings` - Manage notification preferences

## Architecture

```
src/
├── bot.js              # Main bot initialization
├── handlers/           # Command and event handlers
├── services/           # Freshdesk API service
├── webhooks/           # Webhook handlers
└── utils/              # Utility functions
```

## Freshdesk Integration

### API Reference

- **Documentation**: https://developers.freshdesk.com/api/
- **Authentication**: API Key in Authorization header
- **Base URL**: `https://your-domain.freshdesk.com/api/v2/`

### Key Endpoints Used

- `GET /tickets` - List tickets
- `GET /tickets/{id}` - Get ticket details
- `GET /agents` - List agents
- `GET /contacts` - Get customer information

## Security

⚠️ **Never hardcode credentials!** Always use environment variables.

- Keep your bot token secure
- Use HTTPS for webhook URLs
- Validate webhook signatures
- Regularly rotate API keys

## Troubleshooting

### Bot not responding

1. Check if bot token is correct
2. Verify bot is running: `npm run dev`
3. Check bot is search in Telegram: @Fresh_Note_Bot

### Webhook not receiving events

1. Verify webhook URL is accessible
2. Check firewall/network settings
3. Test with cURL: `curl -X POST https://your-domain.com/webhook/freshdesk`
4. Check logs for errors

### API errors

1. Verify Freshdesk API key
2. Check domain name spelling
3. Ensure API has required permissions
4. Check rate limits (Freshdesk: 600 requests/minute)

## Development

### Project Structure

```
telegram-bot-freshdesk/
├── src/
│   ├── bot.js
│   ├── handlers/
│   ├── services/
│   ├── webhooks/
│   └── utils/
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

### Code Style

- Use ES6 modules
- Follow async/await patterns
- Add error handling for all async operations
- Document complex functions

## Support

For issues or questions:
- Telegram: Contact @Fresh_Note_Bot support team
- Freshdesk API: https://developers.freshdesk.com/
- Telegram Bot API: https://core.telegram.org/bots/api

## License

MIT
