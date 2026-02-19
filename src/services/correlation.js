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
      
      // Find DOWN tickets from TWO sources:
      // 1. From database (DOWN tickets created after system started)
      // 2. From Freshdesk search (handles pre-existing DOWN tickets)
      
      const downTicketsFromDb = await database.getDownTickets(correlationKey);
      logger.info(`Found ${downTicketsFromDb.length} DOWN ticket(s) from database`);

      // Search Freshdesk for all DOWN tickets with matching key
      let downTicketsFromFreshdesk = [];
      try {
        const ticketsRes = await freshdesk.client.get('/tickets', { params: { per_page: 100 } });
        const allTickets = Array.isArray(ticketsRes.data) ? ticketsRes.data : (ticketsRes.data.tickets || []);
        
        // Find DOWN tickets with matching correlation key that are still open
        downTicketsFromFreshdesk = allTickets.filter(t => {
          const tCorrelationKey = extractCorrelationKey(t.subject);
          const isDown = isDownState(t.subject);
          const isOpen = t.status !== 5 && t.status !== 4; // Not closed or resolved
          return tCorrelationKey === correlationKey && isDown && isOpen;
        });
        
        logger.info(`Found ${downTicketsFromFreshdesk.length} DOWN ticket(s) from Freshdesk search`);
      } catch (err) {
        logger.error(`Error searching Freshdesk for DOWN tickets:`, err.message);
      }

      // Merge and deduplicate
      const ticketIdsToClose = new Set();
      
      downTicketsFromDb.forEach(dt => ticketIdsToClose.add(dt.ticket_id));
      downTicketsFromFreshdesk.forEach(t => ticketIdsToClose.add(t.id));

      if (ticketIdsToClose.size === 0) {
        logger.info(`No DOWN tickets found for correlation key: "${correlationKey}"`);
        return;
      }

      logger.info(`Found ${ticketIdsToClose.size} total DOWN ticket(s) to close`);

      // Close all DOWN tickets with reason
      const closedTicketIds = [];
      for (const downTicketId of ticketIdsToClose) {
        try {
          const reason = `Service is UP - Closed by automatic correlation with ticket #${ticketId}`;
          await freshdesk.closeTicket(downTicketId, reason);
          logger.info(`Closed DOWN ticket #${downTicketId}`);
          closedTicketIds.push(downTicketId);
        } catch (err) {
          logger.error(`Failed to close DOWN ticket #${downTicketId}:`, err.message);
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
