/**
 * One-shot reconciliation script.
 * Pulls all tickets from Freshdesk, finds open DOWN tickets that have a
 * matching open UP ticket, and closes them.
 *
 * Usage:  node run-reconcile-now.cjs
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

// ── Load .env manually (no ESM import needed) ──────────────────────────
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([\w]+)\s*=\s*(.*?)\s*$/);
    if (m && !m[1].startsWith('#')) process.env[m[1]] = m[2];
  }
}

const DOMAIN  = process.env.FRESHDESK_DOMAIN;
const API_KEY = process.env.FRESHDESK_API_KEY;

if (!DOMAIN || !API_KEY) {
  console.error('❌  FRESHDESK_DOMAIN or FRESHDESK_API_KEY missing from .env');
  process.exit(1);
}

const client = axios.create({
  baseURL: `https://${DOMAIN}/api/v2`,
  auth: { username: API_KEY, password: 'X' },
  headers: { 'Content-Type': 'application/json' },
});

const STATUS_MAP = { 2:'Open',3:'Pending',4:'Resolved',5:'Closed',6:'On Hold',7:'Reopened',8:'Waiting',9:'Assigned' };
const fmtStatus = (s) => STATUS_MAP[s] || `Unknown(${s})`;

// ── Helpers ─────────────────────────────────────────────────────────────
function extractCorrelationKey(subject) {
  if (!subject) return null;
  // Format: "[Site - Provider] [? Down] …" or "[Site] [✅ Up]"
  const bracketMatch = subject.match(/^\[([^\]]+)\]\s*\[/);
  if (bracketMatch) return bracketMatch[1].trim();
  // Format: "DEVICE (IP) : STATE - Down"
  const colonMatch = subject.match(/^(.+?)(?:\s*:\s*|$)/);
  return colonMatch && colonMatch[1] ? colonMatch[1].trim() : null;
}
function getState(subject) {
  if (!subject) return null;
  if (/STATE\s*[-:]?\s*DOWN/i.test(subject) || /\bDOWN\b/i.test(subject)) return 'down';
  if (/STATE\s*[-:]?\s*UP/i.test(subject)   || /\bUP\b/i.test(subject))   return 'up';
  return null;
}

// ── Fetch all tickets with pagination ───────────────────────────────────
async function getAllTickets() {
  let all = [], page = 1;
  while (true) {
    const res = await client.get('/tickets', {
      params: { page, per_page: 100, order_by: 'created_at', order_type: 'desc' },
    });
    const tickets = Array.isArray(res.data) ? res.data : (res.data.tickets || []);
    if (tickets.length === 0) break;
    all = all.concat(tickets);
    console.log(`   fetched page ${page} – ${tickets.length} tickets (total ${all.length})`);
    if (tickets.length < 100) break;
    page++;
  }
  return all;
}

// ── Close a ticket ──────────────────────────────────────────────────────
async function closeTicket(ticketId, reason) {
  await client.put(`/tickets/${ticketId}`, { status: 5 });
  if (reason) {
    try {
      await client.post(`/tickets/${ticketId}/notes`, {
        body: `[AUTOMATED] ${reason}`,
        private: true,
      });
    } catch (_) { /* best-effort */ }
  }
}

