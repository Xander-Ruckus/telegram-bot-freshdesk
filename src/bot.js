import { Telegraf, Markup } from 'telegraf';
import express from 'express';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { Freshdesk } from './services/freshdesk.js';
import { setupWebhooks } from './webhooks/index.js';
import { logger } from './utils/logger.js';
import { initializeDatabase } from './services/database.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialize bot
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// Initialize Freshdesk service
const freshdesk = new Freshdesk(
  process.env.FRESHDESK_DOMAIN,
  process.env.FRESHDESK_API_KEY
);

// Initialize Express server
const app = express();
const webhookPort = process.env.WEBHOOK_PORT || 3000;

app.use(bodyParser.json());

// Store user settings (in production, use a database)
const userSettings = new Map();

// Track current ticket being viewed per user (for updates)
const userCurrentTicket = new Map();

// Store authorized chat IDs for broadcasting (persistent across sessions)
const authorizedChats = new Set();

// Store search results for users (for bulk operations)
const userSearchResults = new Map();

// Store selected tickets for users (for bulk closing)
const userSelectedTickets = new Map();

// Store pending close operations awaiting agent selection
const userPendingCloseOps = new Map();

// ============ BOT COMMANDS ============

bot.command('start', async (ctx) => {
  const chatId = ctx.chat.id;
  const userId = ctx.from.id;
  
  // Initialize user settings
  if (!userSettings.has(userId)) {
    userSettings.set(userId, {
      notifications: true,
      filter_status: [],
      filter_priority: [],
    });
  }
  
  // Add to authorized chats for notifications
  authorizedChats.add(chatId);

  const welcomeMessage = `
🎉 Welcome to Fresh Note Bot!

I'm your Freshdesk notification assistant. I'll send you real-time updates about:
• New tickets
• Ticket updates
• Assigned tickets
• Status changes

Use /help to see all available commands.
  `;

  await ctx.reply(welcomeMessage, Markup.keyboard([
    ['/help', '/settings'],
    ['/status', '/tickets'],
  ]).resize());
  
  logger.info(`✅ User ${userId} (Chat ${chatId}) started bot and registered for notifications`);
});

bot.command('help', async (ctx) => {
  const helpMessage = `
📚 Available Commands:

/start - Start the bot (register for notifications)
/help - Show this help menu
/status - Check bot and Freshdesk status
/tickets - Get all tickets
/open - Show only OPEN/PENDING tickets
/search <keyword> - Find open tickets by keyword
/closeall "<keyword>" - Close all tickets matching keyword
/agents - List active agents
/test - Send test notification

🎯 UPDATE TICKETS BY NUMBER:

Simply send a ticket number to view and update it:
  123            → View ticket #123

Update by replying with:
  status resolved    (open/pending/resolved/closed)
  priority high      (low/medium/high/urgent)
  note Your text     (add private note)
  comment Message    (add public comment)

🔄 BULK OPERATIONS:

/search "outage"       → Find all open tickets with "outage"
/closeall "outage"     → Close all tickets matching "outage"

🔔 Notifications:
Receive automatic updates about:
• New tickets created
• Ticket updates and comments
• Status changes
• Agent assignments

⚙️ Need help?
Contact your Freshdesk administrator
  `;

  await ctx.reply(helpMessage);
});

bot.command('status', async (ctx) => {
  try {
    const freshdesk_status = await freshdesk.getStatus();
    
    const statusMessage = `
✅ Bot Status

Telegram Bot: 🟢 Connected
Freshdesk API: ${freshdesk_status.connected ? '🟢' : '🔴'} ${freshdesk_status.connected ? 'Connected' : 'Disconnected'}

Uptime: ${process.uptime().toFixed(0)}s
Bot Version: 1.0.0
    `;

    await ctx.reply(statusMessage);
  } catch (error) {
    logger.error('Status check error:', error);
    await ctx.reply('❌ Error checking status. Please try again later.');
  }
});

bot.command('settings', async (ctx) => {
  const userId = ctx.from.id;
  const settings = userSettings.get(userId) || {};

  const settingsMessage = `
⚙️ Notification Settings

Current Preferences:
• Notifications: ${settings.notifications ? '✅' : '❌'}
• Filter by Status: ${settings.filter_status.length > 0 ? settings.filter_status.join(', ') : 'All'}
• Filter by Priority: ${settings.filter_priority.length > 0 ? settings.filter_priority.join(', ') : 'All'}

To modify settings, contact your administrator.
  `;

  await ctx.reply(settingsMessage);
});

