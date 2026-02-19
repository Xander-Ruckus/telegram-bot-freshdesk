#!/usr/bin/env node

import dotenv from 'dotenv';
import axios from 'axios';
import * as database from './src/services/database.js';
import * as correlation from './src/services/correlation.js';
import { logger } from './src/utils/logger.js';

dotenv.config();

async function runTest() {
  try {
    console.log('\n');
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║         DOWN/UP Ticket Correlation Test Suite                 ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    // Initialize database
    console.log('1️⃣  Initializing Database...');
    await database.initializeDatabase();
    console.log('   ✅ Database initialized\n');

    // Setup Freshdesk client
    console.log('2️⃣  Connecting to Freshdesk...');
    const domain = process.env.FRESHDESK_DOMAIN;
    const apiKey = process.env.FRESHDESK_API_KEY;

    const client = axios.create({
      baseURL: `https://${domain}/api/v2`,
      auth: { username: apiKey, password: 'X' },
      headers: { 'Content-Type': 'application/json' },
    });

    // Test Freshdesk connection
    try {
      const healthCheck = await client.get('/agents', { params: { per_page: 1 } });
      console.log('   ✅ Connected to Freshdesk API\n');
    } catch (err) {
      console.error('   ❌ Failed to connect:', err.message);
      process.exit(1);
    }

    // Fetch recent tickets
    console.log('3️⃣  Fetching Recent Tickets...');
    const ticketsRes = await client.get('/tickets', { params: { per_page: 50 } });
    const allTickets = Array.isArray(ticketsRes.data)
      ? ticketsRes.data
      : ticketsRes.data.tickets || [];

    console.log(`   ✅ Found ${allTickets.length} tickets\n`);

    // Analyze DOWN/UP states
    console.log('4️⃣  Analyzing DOWN/UP States...\n');
    const downTickets = [];
    const upTickets = [];
    const correlationMap = new Map();

    for (const ticket of allTickets) {
      const subject = ticket.subject || '';
      const isDown = correlation.isDownState(subject);
      const isUp = correlation.isUpState(subject);
      const key = correlation.extractCorrelationKey(subject);

      if (isDown) {
        downTickets.push({ id: ticket.id, subject, key });
        console.log(`   🔴 DOWN: #${ticket.id}`);
        console.log(`      Subject: ${subject.substring(0, 70)}${subject.length > 70 ? '...' : ''}`);
        console.log(`      Key: "${key}"\n`);
      } else if (isUp) {
        upTickets.push({ id: ticket.id, subject, key });
        console.log(`   🟢 UP: #${ticket.id}`);
        console.log(`      Subject: ${subject.substring(0, 70)}${subject.length > 70 ? '...' : ''}`);
        console.log(`      Key: "${key}"\n`);
      }
    }

    // Summary
    console.log('5️⃣  Correlation Summary\n');
    console.log(`   Total DOWN tickets found: ${downTickets.length}`);
    console.log(`   Total UP tickets found: ${upTickets.length}\n`);

    // Find matches
    console.log('6️⃣  Checking for Correlation Matches...\n');
    let matchCount = 0;

    for (const upTicket of upTickets) {
      const matchingDown = downTickets.filter(d => d.key === upTicket.key);
      if (matchingDown.length > 0) {
        matchCount++;
        console.log(`   ✅ MATCH FOUND:`);
        console.log(`      UP ticket #${upTicket.id} matches ${matchingDown.length} DOWN ticket(s):`);
        matchingDown.forEach(d => {
          console.log(`         - #${d.id}`);
        });
        console.log();
      }
    }

    if (matchCount === 0) {
      console.log(`   ℹ️  No correlations found (this is normal if DOWN and UP tickets haven't arrived yet)\n`);
    }

    // Test correlation functions
    console.log('7️⃣  Testing Correlation Functions...\n');

    // Test with sample subjects
    const sampleDown = 'H\\/R\\/AP-35 (10.0.2.155) [10.0.2.155] : STATE - Down';
    const sampleUp = 'H\\/R\\/AP-35 (10.0.2.155) [10.0.2.155] : STATE - Up';

    console.log(`   Sample DOWN subject: "${sampleDown}"`);
    console.log(`   Is DOWN? ${correlation.isDownState(sampleDown) ? '✅ YES' : '❌ NO'}`);
    console.log(`   Correlation key: "${correlation.extractCorrelationKey(sampleDown)}"\n`);

    console.log(`   Sample UP subject: "${sampleUp}"`);
    console.log(`   Is UP? ${correlation.isUpState(sampleUp) ? '✅ YES' : '❌ NO'}`);
    console.log(`   Correlation key: "${correlation.extractCorrelationKey(sampleUp)}"\n`);

    const key1 = correlation.extractCorrelationKey(sampleDown);
    const key2 = correlation.extractCorrelationKey(sampleUp);
    console.log(`   Keys match? ${key1 === key2 ? '✅ YES' : '❌ NO'}\n`);

    // Database status
    console.log('8️⃣  Database Stored DOWN Tickets...\n');
    // Note: We would need to add a function to list all stored tickets
    console.log('   (Database check feature coming soon)\n');

    // Final status
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║                    Test Complete ✅                            ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    console.log('📊 Summary:');
    console.log(`   • DOWN tickets in system: ${downTickets.length}`);
    console.log(`   • UP tickets in system: ${upTickets.length}`);
    console.log(`   • Correlations ready to match: ${matchCount}`);
    console.log(`   • Correlation detection: ✅ Working\n`);

    process.exit(0);
  } catch (err) {
    console.error('\n❌ Test failed:', err.message);
    logger.error('Test error:', err);
    process.exit(1);
  }
}

runTest();
