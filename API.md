# Telegram Bot - API Documentation

## Overview

The Telegram bot provides a bridge between Freshdesk and Telegram users, delivering real-time notifications about ticket updates and allowing users to query ticket information via Telegram commands.

## Architecture

```
┌─────────────┐
│  Freshdesk  │
└──────┬──────┘
       │ Webhook POST
       ↓
┌─────────────────────────────────┐
│  Express Server (Port 3000)     │
│  - Receives webhook events      │
│  - Processes notifications      │
└────────────┬────────────────────┘
             │ Telegram API
             ↓
┌─────────────────────────────────┐
│  Telegram Users                 │
│  Receive notifications          │
└─────────────────────────────────┘
```

## Bot Commands

### `/start`
Initializes the bot and displays welcome message.

**Response:**
```
🎉 Welcome to Fresh Note Bot!
I'm your Freshdesk notification assistant...
```

### `/help`
Shows list of available commands and features.

**Response:**
```
📚 Available Commands:
/start - Start the bot
/help - Show this help menu
...
```

### `/status`
Check system status - bot connectivity and Freshdesk API status.

**Response:**
```
✅ Bot Status
Telegram Bot: 🟢 Connected
Freshdesk API: 🟢 Connected
Uptime: 3600s
```

### `/settings`
View and manage notification preferences.

**Response:**
```
⚙️ Notification Settings
Current Preferences:
• Notifications: ✅
• Filter by Status: All
• Filter by Priority: All
```

### `/tickets`
Get list of recently created or updated tickets.

**Command:**
```
/tickets [limit]
```

**Parameters:**
- `limit` (optional) - Number of tickets to retrieve (default: 5, max: 20)

**Response:**
```
📋 Recent Tickets:
1. #1234 - Cannot login to account
   Status: Open
   Priority: High

2. #1235 - Payment processing issue
   Status: Pending
   Priority: Medium
```

### `/agents`
List all active support agents and their availability.

**Response:**
```
👥 Active Agents:
1. John Smith
   Email: john@example.freshdesk.com
   Status: 🟢 Available

2. Jane Doe
   Email: jane@example.freshdesk.com
   Status: 🔴 Busy
```

## Webhook Events

The bot listens for webhook events from Freshdesk on `POST /webhook/freshdesk`.

### Event: `ticket.created`
Triggered when a new ticket is created.

**Payload:**
```json
{
  "event_type": "ticket.created",
  "ticket_id": 1234,
  "ticket": {
    "id": 1234,
    "subject": "Customer inquiry",
    "status": "Open",
    "priority": "High",
    "created_at": "2026-02-16T10:30:00Z"
  }
}
```

**Bot Action:**
Sends notification to all subscribed users:
```
📌 New Ticket Created
#1234: Customer inquiry
Priority: 🔴 High
Status: Open
Customer: customer@example.com
Created: 2/16/2026, 10:30:00 AM
```

### Event: `ticket.updated`
Triggered when ticket is modified (status, priority, assignment, etc).

**Payload:**
```json
{
  "event_type": "ticket.updated",
  "ticket_id": 1234,
  "changes": {
    "priority": [2, 3],
    "status": [2, 3]
  }
}
```

**Bot Action:**
```
🔄 Ticket Updated
#1234: Customer inquiry
Priority changed: Medium → High
Status changed: Open → Pending
Status: Pending
Priority: 🔴 High
```

### Event: `ticket.solved`
Triggered when ticket is resolved.

**Payload:**
```json
{
  "event_type": "ticket.solved",
  "ticket_id": 1234
}
```

**Bot Action:**
```
✅ Ticket Resolved
#1234: Customer inquiry
Priority: 🔴 High
Resolved at: 2/16/2026, 2:45:00 PM
```

### Event: `ticket.reopened`
Triggered when resolved ticket is reopened.

**Payload:**
```json
{
  "event_type": "ticket.reopened",
  "ticket_id": 1234
}
```

### Event: `conversation.created`
Triggered when comment is added to ticket.

**Payload:**
```json
{
  "event_type": "conversation.created",
  "ticket_id": 1234
}
```

## API Endpoints

