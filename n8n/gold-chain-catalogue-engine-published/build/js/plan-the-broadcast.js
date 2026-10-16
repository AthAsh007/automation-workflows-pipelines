// Decides who receives the announcement, and says why for everyone who does not:
//   opted out            -> never messaged
//   not a usable number  -> skipped, listed for someone to fix
//   duplicate number     -> sent once
//   over BROADCAST_CAP   -> not sent this time, listed
// In test mode every message is redirected to TEST_WHATSAPP, at most test_cap of them, and
// marked [TEST]. The owner's approval request is built here too; the approve link itself is
// added on the send node, because only n8n knows it at that moment.
const cfg = $('config').first().json;
const draft = $('build the catalogue').first().json;
const list = ($input.first().json || {}).customers || [];

function e164(v) {
  const s = String(v || '').replace(/^whatsapp:/, '').replace(/[\s()\-.]/g, '');
  return /^\+[1-9]\d{7,14}$/.test(s) ? s : '';
}
const yes = (v) => /^(y|yes|true|1|x)$/i.test(String(v || '').trim());

const sends = [], skipped = [], seen = new Set();
for (const c of list) {
  const to = e164(c.whatsapp);
  if (yes(c.opted_out)) { skipped.push({ name: c.name, why: 'opted out' }); continue; }
  if (!to) { skipped.push({ name: c.name, why: 'not a usable number: ' + c.whatsapp }); continue; }
  if (seen.has(to)) { skipped.push({ name: c.name, why: 'duplicate number' }); continue; }
  if (sends.length >= cfg.broadcast_cap) { skipped.push({ name: c.name, why: 'over BROADCAST_CAP ' + cfg.broadcast_cap }); continue; }
  seen.add(to);
  sends.push({ name: c.name, to, body: draft.announcement });
}

let planned = sends;
if (cfg.mode === 'test') {
  planned = sends.slice(0, cfg.test_cap).map((s) => ({
    name: s.name, to: e164(cfg.test_whatsapp),
    body: '[TEST: would go to ' + s.name + ' ' + s.to + ']\n' + s.body
  }));
}

const owner_to = cfg.mode === 'test' ? e164(cfg.test_whatsapp) : e164(cfg.owner_whatsapp);
const owner_message = [
  (cfg.mode === 'test' ? '[TEST] ' : '') + "Today's list is ready: " + draft.counts.in_stock + ' chains in stock, ' +
    draft.counts.new + ' new, ' + draft.counts.sold_out + ' sold out' +
    (draft.counts.held_back ? ', ' + draft.counts.held_back + ' held back (see the run)' : '') + '.',
  'Rate: ' + draft.rate_note + '.',
  'It goes to ' + planned.length + ' customer(s) when you approve. Nothing is sent without you.',
  '', '--- the message ---', draft.announcement
].join('\n');

return [{ json: {
  mode: cfg.mode, owner_to, owner_message,
  sends: planned, would_send_live: sends.length, skipped,
  customers_source: ($input.first().json || {}).source
} }];
