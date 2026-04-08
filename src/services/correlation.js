import { logger } from '../utils/logger.js';
import * as database from './database.js';

/**
 * Extract correlation key from ticket subject.
 *
 * Supported formats:
 *   1. "DEVICE (IP) [RMON] [IP] : STATE - Down"
 *      → key = everything before the colon
 *   2. "[Site - Provider - Type] [? Down] PING …"  /  "[Site - Provider - Type] [✅ Up]"
 *      → key = first bracket group, e.g. "Marara Pharmacy - Comsol - MezoCore"
 *   3. Fallback: everything before the colon (original behaviour)
 */
export function extractCorrelationKey(subject) {
  if (!subject) return null;

  // Format 2 – bracketed site identifier followed by a status bracket
  //   e.g. "[Marara Pharmacy - Comsol - MezoCore] [? Down] …"
  //   e.g. "[Marara Pharmacy - Comsol - MezoCore] [✅ Up]"
  const bracketMatch = subject.match(/^\[([^\]]+)\]\s*\[/);
  if (bracketMatch) {
    return bracketMatch[1].trim();
  }

  // Format 1 / 3 – everything before the first colon
  const colonMatch = subject.match(/^(.+?)(?:\s*:\s*|$)/);
  if (colonMatch && colonMatch[1]) {
    return colonMatch[1].trim();
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

function getState(subject) {
  if (isDownState(subject)) return 'down';
  if (isUpState(subject)) return 'up';
  return null;
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
      return null;
    }

    logger.info(`Correlation key: "${correlationKey}"`);

    const ticketState = getState(subject);

    if (ticketState === 'down') {
      logger.info(`DOWN state detected for ticket #${ticketId}`);
      await database.storeDownTicket(ticketId, correlationKey, subject);
      
      // Broadcast to users
      const message = `🔴 DOWN Alert\n#${ticketId}\n${subject}`;
      await broadcastToUsers(bot, message, authorizedChats);
      return {
        state: 'down',
        correlationKey,
        closedTicketIds: []
      };
    } 
    else if (ticketState === 'up') {
      logger.info(`UP state detected for ticket #${ticketId}`);
      
      const downTicketsFromDb = await database.getDownTickets(correlationKey);
      logger.info(`Found ${downTicketsFromDb.length} DOWN ticket(s) from database`);

      // Search across all tickets so correlation still works after restarts
      // and for older DOWN tickets outside the first page of Freshdesk results.
      let downTicketsFromFreshdesk = [];
      try {
        const allTickets = await freshdesk.getAllTickets();
        
        // Find DOWN tickets with matching correlation key that are still open
        downTicketsFromFreshdesk = allTickets.filter(t => {
          const tCorrelationKey = extractCorrelationKey(t.subject);
          const isOpen = t.status !== 'Closed' && t.status !== 'Resolved';
          return t.id !== ticketId &&
            tCorrelationKey === correlationKey &&
            getState(t.subject) === 'down' &&
            isOpen;
        });
        
        logger.info(`Found ${downTicketsFromFreshdesk.length} DOWN ticket(s) from Freshdesk search`);
      } catch (err) {
        logger.error(`Error searching Freshdesk for DOWN tickets:`, err.message);
      }

      // Merge and deduplicate while keeping track of DB-backed tickets so only
      // successful closures are removed from the retry queue.
      const ticketsToClose = new Map();
      
      downTicketsFromDb.forEach((downTicket) => {
        ticketsToClose.set(downTicket.ticket_id, {
          ticketId: downTicket.ticket_id,
          subject: downTicket.subject,
          status: 'Unknown',
          fromDatabase: true,
        });
      });
      downTicketsFromFreshdesk.forEach((downTicket) => {
        const existing = ticketsToClose.get(downTicket.id);
        ticketsToClose.set(downTicket.id, {
          ticketId: downTicket.id,
          subject: downTicket.subject,
          status: downTicket.status,
          fromDatabase: existing?.fromDatabase || false,
        });
      });

      if (ticketsToClose.size === 0) {
        logger.info(`No DOWN tickets found for correlation key: "${correlationKey}"`);
        return {
          state: 'up',
          correlationKey,
          closedTicketIds: []
        };
      }

      logger.info(`Found ${ticketsToClose.size} total DOWN ticket(s) to close`);

      const closedTicketIds = [];
      for (const downTicket of ticketsToClose.values()) {
        try {
          const downTicketId = downTicket.ticketId;
          const reason = `Service is UP - Closed by automatic correlation with ticket #${ticketId}`;
          await freshdesk.closeTicket(downTicketId, reason);

          try {
            await freshdesk.addTicketNote(
              downTicketId,
              `🔗 AUTO-CORRELATED: Automatically closed after matching UP ticket #${ticketId} was created.`,
              true
            );
          } catch (noteError) {
            logger.warn(`Failed to add correlation note to DOWN ticket #${downTicketId}:`, noteError.message);
          }

          if (downTicket.fromDatabase) {
            await database.deleteDownTicket(downTicketId);
          }

          logger.info(`Closed DOWN ticket #${downTicketId}`);
          closedTicketIds.push(downTicketId);
        } catch (err) {
          logger.error(`Failed to close DOWN ticket #${downTicketId}:`, err.message);
        }
      }

      if (closedTicketIds.length > 0) {
        try {
          const relatedList = closedTicketIds.map(id => `#${id}`).join(', ');
          await freshdesk.addTicketNote(
            ticketId,
            `🔗 AUTO-CORRELATED: Matching DOWN ticket(s) ${relatedList} were closed automatically for this UP event.`,
            true
          );
        } catch (noteError) {
          logger.warn(`Failed to add correlation note to UP ticket #${ticketId}:`, noteError.message);
        }
      }

      // Close the UP ticket itself
      try {
        await freshdesk.addTicketNote(ticketId, 'Auto close', true);
        await freshdesk.closeTicket(ticketId, 'Auto close');
        logger.info(`Closed UP ticket #${ticketId}`);
      } catch (upCloseErr) {
        logger.error(`Failed to close UP ticket #${ticketId}:`, upCloseErr.message);
      }

      // Broadcast to users
      const closedList = closedTicketIds.map(id => `#${id}`).join(', ');
      const downPart = closedTicketIds.length > 0 ? `\nClosed DOWN: ${closedList}` : '';
      const message = `✅ UP Alert\n#${ticketId} (closed)\n${subject}${downPart}`;
      await broadcastToUsers(bot, message, authorizedChats);

      return {
        state: 'up',
        correlationKey,
        closedTicketIds,
      };
    }

    return null;
  } catch (err) {
    logger.error('Error handling new ticket:', err);
    return null;
  }
}

