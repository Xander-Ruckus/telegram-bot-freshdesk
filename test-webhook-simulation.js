#!/usr/bin/env node
/**
 * Webhook Simulation Test
 * Simulates Freshdesk webhook events to test DOWN/UP auto-closure logic
 */

import 'dotenv/config.js';
import axios from 'axios';
import * as database from './src/services/database.js';
import { Freshdesk } from './src/services/freshdesk.js';
import * as correlation from './src/services/correlation.js';
import { logger } from './src/utils/logger.js';

async function testWebhookSimulation() {
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║         Webhook Simulation - DOWN/UP Auto-Close Test          ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log('\n');

  // Initialize database
  console.log('1️⃣  Initializing database...');
  try {
    await database.initializeDatabase();
    console.log('    ✅ Database initialized\n');
  } catch (e) {
    console.log('    ❌ Error:', e.message);
    return;
  }

  // Create Freshdesk client
  console.log('2️⃣  Setting up Freshdesk API client...');
  const freshdesk = new Freshdesk(process.env.FRESHDESK_DOMAIN, process.env.FRESHDESK_API_KEY);
  
  try {
    const status = await freshdesk.getStatus();
    if (!status.connected) {
      console.log('    ❌ Cannot connect to Freshdesk');
      return;
    }
    console.log('    ✅ Connected to Freshdesk\n');
  } catch (e) {
    console.log('    ❌ Error:', e.message);
    return;
  }

  // Get recent tickets for testing
  console.log('3️⃣  Fetching recent tickets...');
  try {
    const ticketsRes = await freshdesk.client.get('/tickets', { params: { per_page: 50 } });
    const allTickets = Array.isArray(ticketsRes.data) ? ticketsRes.data : (ticketsRes.data.tickets || []);
    
    // Find DOWN and UP tickets
    const downTickets = allTickets.filter(t => correlation.isDownState(t.subject));
    const upTickets = allTickets.filter(t => correlation.isUpState(t.subject));
    
    console.log('    ✅ Found ' + allTickets.length + ' total tickets');
    console.log('       • DOWN tickets: ' + downTickets.length);
    console.log('       • UP tickets: ' + upTickets.length + '\n');

    // Find correlations
    console.log('4️⃣  Analyzing correlations...');
    const correlations = [];
    
    upTickets.forEach(upTicket => {
      const upKey = correlation.extractCorrelationKey(upTicket.subject);
      const matchingDowns = downTickets.filter(downTicket => {
        const downKey = correlation.extractCorrelationKey(downTicket.subject);
        return downKey === upKey;
      });
      
      if (matchingDowns.length > 0) {
        correlations.push({
          up: upTicket,
          downs: matchingDowns,
          key: upKey
        });
      }
    });

    console.log('    ✅ Found ' + correlations.length + ' potential matches\n');

    if (correlations.length === 0) {
      console.log('    ℹ️  No matching DOWN/UP pairs found for testing\n');
      return;
    }

    // Test the first correlation
    const testCorr = correlations[0];
    console.log('5️⃣  Testing auto-close logic with real data:');
    console.log('    UP Ticket: #' + testCorr.up.id + ' - ' + testCorr.up.subject);
    console.log('    DOWN Tickets:');
    testCorr.downs.forEach(d => {
      console.log('      • #' + d.id + ' - ' + d.subject);
    });
    console.log('    Correlation Key: ' + testCorr.key + '\n');

    // Simulate the webhook event
    console.log('6️⃣  Simulating webhook for UP ticket #' + testCorr.up.id + '...');
    try {
      const mockBot = {
        telegram: {
          sendMessage: async (chatId, message) => {
            console.log('    📢 [MOCK BOT] Would send: ' + message.substring(0, 50) + '...');
          }
        }
      };

      const authorizedChats = []; // Empty - we're just testing the correlation logic

      // Call the correlation handler (simulating what the webhook would do)
      await correlation.handleNewTicket(testCorr.up, freshdesk, mockBot, authorizedChats);
      
      console.log('    ✅ Correlation handler executed\n');

      // Check if DOWN tickets were closed
      console.log('7️⃣  Verifying DOWN ticket closure...');
      let closedCount = 0;
      
      for (const downTicket of testCorr.downs) {
        try {
          const ticketRes = await freshdesk.client.get('/tickets/' + downTicket.id);
          const ticket = ticketRes.data?.ticket || ticketRes.data;
          const isClosed = ticket.status === 5;
          
          console.log('    • #' + downTicket.id + ' status: ' + ticket.status + ' (' + 
            (isClosed ? '✅ CLOSED' : '⚠️  OPEN') + ')');
          
          if (isClosed) {
            closedCount++;
            
            // Check for closure comment
            try {
              const convsRes = await freshdesk.client.get('/tickets/' + downTicket.id + '/conversations');
              const convs = Array.isArray(convsRes.data) ? convsRes.data : (convsRes.data.conversations || []);
              const hasClosureComment = convs.some(c => c.body_text && c.body_text.includes('[AUTOMATED]'));
              
              if (hasClosureComment) {
                console.log('       └─ ✅ Closure comment found');
              }
            } catch (e) {
              // Ignore conversation errors
            }
          }
        } catch (e) {
          console.log('    • #' + downTicket.id + ' - Error checking: ' + e.message);
        }
      }

      console.log('\n    Summary: ' + closedCount + '/' + testCorr.downs.length + ' DOWN tickets closed\n');

      if (closedCount === testCorr.downs.length) {
        console.log('╔════════════════════════════════════════════════════════════════╗');
        console.log('║  ✅ SUCCESS - Auto-close logic is WORKING CORRECTLY!           ║');
        console.log('╚════════════════════════════════════════════════════════════════╝');
        console.log('\nIssue: The webhook might not be configured correctly in Freshdesk.');
        console.log('Check:');
        console.log('  1. Admin → Automation → Webhooks');
        console.log('  2. URL: https://169.1.17.113:3001/webhook/freshdesk');
        console.log('  3. Events: ticket.created ✓ and ticket.updated ✓');
        console.log('  4. Status: ACTIVE ✓');
      } else if (closedCount === 0) {
        console.log('╔════════════════════════════════════════════════════════════════╗');
        console.log('║  ❌ FAILURE - Down tickets were NOT closed                     ║');
        console.log('╚════════════════════════════════════════════════════════════════╝');
        console.log('\nPossible issues:');
        console.log('  1. Check bot console for errors');
        console.log('  2. Verify correlation.js handleNewTicket() is executing');
        console.log('  3. Check freshdesk.closeTicket() method');
        console.log('  4. Make sure bot has edit permissions on tickets');
      } else {
        console.log('╔════════════════════════════════════════════════════════════════╗');
        console.log('║  ⚠️  PARTIAL - Some down tickets closed, some did not          ║');
        console.log('╚════════════════════════════════════════════════════════════════╝');
      }

    } catch (e) {
      console.log('    ❌ Error during correlation test: ' + e.message);
      console.log('    Stack: ' + e.stack);
    }

  } catch (e) {
    console.log('    ❌ Error: ' + e.message);
  }

  console.log('\n');
  process.exit(0);
}

testWebhookSimulation().catch(e => {
  console.error('Test failed:', e.message);
  process.exit(1);
});
