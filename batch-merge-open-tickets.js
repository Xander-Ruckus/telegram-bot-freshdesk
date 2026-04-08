import { Freshdesk } from './src/services/freshdesk.js';
import dotenv from 'dotenv';

dotenv.config();

// Rate limiting: wait between requests
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function batchMergeOpenTickets() {
  try {
    const fd = new Freshdesk(process.env.FRESHDESK_DOMAIN, process.env.FRESHDESK_API_KEY);
    
    console.log('📊 Fetching all tickets once (caching for batch operation)...');
    const allTickets = await fd.getAllTickets();
    console.log(`✅ Loaded ${allTickets.length} tickets into memory\n`);
    
    // Filter for open tickets only
    const openTickets = allTickets.filter(t => t.status === 'Open' || t.status === 2);
    
    console.log(`📋 Found ${allTickets.length} total tickets`);
    console.log(`🟢 Found ${openTickets.length} OPEN tickets to process\n`);
    
    // Filter for device status tickets
    const deviceTickets = openTickets.filter(t => /STATE\s*-\s*(Up|Down)/i.test(t.subject));
    
    console.log(`⚙️  ${deviceTickets.length} of those are device status tickets\n`);
    
    // Group by device name to find mergeable pairs
    const deviceMap = {};
    deviceTickets.forEach(t => {
      const match = t.subject.match(/^(.+?)\s*:\s*STATE\s*-\s*(Up|Down)$/i);
      if (match) {
        const device = match[1].trim();
        const status = match[2].toLowerCase();
        if (!deviceMap[device]) deviceMap[device] = { up: [], down: [] };
        deviceMap[device][status].push(t);
      }
    });
    
    // Find devices with BOTH up and down open tickets
    let mergeCount = 0;
    let successCount = 0;
    let errorCount = 0;
    const mergedTickets = [];
    
    console.log('🔄 Processing mergeable open ticket pairs...\n');
    
    for (const [device, statuses] of Object.entries(deviceMap)) {
      if (statuses.up.length > 0 && statuses.down.length > 0) {
        console.log(`📱 ${device}:`);
        
        const upTicket = statuses.up[0];
        const downTicket = statuses.down[0];
        
        const upTime = new Date(upTicket.created_at).getTime();
        const downTime = new Date(downTicket.created_at).getTime();
        
        // Merge newer ticket into older one
        let newTicketId, oldTicketId, newTicketSubject;
        
        if (upTime > downTime) {
          newTicketId = upTicket.id;
          oldTicketId = downTicket.id;
          newTicketSubject = upTicket.subject;
          console.log(`   Merging newer Up #${newTicketId} → Down #${oldTicketId}`);
        } else {
          newTicketId = downTicket.id;
          oldTicketId = upTicket.id;
          newTicketSubject = downTicket.subject;
          console.log(`   Merging newer Down #${newTicketId} → Up #${oldTicketId}`);
        }
        
        try {
          // Extract device name from subject
          const deviceMatch = newTicketSubject.match(/^(.+?)\s*:\s*STATE\s*-\s*(Up|Down)$/i);
          if (!deviceMatch) {
            throw new Error('Could not parse device name from subject');
          }
          
          const deviceName = deviceMatch[1].trim();
          const currentStatus = deviceMatch[2].toLowerCase();
          const previousStatus = currentStatus === 'up' ? 'down' : 'up';
          
          // Close the old ticket
          console.log(`   → Closing ticket #${oldTicketId}...`);
          await fd.updateTicketStatus(oldTicketId, 'closed');
          
          await sleep(300); // Small delay between API calls
          
          // Add merge notes to both tickets
          const mergeNote = `🔗 AUTO-MERGED: This ticket was auto-merged with #${newTicketId} (Device status changed from ${previousStatus} to ${currentStatus})`;
          console.log(`   → Adding link notes...`);
          await fd.addTicketNote(newTicketId, mergeNote, true);
          
          await sleep(300);
          
          const oldTicketNote = `🔗 AUTO-MERGED: This ${previousStatus.toUpperCase()} status ticket was closed and merged with #${newTicketId} (Current status: ${currentStatus.toUpperCase()})`;
          await fd.addTicketNote(oldTicketId, oldTicketNote, true);
          
          successCount++;
          mergedTickets.push({
            deviceName,
            newTicketId,
            mergedTicketId: oldTicketId,
            previousStatus
          });
          
          console.log(`   ✅ Success: Closed #${oldTicketId}, linked to #${newTicketId}`);
        } catch (err) {
          errorCount++;
          console.log(`   ❌ Error: ${err.message}`);
        }
        
        mergeCount++;
        await sleep(1000); // Rate limiting: 1000ms between merge operations
      }
    }
    
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📈 BATCH MERGE SUMMARY`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`Device pairs processed: ${mergeCount}`);
    console.log(`✅ Successful merges: ${successCount}`);
    console.log(`❌ Failed merges: ${errorCount}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
    
    if (mergedTickets.length > 0) {
      console.log('🔗 Merged Tickets:');
      mergedTickets.forEach(m => {
        console.log(`   • ${m.deviceName}: Closed #${m.mergedTicketId} → Linked to #${m.newTicketId}`);
      });
    }
    
  } catch (error) {
    console.error('Fatal error:', error.message);
    process.exit(1);
  }
  
  process.exit(0);
}

batchMergeOpenTickets();
