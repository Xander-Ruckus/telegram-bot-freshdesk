import { Freshdesk } from './src/services/freshdesk.js';
import dotenv from 'dotenv';

dotenv.config();

async function checkTicketStatuses() {
  try {
    const fd = new Freshdesk(process.env.FRESHDESK_DOMAIN, process.env.FRESHDESK_API_KEY);
    
    const tickets = await fd.getAllTickets();
    
    // Group by status code
    const statusGroups = {};
    tickets.forEach(t => {
      const status = t.status;
      if (!statusGroups[status]) statusGroups[status] = 0;
      statusGroups[status]++;
    });
    
    console.log('\n📊 Ticket Status Distribution:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const statusNames = {
      2: 'Open',
      3: 'Pending',
      4: 'On Hold',
      5: 'Resolved',
      6: 'Closed'
    };
    
    for (const [status, count] of Object.entries(statusGroups).sort()) {
      const name = statusNames[status] || 'Unknown';
      console.log(`Status ${status} (${name}): ${count} tickets`);
    }
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    // Show sample tickets from each status
    console.log('📋 Sample tickets:');
    for (const status of Object.keys(statusGroups).sort()) {
      const sample = tickets.find(t => t.status == status);
      if (sample) {
        console.log(`  Status ${status}: #${sample.id} - ${sample.subject.substring(0, 60)}`);
      }
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  }
  process.exit(0);
}

checkTicketStatuses();
