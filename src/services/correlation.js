import { logger } from '../utils/logger.js';
import * as database from './database.js';

/**
 * Extract correlation key from ticket subject.
 * Extracts everything before the colon (:)
 * Example: "H\/R\/AP-35 (10.0.2.155) [10.0.2.155] : STATE - Down" 
 * Returns: "H\/R\/AP-35 (10.0.2.155) [10.0.2.155]"
 */
export function extractCorrelationKey(subject) {
  if (!subject) return null;
  const match = subject.match(/^(.+?)(?:\s*:\s*|$)/);
  if (match && match[1]) {
    return match[1].trim();
  }
  return null;
}

/**
 * Check if subject contains DOWN state
 */
export function isDownState(subject) {
  if (!subject) return false;
  return /STATE\s*[-:]?\s*DOWN/i.test(subject) || /\bDOWN\b/i.test(subject);
}

/**
 * Check if subject contains UP state
 */
export function isUpState(subject) {
  if (!subject) return false;
  return /STATE\s*[-:]?\s*UP/i.test(subject) || /\bUP\b/i.test(subject);
}

/**
 * Handle new ticket - check if it's DOWN or UP state
 * If DOWN: store in database
 * If UP: find matching DOWN tickets and close them
 */
export async function handleNewTicket(ticket, freshdesk, bot, authorizedChats) {
  try {
    const subject = ticket.subject || '';
    const ticketId = ticket.id;

    logger.info(`Processing new ticket #${ticketId}: "${subject}"`);

    const correlationKey = extractCorrelationKey(subject);
    if (!correlationKey) {
      logger.debug(`No correlation key found for ticket #${ticketId}`);
      return;
    }

    logger.info(`Correlation key: "${correlationKey}"`);

    if (isDownState(subject)) {
      logger.info(`DOWN state detected for ticket #${ticketId}`);
      await database.storeDownTicket(ticketId, correlationKey, subject);
      
      // Broadcast to users
      const message = `🔴 DOWN Alert\n#${ticketId}\n${subject}`;
      await broadcastToUsers(bot, message, authorizedChats);
    } 
    else if (isUpState(subject)) {
      logger.info(`UP state detected for ticket #${ticketId}`);
      
      // Find all DOWN tickets with this correlation key
      const downTickets = await database.getDownTickets(correlationKey);
      
      if (downTickets.length === 0) {
        logger.info(`No DOWN tickets found for correlation key: "${correlationKey}"`);
        return;
      }

      logger.info(`Found ${downTickets.length} DOWN ticket(s) to close`);

      // Close all DOWN tickets with reason
      const closedTicketIds = [];
      for (const downTicket of downTickets) {
        try {
          const reason = `Service is UP - Closed by automatic correlation with ticket #${ticketId}`;
          await freshdesk.closeTicket(downTicket.ticket_id, reason);
          logger.info(`Closed DOWN ticket #${downTicket.ticket_id}`);
          closedTicketIds.push(downTicket.ticket_id);
        } catch (err) {
          logger.error(`Failed to close DOWN ticket #${downTicket.ticket_id}:`, err.message);
        }
      }

      // Remove from database
      await database.deleteDownTicketsByKey(correlationKey);

      // Broadcast to users
      const closedList = closedTicketIds.map(id => `#${id}`).join(', ');
      const message = `✅ UP Alert\n#${ticketId}\n${subject}\n\nClosed: ${closedList}`;
      await broadcastToUsers(bot, message, authorizedChats);
    }
  } catch (err) {
    logger.error('Error handling new ticket:', err);
  }
}

/**
 * Broadcast message to all registered users
 */
export async function broadcastToUsers(bot, message, authorizedChats) {
  if (!bot || !authorizedChats || authorizedChats.size === 0) {
    logger.warn('Cannot broadcast: bot or authorizedChats not available');
    return;
  }

  for (const chatId of authorizedChats) {
    try {
      await bot.telegram.sendMessage(chatId, message);
    } catch (err) {
      logger.error(`Failed to send message to chat ${chatId}:`, err.message);
    }
  }
}