/**
 * Periodic reconciliation: pull all open tickets from Freshdesk,
 * find DOWN tickets that already have a matching UP ticket, and close them.
 * Designed to run on a timer (e.g. every 15 minutes).
 */
export async function reconcileOpenTickets(freshdesk, bot, authorizedChats) {
  try {
    logger.info('⏱️  Reconciliation: scanning Freshdesk for unresolved DOWN/UP pairs...');

    const allTickets = await freshdesk.getAllTickets();

    // Only consider open tickets (not Closed / Resolved)
    const openTickets = allTickets.filter(
      t => t.status !== 'Closed' && t.status !== 'Resolved'
    );

    // Bucket open tickets by correlation key + state
    const byKey = new Map(); // key → { down: [ticket…], up: [ticket…] }

    for (const ticket of openTickets) {
      const key = extractCorrelationKey(ticket.subject);
      const state = getState(ticket.subject);
      if (!key || !state) continue;

      if (!byKey.has(key)) byKey.set(key, { down: [], up: [] });
      byKey.get(key)[state].push(ticket);
    }

    let totalClosed = 0;
    const closedPairs = [];

    for (const [key, bucket] of byKey) {
      if (bucket.down.length === 0 || bucket.up.length === 0) continue;

      // Sort UP tickets newest-first so the link references the latest one
      const newestUp = bucket.up.sort(
        (a, b) => new Date(b.created_at) - new Date(a.created_at)
      )[0];

      for (const downTicket of bucket.down) {
        // Only close DOWN tickets created before the UP ticket
        if (new Date(downTicket.created_at) >= new Date(newestUp.created_at)) continue;

        try {
          const reason = `Service is UP – auto-closed by periodic reconciliation (matching UP ticket #${newestUp.id})`;
          await freshdesk.closeTicket(downTicket.id, reason);

          try {
            await freshdesk.addTicketNote(
              downTicket.id,
              `🔗 AUTO-RECONCILED: Closed by scheduled scan. Matching UP ticket #${newestUp.id} already exists.`,
              true
            );
          } catch (_) { /* note is best-effort */ }

          // Remove from local DB if present
          try { await database.deleteDownTicket(downTicket.id); } catch (_) {}

          totalClosed++;
          closedPairs.push({ downId: downTicket.id, upId: newestUp.id, key });
          logger.info(`Reconciliation: closed DOWN #${downTicket.id} (matched UP #${newestUp.id})`);
        } catch (err) {
          logger.error(`Reconciliation: failed to close DOWN #${downTicket.id}:`, err.message);
        }
      }
    }

    if (totalClosed > 0) {
      const summary = closedPairs
        .map(p => `#${p.downId} → UP #${p.upId}`)
        .join('\n');

      // Close the UP tickets that had matching DOWN tickets
      const upGroups = new Map();
      for (const p of closedPairs) {
        if (!upGroups.has(p.upId)) upGroups.set(p.upId, []);
        upGroups.get(p.upId).push(p.downId);
      }
      const closedUpIds = [];
      for (const [upId, downIds] of upGroups) {
        try {
          const list = downIds.map(id => `#${id}`).join(', ');
          await freshdesk.addTicketNote(
            upId,
            `🔗 AUTO-RECONCILED: Matching DOWN ticket(s) ${list} were closed by scheduled scan.`,
            true
          );
          await freshdesk.addTicketNote(upId, 'Auto close', true);
          await freshdesk.closeTicket(upId, 'Auto close');
          closedUpIds.push(upId);
          logger.info(`Reconciliation: closed paired UP #${upId}`);
        } catch (e) {
          logger.error(`Reconciliation: failed to close UP #${upId}:`, e.message);
        }
      }

      // Also close any remaining standalone UP tickets (no matching open DOWN)
      const alreadyClosed = new Set(closedUpIds);
      for (const [, bucket] of byKey) {
        for (const upTicket of bucket.up) {
          if (alreadyClosed.has(upTicket.id)) continue;
          try {
            await freshdesk.addTicketNote(upTicket.id, 'Auto close', true);
            await freshdesk.closeTicket(upTicket.id, 'Auto close');
            closedUpIds.push(upTicket.id);
            logger.info(`Reconciliation: closed standalone UP #${upTicket.id}`);
          } catch (e) {
            logger.error(`Reconciliation: failed to close standalone UP #${upTicket.id}:`, e.message);
          }
        }
      }

      const upSummary = closedUpIds.length > 0 ? `\nClosed ${closedUpIds.length} UP ticket(s): ${closedUpIds.map(id => `#${id}`).join(', ')}` : '';
      const message = `🔄 Reconciliation complete\n\nClosed ${totalClosed} DOWN ticket(s):\n${summary}${upSummary}`;
      await broadcastToUsers(bot, message, authorizedChats);
    } else {
      // No DOWN/UP pairs found, but still close any standalone open UP tickets
      const closedUpIds = [];
      for (const [, bucket] of byKey) {
        for (const upTicket of bucket.up) {
          try {
            await freshdesk.addTicketNote(upTicket.id, 'Auto close', true);
            await freshdesk.closeTicket(upTicket.id, 'Auto close');
            closedUpIds.push(upTicket.id);
            logger.info(`Reconciliation: closed standalone UP #${upTicket.id}`);
          } catch (e) {
            logger.error(`Reconciliation: failed to close standalone UP #${upTicket.id}:`, e.message);
          }
        }
      }

      const openDown = [...byKey.values()].reduce((n, b) => n + b.down.length, 0);
      if (closedUpIds.length > 0) {
        const message = `🔄 Reconciliation complete\n\nClosed ${closedUpIds.length} UP ticket(s): ${closedUpIds.map(id => `#${id}`).join(', ')}\n\nOpen DOWN tickets: ${openDown}`;
        await broadcastToUsers(bot, message, authorizedChats);
      } else {
        logger.info('Reconciliation: no unresolved DOWN/UP pairs found.');
        const openUp = [...byKey.values()].reduce((n, b) => n + b.up.length, 0);
        const message = `🔄 Scheduled scan complete\n\n✅ No action needed.\n\nOpen state tickets: ${openDown} DOWN, ${openUp} UP`;
        await broadcastToUsers(bot, message, authorizedChats);
      }
    }

    return { totalClosed, closedPairs };
  } catch (err) {
    logger.error('Reconciliation error:', err);
    return { totalClosed: 0, closedPairs: [] };
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