bot.command('tickets', async (ctx) => {
  try {
    await ctx.reply('⏳ Fetching all tickets (this may take a moment)...');
    
    // Fetch all tickets across all pages via pagination
    const allTickets = await freshdesk.getAllTickets();
    
    // Filter by status - show Open, Pending, On Hold tickets
    const openTickets = allTickets.filter(t => 
      t.status.toLowerCase() !== 'closed' && 
      t.status.toLowerCase() !== 'resolved'
    );
    
    if (allTickets.length === 0) {
      await ctx.reply('No tickets found.');
      return;
    }

    // Send summary first
    let summary = `📋 All Tickets (Total: ${allTickets.length})\n`;
    summary += `Open: ${openTickets.length} | `;
    const closedCount = allTickets.length - openTickets.length;
    summary += `Closed: ${closedCount}\n`;
    await ctx.reply(summary);
    
    // Split messages to respect Telegram's 4096 char limit
    const messages = [];
    let currentMessage = `<b>All Tickets:</b>\n\n`;
    const messageLimit = 3800; // Leave room for safety
    
    allTickets.forEach((ticket, index) => {
      const statusEmoji = ticket.status.toLowerCase().includes('open') || 
                         ticket.status.toLowerCase().includes('pending') ? '🔴' : '✅';
      const truncatedSubject = ticket.subject.substring(0, 50) + (ticket.subject.length > 50 ? '...' : '');
      const ticketLine = `${statusEmoji} #${ticket.id} - ${truncatedSubject}\n   Status: ${ticket.status} | Priority: ${ticket.priority}\n`;
      
      // If adding this ticket would exceed limit, push current message and start new one
      if ((currentMessage + ticketLine).length > messageLimit && currentMessage !== `<b>All Tickets:</b>\n\n`) {
        messages.push(currentMessage);
        currentMessage = `--- Continued ---\n\n${ticketLine}`;
      } else {
        currentMessage += ticketLine;
      }
    });
    
    // Push the last message
    if (currentMessage.length > 0) {
      messages.push(currentMessage);
    }
    
    // Send all messages with HTML parsing
    for (const msg of messages) {
      await ctx.reply(msg, { parse_mode: 'HTML' });
    }
  } catch (error) {
    logger.error('Tickets fetch error:', error);
    await ctx.reply('❌ Error fetching tickets. Please try again later.');
  }
});

bot.command('open', async (ctx) => {
  try {
    await ctx.reply('⏳ Fetching open tickets...');
    
    const allTickets = await freshdesk.getAllTickets();
    
    // Filter for open/pending tickets only
    const openTickets = allTickets.filter(t => 
      t.status.toLowerCase() !== 'closed' && 
      t.status.toLowerCase() !== 'resolved'
    );
    
    if (openTickets.length === 0) {
      await ctx.reply('✅ No open tickets! All tickets are resolved.');
      return;
    }

    // Split message to respect Telegram's 4096 char limit
    const messages = [];
    let currentMessage = `🔴 OPEN TICKETS (${openTickets.length} total)\n\n`;
    const messageLimit = 3800; // Leave room for safety
    
    openTickets.forEach((ticket, index) => {
      const ticketLine = `${index + 1}. #${ticket.id} - ${ticket.subject.substring(0, 50)}${ticket.subject.length > 50 ? '...' : ''}\n   Status: ${ticket.status} | Priority: ${ticket.priority}\n`;
      
      // If adding this ticket would exceed limit, push current message and start new one
      if ((currentMessage + ticketLine).length > messageLimit && currentMessage !== `🔴 OPEN TICKETS (${openTickets.length} total)\n\n`) {
        messages.push(currentMessage);
        currentMessage = `--- Continued ---\n\n${ticketLine}`;
      } else {
        currentMessage += ticketLine;
      }
    });
    
    // Push the last message
    if (currentMessage.length > 0) {
      messages.push(currentMessage);
    }
    
    // Send all messages
    for (const msg of messages) {
      await ctx.reply(msg);
    }
  } catch (error) {
    logger.error('Open tickets fetch error:', error);
    await ctx.reply('❌ Error fetching open tickets. Please try again later.');
  }
});

