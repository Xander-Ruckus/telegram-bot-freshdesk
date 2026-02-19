#!/usr/bin/env node
/**
 * Test Webhook Setup
 * Verifies that the bot is ready to receive Freshdesk webhooks
 */

import 'dotenv/config.js';
import axios from 'axios';

async function testWebhookSetup() {
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║           Webhook Setup Verification                           ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log('\n');

  // Test 1: Bot server health check
  console.log('1️⃣  Bot Webhook Server Health...');
  try {
    const health = await axios.get('http://localhost:3001/webhook/health', { timeout: 5000 });
    console.log('    ✅ Server is running on port 3001');
    console.log('    Status: ' + health.data.status);
  } catch (e) {
    console.log('    ❌ Server not responding on localhost:3001');
    console.log('    Error: ' + e.message);
    console.log('\n    Make sure the bot is running:');
    console.log('    npm start');
    console.log('\n');
    return;
  }

  // Test 2: Freshdesk connectivity
  console.log('\n2️⃣  Freshdesk API Connectivity...');
  const domain = process.env.FRESHDESK_DOMAIN;
  const apiKey = process.env.FRESHDESK_API_KEY;

  if (!domain || !apiKey) {
    console.log('    ❌ Missing FRESHDESK_DOMAIN or FRESHDESK_API_KEY');
    return;
  }

  const client = axios.create({
    baseURL: 'https://' + domain + '/api/v2',
    auth: { username: apiKey, password: 'X' },
    headers: { 'Content-Type': 'application/json' }
  });

  try {
    const res = await client.get('/tickets', { params: { per_page: 1 } });
    console.log('    ✅ Connected to Freshdesk API');
    console.log('    Domain: ' + domain);
  } catch (e) {
    console.log('    ❌ Cannot connect to Freshdesk');
    console.log('    Error: ' + e.message);
    return;
  }

  // Test 3: Check existing webhooks
  console.log('\n3️⃣  Checking Existing Webhooks in Freshdesk...');
  try {
    const webhooksRes = await client.get('/webhooks');
    const webhooks = Array.isArray(webhooksRes.data) 
      ? webhooksRes.data 
      : (webhooksRes.data.webhooks || []);
    
    console.log('    Found ' + webhooks.length + ' webhook(s) configured:\n');
    
    webhooks.forEach((w, i) => {
      console.log('    [' + (i+1) + '] ' + w.url);
      if (w.events) {
        console.log('        Events: ' + w.events.join(', '));
      }
      console.log('        Active: ' + (w.active ? '✅ Yes' : '❌ No'));
    });

    const hasDownUpWebhook = webhooks.some(w => 
      w.url.includes('169.1.17.113:3001')
    );

    if (!hasDownUpWebhook) {
      console.log('\n    ⚠️  No webhook found for 169.1.17.113:3001');
      console.log('    You NEED to add one for DOWN/UP correlation to work!');
    } else {
      console.log('\n    ✅ Webhook for bot is configured');
    }
  } catch (e) {
    // Webhooks endpoint might require special permissions
    if (e.response?.status === 403) {
      console.log('    ℹ️  Cannot list webhooks (requires admin permissions)');
    } else {
      console.log('    Error checking webhooks: ' + e.message);
    }
  }

  // Test 4: Show what needs to be configured
  console.log('\n4️⃣  Required Webhook Configuration:\n');
  console.log('    URL: https://169.1.17.113:3001/webhook/freshdesk');
  console.log('    Events to enable:');
  console.log('      • ticket.created (REQUIRED)');
  console.log('      • ticket.updated (recommended)');
  console.log('    Authentication: API Key (any value)');

  // Test 5: Show recent tickets
  console.log('\n5️⃣  Recent Tickets (to test webhook firing):\n');
  try {
    const ticketsRes = await client.get('/tickets', { params: { per_page: 5 } });
    const tickets = Array.isArray(ticketsRes.data) 
      ? ticketsRes.data 
      : (ticketsRes.data.tickets || []);

    tickets.forEach((t, i) => {
      console.log('    [' + (i+1) + '] #' + t.id + ' - ' + t.subject);
    });

    console.log('\n    → Create a new ticket in Freshdesk to trigger webhook');
    console.log('    → Bot should log the received event');
    console.log('    → Check bot console for: "Webhook received: ticket.created"');
  } catch (e) {
    console.log('    Error fetching tickets: ' + e.message);
  }

  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║                    Setup Checklist                             ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log('\n');
  console.log('Before DOWN/UP correlation works:');
  console.log('\n  1. ✅ Bot running locally (npm start)');
  console.log('     OR running on server (https://169.1.17.113:3001)');
  console.log('\n  2. ⚠️  CONFIGURE THIS WEBHOOK IN FRESHDESK ADMIN:');
  console.log('     URL: https://169.1.17.113:3001/webhook/freshdesk');
  console.log('     Events: ticket.created, ticket.updated');
  console.log('\n  3. 🧪 Test by creating a DOWN ticket');
  console.log('     Then create an UP ticket with matching key');
  console.log('     DOWN ticket should auto-close with comment');
  console.log('\n');
}

testWebhookSetup().catch(e => {
  console.error('Test failed:', e.message);
  process.exit(1);
});
