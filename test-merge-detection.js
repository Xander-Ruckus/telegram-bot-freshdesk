import { Freshdesk } from './src/services/freshdesk.js';
import dotenv from 'dotenv';

dotenv.config();

async function testMergeDetection() {
  try {
    const fd = new Freshdesk(process.env.FRESHDESK_DOMAIN, process.env.FRESHDESK_API_KEY);
    
    // Get all tickets to find examples with Up/Down status
    const tickets = await fd.getAllTickets();
    const deviceTickets = tickets.filter(t => /STATE\s*-\s*(Up|Down)/i.test(t.subject));
    
    console.log('📊 Device Status Tickets Found:');
    console.log(`Total relevant tickets: ${deviceTickets.length}`);
    
    // Group by device name
    const deviceMap = {};
    deviceTickets.forEach(t => {
      const match = t.subject.match(/^(.+?)\s*:\s*STATE\s*-\s*(Up|Down)$/i);
      if (match) {
        const device = match[1].trim();
        const status = match[2].toLowerCase();
        if (!deviceMap[device]) deviceMap[device] = { up: [], down: [] };
        deviceMap[device][status].push({id: t.id, status: t.status});
      }
    });
    
    console.log('\n🔗 Devices with both Up and Down tickets (mergeable):');
    let mergeableCount = 0;
    for (const [device, statuses] of Object.entries(deviceMap)) {
      if (statuses.up.length > 0 && statuses.down.length > 0) {
        mergeableCount++;
        console.log(`  • ${device}:`);
        console.log(`    - Up tickets: ${statuses.up.map(t => `#${t.id}(${t.status})`).join(', ')}`);
        console.log(`    - Down tickets: ${statuses.down.map(t => `#${t.id}(${t.status})`).join(', ')}`);
      }
    }
    console.log(`\nTotal mergeable device pairs: ${mergeableCount}`);
    console.log('✅ Merge detection logic will handle these automatically when webhooks trigger');
    
  } catch (error) {
    console.error('Error:', error.message);
  }
  process.exit(0);
}

testMergeDetection();