bot.command('test', async (ctx) => {
  try {
    const testMessage = `
🧪 TEST NOTIFICATION

This is a test notification from the Telegram Bot.
If you received this message, notifications are working!

Webhook URL: https://169.1.17.113:3001/webhook/freshdesk
Status: ✅ Ready to receive Freshdesk events

Next step: Create a ticket in Freshdesk to test webhook integration.
    `;
    
    await ctx.reply(testMessage);
    logger.info(`Test notification sent to user ${ctx.from.id}`);
  } catch (error) {
    logger.error('Test notification error:', error);
    await ctx.reply('❌ Error sending test notification.');
  }
});

bot.command('debug', async (ctx) => {
  try {
    await ctx.reply('🔍 Checking Freshdesk connection and available tickets...');
    
    const allTickets = await freshdesk.getRecentTickets(100);
    
    if (allTickets.length === 0) {
      await ctx.reply('⚠️ No tickets found in Freshdesk.');
      return;
    }
    
    let debugMessage = `✅ Found ${allTickets.length} tickets\n\n`;
    debugMessage += `First 10 ticket IDs:\n`;
    
    allTickets.slice(0, 10).forEach((t, i) => {
      debugMessage += `${i+1}. #${t.id} - ${t.subject}\n`;
    });
    
    debugMessage += `\n📝 Try looking up one of these tickets by sending its ID (e.g., send the number without #)`;
    
    await ctx.reply(debugMessage);
  } catch (error) {
    logger.error('Debug error:', error);
    await ctx.reply(`❌ Debug error: ${error.message}`);
  }
});

bot.command('agents', async (ctx) => {
  try {
    ctx.reply('⏳ Fetching agents...');
    
    const agents = await freshdesk.getAgents();
    
    if (agents.length === 0) {
      await ctx.reply('No agents found.');
      return;
    }

    let agentsMessage = '👥 Active Agents:\n\n';
    
    agents.forEach((agent, index) => {
      agentsMessage += `${index + 1}. ${agent.name}\n`;
      agentsMessage += `   Email: ${agent.email}\n\n`;
    });

    await ctx.reply(agentsMessage);
  } catch (error) {
    logger.error('Agents fetch error:', error);
    await ctx.reply('❌ Error fetching agents. Please try again later.');
  }
});

bot.command('search', async (ctx) => {
  try {
    const userId = ctx.from.id;
    const keyword = ctx.message.text.split('/search ')[1]?.trim();
    
    if (!keyword) {
      await ctx.reply('📌 Usage: /search <keyword>\n\nExample: /search "network outage"');
      return;
    }
    
    await ctx.reply(`🔍 Searching for open tickets with keyword: "${keyword}"...`);
    
    const allTickets = await freshdesk.getAllTickets();
    
    // Filter for open/pending tickets matching the keyword (case-insensitive)
    const matchingTickets = allTickets.filter(t => {
      const isOpen = t.status.toLowerCase() !== 'closed' && t.status.toLowerCase() !== 'resolved';
      const matchesKeyword = t.subject.toLowerCase().includes(keyword.toLowerCase());
      return isOpen && matchesKeyword;
    });
    
    if (matchingTickets.length === 0) {
      await ctx.reply(`❌ No open tickets found matching "${keyword}". Try a different keyword.`);
      userSearchResults.delete(userId);
      return;
    }
    
    // Store results for bulk operations
    userSearchResults.set(userId, {
      keyword: keyword,
      tickets: matchingTickets,
      timestamp: Date.now()
    });
    
    // Send results in chunks to avoid message size limits
    let message = `🎯 Found ${matchingTickets.length} open ticket(s) matching "${keyword}":\n\n`;
    const messageLimit = 3800;
    const messages = [];
    
    matchingTickets.forEach((ticket, index) => {
      const ticketLine = `${index + 1}. #${ticket.id} - ${ticket.subject.substring(0, 50)}${ticket.subject.length > 50 ? '...' : ''}\n   Status: ${ticket.status} | Priority: ${ticket.priority}\n`;
      
      if ((message + ticketLine).length > messageLimit && message !== `🎯 Found ${matchingTickets.length} open ticket(s) matching "${keyword}":\n\n`) {
        messages.push(message);
        message = `--- Continued ---\n\n${ticketLine}`;
      } else {
        message += ticketLine;
      }
    });
    
    if (message.length > 0) {
      messages.push(message);
    }
    
    for (const msg of messages) {
      await ctx.reply(msg);
    }
    
    // Send options
    await ctx.reply(
      `📋 Options:\n/closeall "${keyword}" - Close all ${matchingTickets.length} tickets\n/details <ticket_id> - View specific ticket details`,
      Markup.keyboard([
        [`/closeall "${keyword}"`],
        ['/search', '/open'],
      ]).resize()
    );
    
    logger.info(`User ${userId} searched for tickets with keyword: "${keyword}" (found ${matchingTickets.length})`);
  } catch (error) {
    logger.error('Search error:', error);
    await ctx.reply('❌ Error searching tickets. Please try again later.');
  }
});

