import { logger } from '../utils/logger.js';
import * as correlation from '../services/correlation.js';

export async function setupWebhooks(app, bot, freshdesk, userSettings, loggerInstance, authorizedChats) {
  /**
   * Freshdesk webhook endpoint
   * Receives notifications from Freshdesk about ticket events
   */
  app.post('/webhook/freshdesk', async (req, res) => {
    try {
      const event = req.body;
      loggerInstance.info('Received Freshdesk webhook:', { event_type: event.event_type });

      if (!event.event_type) {
        return res.status(400).json({ error: 'Missing event_type' });
      }

      await handleFresheskEvent(event, bot, freshdesk, userSettings, loggerInstance, authorizedChats);
      res.json({ success: true });
    } catch (error) {
      loggerInstance.error('Webhook processing error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * Health check endpoint
   */
  app.get('/webhook/health', (req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
  });

  /**
   * Get webhook logs (for debugging)
   */
  const webhookLogs = [];
  
  app.get('/webhook/logs', (req, res) => {
    const limit = parseInt(req.query.limit) || 20;
    res.json(webhookLogs.slice(-limit));
  });
}

/**
 * Handle Freshdesk events
 */
async function handleFresheskEvent(event, bot, freshdesk, userSettings, loggerInstance, authorizedChats) {
  const eventHandlers = {
    'ticket.created': handleTicketCreated,
    'ticket.updated': handleTicketUpdated,
    'ticket.solved': handleTicketSolved,
    'ticket.reopened': handleTicketReopened,
    'conversation.created': handleConversationCreated,
  };

  const handler = eventHandlers[event.event_type];
  
  if (handler) {
    await handler(event, bot, freshdesk, userSettings, loggerInstance, authorizedChats);
  } else {
    loggerInstance.warn(`Unhandled event type: ${event.event_type}`);
  }
}

/**
 * Handle ticket.created event
 */
async function handleTicketCreated(event, bot, freshdesk, userSettings, loggerInstance, authorizedChats) {
  try {
    const ticketId = event.ticket_id;
    const ticket = await freshdesk.getTicket(ticketId);

    // Handle ticket correlation (DOWN/UP state matching)
    await correlation.handleNewTicket(ticket, freshdesk, bot, authorizedChats);

    const message = `
📌 New Ticket Created

#${ticket.id}: ${ticket.subject}
Priority: ${getPriorityEmoji(ticket.priority)} ${ticket.priority}
Status: ${ticket.status}
Customer: ${ticket.customer_email}
Created: ${new Date(ticket.created_at).toLocaleString()}
    `;

    await broadcastToUsers(bot, message, userSettings, authorizedChats, loggerInstance);
    loggerInstance.info(`Notification sent for new ticket #${ticketId}`);
  } catch (error) {
    loggerInstance.error('Error handling ticket created event:', error);
  }
}

/**
 * Handle ticket.updated event
 */
async function handleTicketUpdated(event, bot, freshdesk, userSettings, loggerInstance, authorizedChats) {
  try {
    const ticketId = event.ticket_id;
    const ticket = await freshdesk.getTicket(ticketId);

    // Check what changed
    const changes = event.changes || {};
    let changeDescription = '';

    if (changes.priority) {
      changeDescription += `Priority changed: ${changes.priority[0]} → ${changes.priority[1]}\n`;
    }
    if (changes.status) {
      changeDescription += `Status changed: ${changes.status[0]} → ${changes.status[1]}\n`;
    }
    if (changes.responder_id) {
      changeDescription += `Assigned to new agent\n`;
    }

    if (!changeDescription) {
      changeDescription = 'Ticket was updated';
    }

    const message = `
🔄 Ticket Updated

#${ticket.id}: ${ticket.subject}
${changeDescription}
Status: ${ticket.status}
Priority: ${getPriorityEmoji(ticket.priority)} ${ticket.priority}
    `;

    await broadcastToUsers(bot, message, userSettings, authorizedChats, loggerInstance);
    loggerInstance.info(`Notification sent for ticket update #${ticketId}`);
  } catch (error) {
    loggerInstance.error('Error handling ticket updated event:', error);
  }
}

/**
 * Handle ticket.solved event
 */
async function handleTicketSolved(event, bot, freshdesk, userSettings, loggerInstance, authorizedChats) {
  try {
    const ticketId = event.ticket_id;
    const ticket = await freshdesk.getTicket(ticketId);

    const message = `
✅ Ticket Resolved

#${ticket.id}: ${ticket.subject}
Priority: ${getPriorityEmoji(ticket.priority)} ${ticket.priority}
Resolved at: ${new Date(ticket.updated_at).toLocaleString()}
    `;

    await broadcastToUsers(bot, message, userSettings, authorizedChats, loggerInstance);
    loggerInstance.info(`Notification sent for resolved ticket #${ticketId}`);
  } catch (error) {
    loggerInstance.error('Error handling ticket solved event:', error);
  }
}

/**
 * Handle ticket.reopened event
 */
async function handleTicketReopened(event, bot, freshdesk, userSettings, loggerInstance, authorizedChats) {
  try {
    const ticketId = event.ticket_id;
    const ticket = await freshdesk.getTicket(ticketId);

    const message = `
🔓 Ticket Reopened

#${ticket.id}: ${ticket.subject}
Priority: ${getPriorityEmoji(ticket.priority)} ${ticket.priority}
Status: ${ticket.status}
Reopened at: ${new Date(ticket.updated_at).toLocaleString()}
    `;

    await broadcastToUsers(bot, message, userSettings, authorizedChats, loggerInstance);
    loggerInstance.info(`Notification sent for reopened ticket #${ticketId}`);
  } catch (error) {
    loggerInstance.error('Error handling ticket reopened event:', error);
  }
}

/**
 * Handle conversation.created event
 */
async function handleConversationCreated(event, bot, freshdesk, userSettings, loggerInstance, authorizedChats) {
  try {
    const ticketId = event.ticket_id;
    const ticket = await freshdesk.getTicket(ticketId);

    const message = `
💬 New Comment

#${ticket.id}: ${ticket.subject}
Priority: ${getPriorityEmoji(ticket.priority)} ${ticket.priority}
Status: ${ticket.status}
Comment added at: ${new Date().toLocaleString()}
    `;

    await broadcastToUsers(bot, message, userSettings, authorizedChats, loggerInstance);
    loggerInstance.info(`Notification sent for new comment on ticket #${ticketId}`);
  } catch (error) {
    loggerInstance.error('Error handling conversation created event:', error);
  }
}

/**
 * Broadcast message to all authorized chats  */
async function broadcastToUsers(bot, message, userSettings, authorizedChats, loggerInstance) {
  const successCount = { value: 0 };
  const failureCount = { value: 0 };

  // Use authorizedChats if available, otherwise fall back to userSettings
  const chatsToNotify = authorizedChats && authorizedChats.size > 0 ? authorizedChats : userSettings.keys();

  for (const chatId of chatsToNotify) {
    try {
      await bot.telegram.sendMessage(chatId, message);
      successCount.value++;
    } catch (error) {
      loggerInstance.warn(`Failed to send message to chat ${chatId}:`, error.message);
      failureCount.value++;
    }
  }

  loggerInstance.info(`Broadcast complete: ${successCount.value} successful, ${failureCount.value} failed`);
}

/**
 * Get priority emoji
 */
function getPriorityEmoji(priority) {
  const emojiMap = {
    'Low': '🟢',
    'Medium': '🟡',
    'High': '🔴',
    'Urgent': '⚠️',
  };
  return emojiMap[priority] || '❓';
}