// ── Main ────────────────────────────────────────────────────────────────
(async () => {
  try {
    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║           ONE-SHOT TICKET RECONCILIATION                ║');
    console.log('╚══════════════════════════════════════════════════════════╝\n');

    // 1. Fetch
    console.log('1️⃣  Fetching all tickets from Freshdesk...');
    const raw = await getAllTickets();
    console.log(`   ✅ Total tickets: ${raw.length}\n`);

    // 2. Filter open only
    const open = raw.filter(t => t.status !== 5 && t.status !== 4);
    console.log(`2️⃣  Open (not Closed/Resolved): ${open.length}`);

    // 3. Identify DOWN and UP tickets
    const downTickets = [];
    const upTickets = [];
    for (const t of open) {
      const state = getState(t.subject);
      if (state === 'down') downTickets.push(t);
      if (state === 'up')   upTickets.push(t);
    }
    console.log(`   🔴 Open DOWN tickets: ${downTickets.length}`);
    console.log(`   🟢 Open UP tickets:   ${upTickets.length}\n`);

    if (downTickets.length > 0) {
      console.log('   Open DOWN tickets:');
      for (const t of downTickets) {
        console.log(`     #${t.id}  [${fmtStatus(t.status)}]  ${t.subject}`);
      }
      console.log();
    }
    if (upTickets.length > 0) {
      console.log('   Open UP tickets:');
      for (const t of upTickets) {
        console.log(`     #${t.id}  [${fmtStatus(t.status)}]  ${t.subject}`);
      }
      console.log();
    }

    // 4. Group by correlation key
    const byKey = new Map();
    for (const t of [...downTickets, ...upTickets]) {
      const key = extractCorrelationKey(t.subject);
      const state = getState(t.subject);
      if (!key || !state) continue;
      if (!byKey.has(key)) byKey.set(key, { down: [], up: [] });
      byKey.get(key)[state].push(t);
    }

    // 5. Find pairs
    let pairsFound = 0;
    const toClose = [];
    for (const [key, bucket] of byKey) {
      if (bucket.down.length === 0 || bucket.up.length === 0) continue;
      pairsFound++;
      const newestUp = bucket.up.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
      for (const d of bucket.down) {
        if (new Date(d.created_at) < new Date(newestUp.created_at)) {
          toClose.push({ down: d, up: newestUp, key });
        }
      }
    }

    console.log(`3️⃣  Correlation keys with both DOWN+UP: ${pairsFound}`);
    console.log(`   DOWN tickets eligible for closure: ${toClose.length}\n`);

    if (toClose.length === 0) {
      console.log('ℹ️  Nothing to reconcile – no eligible DOWN/UP pairs found.');
      console.log('\n   Possible reasons:');
      console.log('   • The DOWN and UP subjects don\'t share the same correlation key');
      console.log('   • The DOWN ticket was created AFTER the UP ticket');
      console.log('   • Tickets are already Closed/Resolved\n');

      // Debug: dump correlation keys
      if (downTickets.length > 0 || upTickets.length > 0) {
        console.log('   DEBUG – Correlation keys for open state tickets:');
        for (const t of [...downTickets, ...upTickets]) {
          const k = extractCorrelationKey(t.subject);
          const s = getState(t.subject);
          console.log(`     #${t.id} [${s?.toUpperCase()}] key="${k}"`);
          console.log(`        subject: "${t.subject}"`);
        }
      }

      // Still close standalone UP tickets even if no pairs
      if (upTickets.length > 0) {
        console.log('\n4️⃣  Closing ALL open UP tickets...\n');
        let closedUp = 0, failedUp = 0;
        for (const t of upTickets) {
          try {
            await client.post(`/tickets/${t.id}/notes`, { body: 'Auto close', private: true });
            await client.put(`/tickets/${t.id}`, { status: 5 });
            closedUp++;
            console.log(`   ✅ Closed UP #${t.id} – ${t.subject}`);
            await new Promise(r => setTimeout(r, 500));
          } catch (err) {
            failedUp++;
            console.log(`   ❌ FAILED UP #${t.id}: ${err.response?.data?.description || err.message}`);
          }
        }
        console.log(`\n━━━ UP Closed: ${closedUp}  Failed: ${failedUp} ━━━\n`);
      }

      process.exit(0);
    }

    // 6. Close DOWN tickets that have matching UP
    console.log('4️⃣  Closing DOWN tickets with matching UP...\n');
    let closed = 0, failed = 0;
    for (const pair of toClose) {
      const tag = `#${pair.down.id} → UP #${pair.up.id}`;
      try {
        const reason = `Service is UP – closed by manual reconciliation (matching UP ticket #${pair.up.id})`;
        await closeTicket(pair.down.id, reason);
        closed++;
        console.log(`   ✅ Closed DOWN ${tag}`);
        await new Promise(r => setTimeout(r, 500));
      } catch (err) {
        failed++;
        console.log(`   ❌ FAILED ${tag}: ${err.response?.data?.description || err.message}`);
      }
    }

    // 7. Close ALL open UP tickets with "Auto close"
    console.log('\n5️⃣  Closing ALL open UP tickets...\n');
    let closedUp = 0, failedUp = 0;
    for (const t of upTickets) {
      try {
        await client.post(`/tickets/${t.id}/notes`, { body: 'Auto close', private: true });
        await client.put(`/tickets/${t.id}`, { status: 5 });
        closedUp++;
        console.log(`   ✅ Closed UP #${t.id} – ${t.subject}`);
        await new Promise(r => setTimeout(r, 500));
      } catch (err) {
        failedUp++;
        console.log(`   ❌ FAILED UP #${t.id}: ${err.response?.data?.description || err.message}`);
      }
    }

    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`DOWN – Closed: ${closed}  Failed: ${failed}`);
    console.log(`UP   – Closed: ${closedUp}  Failed: ${failedUp}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  } catch (err) {
    console.error('Fatal error:', err.response?.data || err.message);
    process.exit(1);
  }
  process.exit(0);
})();