bot.command('closeall', async (ctx) => {
  try {
    const userId = ctx.from.id;
    const keyword = ctx.message.text.split('/closeall ')[1]?.trim().replace(/"/g, '');
    
    if (!keyword) {
      await ctx.reply('📌 Usage: /closeall "<keyword>"\n\nExample: /closeall "network outage"');
      return;
    }
    
    const searchResults = userSearchResults.get(userId);
    
    if (!searchResults || searchResults.keyword !== keyword) {
      await ctx.reply(`⚠️ No search results found for "${keyword}". Please run /search "<keyword>" first.`);
      return;
    }
    
    const ticketsToClose = searchResults.tickets;
    
    if (ticketsToClose.length === 0) {
      await ctx.reply('❌ No tickets to close.');
      return;
    }
    
    // Confirmation message
    await ctx.reply(
      `⚠️ About to close ${ticketsToClose.length} ticket(s):\n\n${ticketsToClose.map(t => `#${t.id}: ${t.subject.substring(0, 40)}`).join('\n')}\n\nClick "Confirm Close All" to proceed or "Cancel" to abort.`,
      Markup.inlineKeyboard([
        [Markup.button.callback('✅ Confirm Close All', `closeall_confirm_${userId}`)],
        [Markup.button.callback('❌ Cancel', `closeall_cancel_${userId}`)],
      ])
    );
    
    logger.info(`User ${userId} initiated bulk close for ${ticketsToClose.length} tickets`);
  } catch (error) {
    logger.error('Closeall command error:', error);
    await ctx.reply('❌ Error closing tickets. Please try again later.');
  }
});

// Handle confirmation callbacks
bot.action(/closeall_confirm_(\d+)/, async (ctx) => {
  try {
    const userId = parseInt(ctx.match[1]);
    const searchResults = userSearchResults.get(userId);
    
    if (!searchResults) {
      await ctx.answerCbQuery('❌ Search results expired. Please search again.');
      return;
    }
    
    const ticketsToClose = searchResults.tickets;
    await ctx.editMessageText(`🔄 Fetching agents...`);
    
    // Fetch available agents
    let agents = [];
    try {
      agents = await freshdesk.getAgents();
    } catch (error) {
      logger.error('Error fetching agents:', error.message);
      await ctx.editMessageText('❌ Error fetching agents. Please try again.');
      return;
    }
    
    if (agents.length === 0) {
      await ctx.editMessageText('❌ No agents available. Cannot proceed with close.');
      return;
    }
    
    // Store the pending operation
    userPendingCloseOps.set(userId, {
      tickets: ticketsToClose,
      keyword: searchResults.keyword,
      agents: agents,
      timestamp: Date.now()
    });
    
    // Show agent selection
    const agentButtons = agents.map(agent => 
      [Markup.button.callback(`${agent.name}`, `select_agent_${userId}_${agent.id}`)]
    );
    
    await ctx.editMessageText(
      `👤 Select an agent to assign these ${ticketsToClose.length} ticket(s) to:\n\n${agents.map((a, i) => `${i+1}. ${a.name} (${a.email})`).join('\n')}`,
      Markup.inlineKeyboard(agentButtons)
    );
    
  } catch (error) {
    logger.error('Closeall confirmation error:', error);
    await ctx.editMessageText('❌ Error processing close request.');
  }
});

bot.action(/closeall_cancel_(\d+)/, async (ctx) => {
  try {
    const userId = parseInt(ctx.match[1]);
    await ctx.editMessageText('❌ Bulk close cancelled.');
    logger.info(`User ${userId} cancelled bulk close operation`);
  } catch (error) {
    logger.error('Closeall cancel error:', error);
  }
});

// Handle agent selection for bulk close
bot.action(/^select_agent_(\d+)_(\d+)$/, async (ctx) => {
  try {
    const userId = parseInt(ctx.match[1]);
    const agentId = parseInt(ctx.match[2]);
    
    const pendingOp = userPendingCloseOps.get(userId);
    
    if (!pendingOp) {
      await ctx.answerCbQuery('❌ Operation expired. Please search again.');
      return;
    }

    if (!pendingOp.tickets) {
      await ctx.answerCbQuery('❌ This is not a bulk operation.');
      return;
    }
    
    const ticketsToClose = pendingOp.tickets;
    const selectedAgent = pendingOp.agents.find(a => a.id === agentId);
    
    if (!selectedAgent) {
      await ctx.answerCbQuery('❌ Agent not found.');
      return;
    }
    
    await ctx.editMessageText(`🔄 Closing ${ticketsToClose.length} ticket(s) and assigning to ${selectedAgent.name}...`);
    
    let closedCount = 0;
    let failedCount = 0;
    const failedTickets = [];
    
    // Close each ticket and assign to agent
    for (const ticket of ticketsToClose) {
      try {
        await freshdesk.closeAndAssignTicket(ticket.id, agentId);
        closedCount++;
        logger.info(`Bulk close: Ticket #${ticket.id} closed and assigned to agent ${selectedAgent.name}`);
      } catch (error) {
        failedCount++;
        failedTickets.push(`#${ticket.id}: ${error.message}`);
        logger.error(`Bulk close error for ticket #${ticket.id}:`, error.message);
      }
    }
    
    // Send result summary
    let resultMessage = `✅ Bulk Close Completed\n\n`;
    resultMessage += `Successfully closed: ${closedCount}/${ticketsToClose.length}\n`;
    resultMessage += `Assigned to: ${selectedAgent.name}\n`;
    
    if (failedCount > 0) {
      resultMessage += `Failed: ${failedCount}\n\n`;
      resultMessage += `Failed tickets:\n${failedTickets.join('\n')}`;
    }
    
    await ctx.editMessageText(resultMessage);
    
    // Clear operations
    userSearchResults.delete(userId);
    userPendingCloseOps.delete(userId);
    
    logger.info(`User ${userId} completed bulk close: ${closedCount} closed to ${selectedAgent.name}, ${failedCount} failed`);
  } catch (error) {
    logger.error('Bulk agent selection error:', error);
    await ctx.editMessageText('❌ Error closing tickets.');
  }
});

// Handle agent selection for individual ticket close
bot.action(/^close_ticket_select_agent_(\d+)_(\d+)$/, async (ctx) => {
  try {
    const userId = parseInt(ctx.match[1]);
    const agentId = parseInt(ctx.match[2]);
    
    const pendingOp = userPendingCloseOps.get(userId);
    
    if (!pendingOp || !pendingOp.ticketId) {
      await ctx.answerCbQuery('❌ Operation expired.');
      return;
    }
    
    const ticketId = pendingOp.ticketId;
    const selectedAgent = pendingOp.agents.find(a => a.id === agentId);
    
    if (!selectedAgent) {
      await ctx.answerCbQuery('❌ Agent not found.');
      return;
    }
    
    await ctx.editMessageText(`🔄 Closing ticket #${ticketId} and assigning to ${selectedAgent.name}...`);
    
    try {
      await freshdesk.closeAndAssignTicket(ticketId, agentId);
      
      await ctx.editMessageText(
        `✅ Ticket #${ticketId} closed and assigned to ${selectedAgent.name}`
      );
      
      logger.info(`User ${userId} closed ticket #${ticketId} and assigned to agent ${selectedAgent.name}`);
    } catch (error) {
      await ctx.editMessageText(`❌ Error closing ticket: ${error.message}`);
      logger.error(`Error closing ticket #${ticketId}:`, error.message);
    }
    
    // Clear operation
    userPendingCloseOps.delete(userId);
  } catch (error) {
    logger.error('Individual ticket close action error:', error);
    await ctx.editMessageText('❌ Error closing ticket.');
  }
});

// Handle text messages
bot.on('text', async (ctx) => {
  const text = ctx.message.text;
  const userId = ctx.from.id;

  // Check for update commands FIRST (before checking for ticket numbers)
  // These commands don't contain numbers
  if (text.toLowerCase().startsWith('status ')) {
    const currentTicketId = userCurrentTicket.get(userId);
    if (!currentTicketId) {
      await ctx.reply('❌ No ticket selected. Please send a ticket number first (e.g., 41305)');
      return;
    }
    
    const status = text.split('status ')[1]?.trim();
    if (status) {
      // If closing a ticket, require agent assignment
      if (status.toLowerCase() === 'closed') {
        try {
          const agents = await freshdesk.getAgents();
          
          if (agents.length === 0) {
            await ctx.reply('❌ No agents available. Cannot close ticket.');
            return;
          }
          
          // Store pending close operation
          userPendingCloseOps.set(userId, {
            ticketId: currentTicketId,
            agents: agents,
            timestamp: Date.now()
          });
          
          // Show agent selection
          const agentButtons = agents.map(agent =>
            [Markup.button.callback(`${agent.name}`, `close_ticket_select_agent_${userId}_${agent.id}`)]
          );
          
          await ctx.reply(
            `👤 Select an agent to assign ticket #${currentTicketId} to when closing:\n\n${agents.map((a, i) => `${i+1}. ${a.name} (${a.email})`).join('\n')}`,
            Markup.inlineKeyboard(agentButtons)
          );
          
          logger.info(`User ${userId} initiated close for ticket #${currentTicketId}, awaiting agent selection`);
        } catch (error) {
          await ctx.reply(`❌ Error fetching agents: ${error.message}`);
        }
        return;
      }
      
      // For other status updates (not close), just update directly
      try {
        await freshdesk.updateTicketStatus(currentTicketId, status);
        await ctx.reply(`✅ Ticket #${currentTicketId} status updated to "${status}"`);
        logger.info(`User ${userId} updated ticket #${currentTicketId} status to ${status}`);
      } catch (error) {
        await ctx.reply(`❌ Error updating ticket status: ${error.message}`);
      }
    }
    return;
  }
  
  if (text.toLowerCase().startsWith('priority ')) {
    const currentTicketId = userCurrentTicket.get(userId);
    if (!currentTicketId) {
      await ctx.reply('❌ No ticket selected. Please send a ticket number first (e.g., 41305)');
      return;
    }
    
    const priority = text.split('priority ')[1]?.trim();
    if (priority) {
      try {
        await freshdesk.updateTicketPriority(currentTicketId, priority);
        await ctx.reply(`✅ Ticket #${currentTicketId} priority updated to "${priority}"`);
        logger.info(`User ${userId} updated ticket #${currentTicketId} priority to ${priority}`);
      } catch (error) {
        await ctx.reply(`❌ Error updating priority: ${error.message}`);
      }
    }
    return;
  }
  
  if (text.toLowerCase().startsWith('note ')) {
    const currentTicketId = userCurrentTicket.get(userId);
    if (!currentTicketId) {
      await ctx.reply('❌ No ticket selected. Please send a ticket number first (e.g., 41305)');
      return;
    }
    
    const note = text.split('note ')[1]?.trim();
    if (note) {
      try {
        await freshdesk.addTicketNote(currentTicketId, note, true);
        await ctx.reply(`✅ Note added to ticket #${currentTicketId}`);
        logger.info(`User ${userId} added note to ticket #${currentTicketId}`);
      } catch (error) {
        await ctx.reply(`❌ Error adding note: ${error.message}`);
      }
    }
    return;
  }
  
  if (text.toLowerCase().startsWith('comment ')) {
    const currentTicketId = userCurrentTicket.get(userId);
    if (!currentTicketId) {
      await ctx.reply('❌ No ticket selected. Please send a ticket number first (e.g., 41305)');
      return;
    }
    
    const comment = text.split('comment ')[1]?.trim();
    if (comment) {
      try {
        await freshdesk.addTicketReply(currentTicketId, comment);
        await ctx.reply(`✅ Comment added to ticket #${currentTicketId}`);
        logger.info(`User ${userId} added comment to ticket #${currentTicketId}`);
      } catch (error) {
        await ctx.reply(`❌ Error adding comment: ${error.message}`);
      }
    }
    return;
  }

  // NOW check if message contains a ticket number
  const ticketMatch = text.match(/#?(\d+)/);
  
  if (ticketMatch) {
    const ticketId = parseInt(ticketMatch[1]);
    
    // If message is just a number, show ticket details and update options
    if (text.trim() === ticketMatch[0] || text.toLowerCase().trim() === `#${ticketId}`) {
      try {
        const ticket = await freshdesk.getTicket(ticketId);
        
        // Store this ticket as the user's current ticket for updates
        userCurrentTicket.set(userId, ticketId);
        
        const ticketMessage = `
📋 Ticket #${ticket.id}

Subject: ${ticket.subject}
Status: ${ticket.status}
Priority: ${ticket.priority}
Created: ${new Date(ticket.created_at).toLocaleString()}

🔧 Update this ticket by replying with:
• status open/pending/resolved/closed
• priority low/medium/high/urgent
• note Your note here
• comment Your comment here

Examples:
  status resolved
  priority high
  note Updated by bot
        `;
        
        await ctx.reply(ticketMessage, Markup.keyboard([
          ['status open', 'status pending'],
          ['status resolved', 'status closed'],
          ['priority low', 'priority high'],
          ['Back to menu'],
        ]).resize());
        
      } catch (error) {
        logger.error('Error fetching ticket:', error);
        // Provide more specific error message
        if (error.response?.status === 404) {
          await ctx.reply(`❌ Ticket #${ticketId} not found in Freshdesk.\n\nTry /tickets to see all available tickets.`);
        } else if (error.response?.status === 401) {
          await ctx.reply(`❌ Authentication error. Please check Freshdesk API key.`);
        } else {
          await ctx.reply(`❌ Error fetching ticket #${ticketId}: ${error.message}\n\nTry /tickets to see all available tickets.`);
        }
      }
      return;
    }
  }

  // Default text response
  if (text.toLowerCase().includes('help')) {
    return ctx.reply('Use /help to see available commands.');
  }
  
  if (text.toLowerCase() === 'back to menu') {
    return ctx.reply('🏠 Main Menu', Markup.keyboard([
      ['/help', '/status'],
      ['/tickets', '/open'],
      ['/agents'],
    ]).resize());
  }

  await ctx.reply('💡 Quick tips:\n• Send a ticket number (e.g., "123" or "#123") to view and update it\n• Use /help for all commands\n\n📝 Or type a command like:\n  status resolved\n  priority high\n  note Your note here');
});

// ============ ERROR HANDLING ============

bot.catch((err, ctx) => {
  logger.error('Bot error:', err);
  ctx.reply('❌ An error occurred. Please try again later.').catch(err => {
    logger.error('Error sending error message:', err);
  });
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// ============ INITIALIZATION ============

async function startBot() {
  try {
    // Initialize database for ticket correlation
    logger.info('Initializing database...');
    await initializeDatabase();
    logger.info('✅ Database initialized');

    // Setup webhooks
    setupWebhooks(app, bot, freshdesk, userSettings, logger, authorizedChats);

    // Start server
    const server = app.listen(webhookPort, () => {
      logger.info(`✅ Webhook server running on port ${webhookPort}`);
      logger.info(`✅ Telegram bot @${process.env.TELEGRAM_BOT_USERNAME} started`);
    });

    // Launch bot
    await bot.launch();
    logger.info('🤖 Bot successfully launched');

    // Graceful shutdown
    process.once('SIGINT', () => {
      logger.info('SIGINT received, shutting down...');
      server.close();
      bot.stop('SIGINT');
    });

    process.once('SIGTERM', () => {
      logger.info('SIGTERM received, shutting down...');
      server.close();
      bot.stop('SIGTERM');
    });
  } catch (err) {
    logger.error('Failed to start bot:', err);
    process.exit(1);
  }
}

startBot();

export { bot, freshdesk, app };
