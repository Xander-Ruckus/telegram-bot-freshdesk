# Ticket Correlation Feature: DOWN/UP State Matching

## Overview

The Telegram bot now includes an intelligent ticket correlation system that tracks "DOWN" events in Freshdesk and automatically closes related "UP" events when they arrive. This is particularly useful for monitoring infrastructure alerts, server status, or any other scenario where you need to correlate problem onset and resolution tickets.

## How It Works

### Automatic Ticket Correlation

1. **When a DOWN Ticket Arrives:**
   - Bot receives a webhook notification for a new ticket
   - Checks if the subject contains "DOWN" state
   - Extracts the **correlation key** from the subject (everything before the `:`)
   - Stores the ticket ID and correlation key in the SQLite database
   - Sends a 🔴 DOWN alert to all registered users

2. **When an UP Ticket Arrives:**
   - Bot receives a webhook notification for a new ticket
   - Checks if the subject contains "UP" state
   - Extracts the same **correlation key** from the subject
   - Queries the database for all DOWN tickets with matching correlation key
   - Automatically closes all matching DOWN tickets
   - Sends a ✅ UP alert to all registered users showing which tickets were closed

### Correlation Key Extraction

The correlation key is extracted from the ticket subject by taking everything **before the colon** (`:`)

**Example:**

```
Subject: H\/R\/AP-35 (10.0.2.155) [10.0.2.155] : STATE - Down
Correlation Key: H\/R\/AP-35 (10.0.2.155) [10.0.2.155]

Subject: H\/R\/AP-35 (10.0.2.155) [10.0.2.155] : STATE - Up
Correlation Key: H\/R\/AP-35 (10.0.2.155) [10.0.2.155]  ✅ MATCH!
```

Both tickets have the same correlation key, so the UP ticket will trigger closing of the DOWN ticket.

## State Detection

The bot detects DOWN/UP states using multiple pattern matching:

### DOWN Detection
- Subject contains: `STATE - DOWN` (case-insensitive)
- Subject contains: `: DOWN` or `- DOWN` 
- Subject contains the word `DOWN` as a standalone word

### UP Detection
- Subject contains: `STATE - UP` (case-insensitive)
- Subject contains: `: UP` or `- UP`
- Subject contains the word `UP` as a standalone word

## Database Schema

The system uses SQLite to persist DOWN ticket information:

```sql
CREATE TABLE down_tickets (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id         INTEGER NOT NULL,
  correlation_key   TEXT NOT NULL,
  subject           TEXT NOT NULL,
  created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(ticket_id)
);
```

**Database Location:** `./data/tickets.db`

## What Happens Automatically

### When DOWN Ticket Comes In
```
🔴 DOWN Alert
#41305
H\/R\/AP-35 (10.0.2.155) [10.0.2.155] : STATE - Down
```
✅ Stores in database
✅ Broadcasts to all registered users

### When Matching UP Ticket Arrives
```
✅ UP Alert
#41306
H\/R\/AP-35 (10.0.2.155) [10.0.2.155] : STATE - Up

Closed: #41305
```
✅ Closes ticket #41305 automatically
✅ Removes from database
✅ Broadcasts result to all registered users

## Scenario Examples

### Example 1: Single DOWN/UP Pair
```
1. Server monitoring bot sends DOWN alert
   Subject: "SRV-WEB-01 (192.168.1.100) : STATE - Down"
   Ticket Created: #50001

2. Minutes later, server is back online
   Subject: "SRV-WEB-01 (192.168.1.100) : STATE - Up"
   Ticket Created: #50002

Result: Ticket #50001 is automatically closed when #50002 arrives
```

### Example 2: Multiple DOWN Events Before UP

```
1. DOWN alert #40001: "DB-01 (10.0.0.1) : STATE - Down"
2. DOWN alert #40002: "DB-01 (10.0.0.1) : STATE - Down" (duplicate/retry)
3. UP alert #40003: "DB-01 (10.0.0.1) : STATE - Up"

Result: Both #40001 and #40002 are closed
Message shows: "Closed: #40001, #40002"
```

### Example 3: UP Before DOWN

```
1. UP alert #50001: "APP-SERVER (10.0.1.5) : STATE - Up"
   (No matching DOWN found, so nothing special happens)

2. Later, DOWN alert #50002: "APP-SERVER (10.0.1.5) : STATE - Down"
   (Stores in database for future matching)

3. Later, UP alert #50003: "APP-SERVER (10.0.1.5) : STATE - Up"  
   (Closes #50002, which was the most recent DOWN)
```