### `GET /webhook/health`
Health check endpoint.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2026-02-16T10:30:00Z"
}
```

### `POST /webhook/freshdesk`
Receives webhook events from Freshdesk.

**Headers:**
```
Content-Type: application/json
```

**Body:**
```json
{
  "event_type": "ticket.created",
  "ticket_id": 1234,
  ...
}
```

**Response:**
```json
{
  "success": true
}
```

### `GET /webhook/logs` (Debug)
Retrieve webhook processing logs.

**Query Parameters:**
- `limit` (optional) - Number of recent logs (default: 20)

**Response:**
```json
[
  {
    "timestamp": "2026-02-16T10:30:00Z",
    "event_type": "ticket.created",
    "ticket_id": 1234,
    "status": "processed"
  }
]
```

## Freshdesk API Integration

### Authentication

The bot uses HTTP Basic Auth with Freshdesk API:
```
Authorization: Basic <base64(api_key:X)>
```

### Endpoints Used

#### Get Tickets
```
GET https://{domain}.freshdesk.com/api/v2/tickets
```

**Query Parameters:**
- `per_page` - Results per page (default: 10, max: 100)
- `order_by` - Sort field (default: created_at)
- `order_type` - Sort order (asc/desc)

**Response:**
```json
{
  "tickets": [
    {
      "id": 1,
      "subject": "Ticket subject",
      "status": 2,
      "priority": 3,
      "created_at": "2026-02-16T10:30:00Z"
    }
  ],
  "total": 100,
  "total_unseen": 5
}
```

#### Get Ticket Details
```
GET https://{domain}.freshdesk.com/api/v2/tickets/{ticket_id}
```

**Response:**
```json
{
  "ticket": {
    "id": 1234,
    "subject": "Issue description",
    "description_text": "Full description",
    "status": 2,
    "priority": 3,
    "created_at": "2026-02-16T10:30:00Z",
    "updated_at": "2026-02-16T11:00:00Z"
  }
}
```

#### Get Agents
```
GET https://{domain}.freshdesk.com/api/v2/agents
```

**Response:**
```json
{
  "agents": [
    {
      "id": 1,
      "name": "John Smith",
      "email": "john@example.freshdesk.com",
      "available": true
    }
  ]
}
```

#### Get Conversations
```
GET https://{domain}.freshdesk.com/api/v2/tickets/{ticket_id}/conversations
```

**Response:**
```json
{
  "conversations": [
    {
      "id": 1,
      "body_text": "Comment text",
      "user_id": 1,
      "created_at": "2026-02-16T10:30:00Z",
      "private": false
    }
  ]
}
```

## Status & Priority Codes

### Status Codes (Freshdesk)
- 2 = Open
- 3 = Pending
- 4 = Resolved
- 5 = Closed
- 6 = On Hold
- 7 = Reopened
- 8 = Waiting on customer
- 9 = Assigned

### Priority Codes (Freshdesk)
- 1 = Low 🟢
- 2 = Medium 🟡
- 3 = High 🔴
- 4 = Urgent ⚠️

## Error Handling

### Common Errors

**Invalid Token**
```
Error: ETELEGRAM: 401 Unauthorized
```
Solution: Verify bot token in .env

**API Not Accessible**
```
Error: ECONNREFUSED - Freshdesk API unreachable
```
Solution: Check internet connection and domain

**Missing Environment Variables**
```
Error: Missing required environment variables: FRESHDESK_API_KEY
```
Solution: Update .env file with all required variables

## Rate Limits

### Telegram
- 30 messages per second per chat
- 100 requests per second per bot

### Freshdesk
- 600 API calls per minute
- Automatic retry with exponential backoff

## Development

### Extending the Bot

Add new commands in `src/bot.js`:
```javascript
bot.command('mycommand', async (ctx) => {
  await ctx.reply('Response');
});
```

Add new event handlers in `src/webhooks/index.js`:
```javascript
eventHandlers['event.name'] = handleNewEvent;
```

Add new services in `src/services/`:
```javascript
export class MyService {
  // Implementation
}
```

## Debugging

Enable debug logging:
```bash
DEBUG=true npm run dev
```

Check webhook logs:
```
curl http://localhost:3000/webhook/logs?limit=50
```

## References

- [Telegram Bot API](https://core.telegram.org/bots/api)
- [Freshdesk API Documentation](https://developers.freshdesk.com/api/)
- [Telegraf Documentation](https://telegraf.js.org/)
