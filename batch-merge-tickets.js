import { Freshdesk } from './src/services/freshdesk.js';
import dotenv from 'dotenv';

dotenv.config();

// Helper to add delay between requests to avoid rate limiting
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function batchMergeTickets() {
  try {
    const fd = new Freshdesk(process.env.FRESHDESK_DOMAIN, process.env.FRESHDESK_API_KEY);
    
    console.log('🔄 Starting batch merge operation for existing tickets...\n');
    
    // Get all tickets
    const tickets = await fd.getAllTickets();
    const deviceTickets = tickets.filter(t => /STATE\s*-\s*(Up|Down)/i.test(t.subject));
    
    // Group by device name
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
    
    // Process each device with both Up and Down tickets
    let totalProcessed = 0;
    let successCount = 0;
    let errorCount = 0;
    const mergeResults = [];
    const REQUEST_DELAY_MS = 500; // 500ms delay between requests to avoid rate limiting
    
    for (const [device, statuses] of Object.entries(deviceMap)) {
      if (statuses.up.length > 0 && statuses.down.length > 0) {
        totalProcessed++;
        
        // Find the newest Up and newest Down tickets
        const newestUp = statuses.up.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
        const newestDown = statuses.down.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
        
        // Determine which is older and should be merged
        const isUpNewer = new Date(newestUp.created_at) > new Date(newestDown.created_at);
        const oldTicket = isUpNewer ? newestDown : newestUp;
        const newTicket = isUpNewer ? newestUp : newestDown;
        
        // Skip if already closed
        if (oldTicket.status === 'closed' || oldTicket.status === 'resolved') {
          continue;
        }
        
        try {
          console.log(`\n📍 Device: ${device}`);
          console.log(`   Old ticket: #${oldTicket.id} (${oldTicket.status}) - created ${new Date(oldTicket.created_at).toISOString().split('T')[0]}`);
          console.log(`   New ticket: #${newTicket.id} (${newTicket.status}) - created ${new Date(newTicket.created_at).toISOString().split('T')[0]}`);
          
          // Close the old ticket with delay
          await delay(REQUEST_DELAY_MS);
          await fd.updateTicketStatus(oldTicket.id, 'closed');
          
          // Add merge notes with delays
          await delay(REQUEST_DELAY_MS);
          const mergeNote = `🔗 AUTO-MERGED: This ticket was merged with #${newTicket.id} as part of device status lifecycle consolidation (${device}).`;
          await fd.addTicketNote(oldTicket.id, mergeNote, true);
          
          await delay(REQUEST_DELAY_MS);
          const counterNote = `🔗 PARENT TICKET: This ticket consolidated the previous status change. Original ticket: #${oldTicket.id}`;
          await fd.addTicketNote(newTicket.id, counterNote, true);
          
          console.log(`   ✅ MERGED: Closed #${oldTicket.id}, linked to #${newTicket.id}`);
          successCount++;
          mergeResults.push({
            device,
            oldTicket: oldTicket.id,
            oldStatus: oldTicket.status,
            newTicket: newTicket.id,
            newStatus: newTicket.status,
            success: true
          });
          
        } catch (error) {
          console.log(`   ❌ ERROR: ${error.message}`);
          errorCount++;
          mergeResults.push({
            device,
            oldTicket: oldTicket.id,
            newTicket: newTicket.id,
            success: false,
            error: error.message
          });
        }
      }
    }
    
    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 BATCH MERGE SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total devices processed: ${totalProcessed}`);
    console.log(`✅ Successful merges: ${successCount}`);
    console.log(`❌ Errors: ${errorCount}`);
    console.log(`⏭️  Skipped (already closed): ${totalProcessed - successCount - errorCount}`);
    
    if (successCount > 0) {
      console.log('\n✅ Successfully merged tickets:');
      mergeResults.filter(r => r.success).forEach(r => {
        console.log(`   • ${r.device}: #${r.oldTicket} → #${r.newTicket}`);
      });
    }
    
    if (errorCount > 0) {
      console.log('\n❌ Failed merges:');
      mergeResults.filter(r => !r.success).forEach(r => {
        console.log(`   • ${r.device}: #${r.oldTicket} → #${r.newTicket} (${r.error})`);
      });
    }
    
    console.log('\n✅ Batch merge operation completed!');
    
  } catch (error) {
    console.error('Fatal error during batch merge:', error);
  }
  process.exit(0);
}

batchMergeTickets();