## Configuration

### Environment Variables

No new environment variables are required. The feature uses the existing:
- `TELEGRAM_BOT_TOKEN` - Bot authentication
- `FRESHDESK_DOMAIN` - Freshdesk API endpoint
- `FRESHDESK_API_KEY` - Freshdesk authentication

### Optional: Customize Detection Patterns

To modify DOWN/UP detection logic, edit `src/services/correlation.js`:

```javascript
// Current patterns
/STATE\s*[-:]?\s*DOWN/i
/\bDOWN\b/i

// Current patterns
/STATE\s*[-:]?\s*UP/i
/\bUP\b/i
```

## Webhook Configuration in Freshdesk

Ensure your Freshdesk webhook is configured for these events:

1. **ticket.created** - Primary event for correlation logic
2. **ticket.updated** - Optional, for tracking updates
3. **ticket.solved** - Optional, for notifications

Webhook URL:
```
https://169.1.17.113:3001/webhook/freshdesk
```

## Broadcasts and Notifications

When DOWN/UP events are processed, notifications are sent to all users who have:
1. Called `/start` to register with the bot
2. Been added to `authorizedChats` set

### DOWN Alert Format
```
🔴 DOWN Alert
#<ticket_id>
<ticket_subject>
```

### UP Alert Format
```
✅ UP Alert
#<ticket_id>
<ticket_subject>

Closed: #<ticket_id1>, #<ticket_id2>, ...
```

## Troubleshooting

### Feature Not Working?

1. **Check Webhook Logs:**
   ```
   GET /webhook/logs
   ```

2. **Verify Database Initialization:**
   - Check `./data/tickets.db` exists
   - Check `src/bot.js` calls `initializeDatabase()`

3. **Check Correlation Key Extraction:**
   - Ticket subject must have `:` separator
   - Everything before `:` becomes the correlation key
   - Example: `"SERVICE-NAME : STATE - Down"` → Key is `"SERVICE-NAME "`

4. **Verify DOWN/UP Detection:**
   - Subject must contain `DOWN` or `UP` (case-insensitive)
   - Or match pattern like `STATE - DOWN` / `STATE - UP`

5. **Check Bot Logs:**
   ```
   tail -f `<bot_output_log>`
   ```
   Look for:
   - `"DOWN state detected for ticket #xxxxx"`
   - `"UP state detected for ticket #xxxxx"`
   - `"Found X DOWN ticket(s) to close"`

## Implementation Details

### Files Modified/Created

**New Files:**
- `src/services/database.js` - SQLite database management
- `src/services/correlation.js` - DOWN/UP state matching logic

**Modified Files:**
- `src/bot.js` - Added database initialization
- `src/services/freshdesk.js` - Added `closeTicket()` method
- `src/webhooks/index.js` - Added correlation logic to ticket.created handler
- `.gitignore` - Exclude database files

### Key Functions

**database.js:**
- `initializeDatabase()` - Create tables and connect to DB
- `storeDownTicket(ticketId, correlationKey, subject)` - Save DOWN ticket
- `getDownTickets(correlationKey)` - Find DOWN tickets by key
- `deleteDownTicketsByKey(correlationKey)` - Remove DOWN tickets after match

**correlation.js:**
- `extractCorrelationKey(subject)` - Extract the correlation identifier
- `isDownState(subject)` - Check if ticket is DOWN state
- `isUpState(subject)` - Check if ticket is UP state
- `handleNewTicket(ticket, freshdesk, bot, authorizedChats)` - Main logic

**freshdesk.js:**
- `closeTicket(ticketId)` - Close a ticket (sets status to 5)

## Performance Considerations

- **Database Operations:** O(1) for insertion, O(n) for correlation key lookup (n = number of stored DOWN tickets)
- **Typical Performance:** < 100ms per ticket creation event
- **Storage:** ~100 bytes per DOWN ticket in database
- **Cleanup:** DOWN ticket records are deleted from DB after UP ticket arrives

## Future Enhancements

Potential improvements:
1. Add configurable correlation patterns per customer
2. Add correlation expiry (auto-close DOWN tickets older than X hours)
3. Add correlation statistics/reporting
4. Support for multiple correation keys per subject
5. Add TTL (time-to-live) for DOWN ticket records

## Support

For issues or questions about the ticket correlation feature:
1. Check logs: `/webhook/logs`
2. Review `TROUBLESHOOTING.md`
3. Test with `/test` command in Telegram bot
4. Check Freshdesk webhook configuration
