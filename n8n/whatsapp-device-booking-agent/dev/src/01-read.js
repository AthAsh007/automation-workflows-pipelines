// Kapso webhook -> one item per teacher: { from, name, text, reply }.
// - Webhook calls must carry ?token=<WEBHOOK_TOKEN>. Calls without it are dropped silently (fake payloads).
// - Handles batched payloads and skips outbound echoes and non-message events.
// - Drops message ids it has already handled, so a webhook Kapso retries isn't answered twice.
//   (Workflow static data only persists for production runs, which is where retries happen.)
// - Several messages from the same teacher in one batch become one turn for the agent.
// - Media messages, and numbers not on ALLOWED_PHONES, get a fixed `reply` and skip the agent.
const cfg = $('Config').first().json._cfg;
const digits = (v) => String(v == null ? '' : v).replace(/\D/g, '');
const MEDIA = ['image', 'audio', 'video', 'document', 'sticker', 'location', 'contacts'];
const token = String(cfg.WEBHOOK_TOKEN || '');
const tokenSet = token.length >= 16 && !/^PUT /.test(token);
const allowed = (cfg.ALLOWED_PHONES || []).map(digits).filter(Boolean);

const store = $getWorkflowStaticData('global');
const seen = store.seenMessageIds || (store.seenMessageIds = {});
const nowSec = Math.floor(Date.now() / 1000);
for (const [id, t] of Object.entries(seen)) if (nowSec - t > 86400) delete seen[id];

const payloads = (inc) => {
  const b = inc && inc.body ? inc.body : inc;
  if (b && b.batch === true && Array.isArray(b.data)) return b.data;
  return b ? [b] : [];
};

const byFrom = new Map();
for (const item of $input.all()) {
  const inc = item.json || {};
  // Webhook items carry headers; the manual demo item does not.
  if (inc.headers && !(tokenSet && String((inc.query || {}).token || '') === token)) continue;
  for (const p of payloads(inc)) {
    const m = p.message;
    if (!m) continue;
    const conv = p.conversation || {};
    if (m.kapso && m.kapso.direction && m.kapso.direction !== 'inbound') continue;
    if (m.id) {
      if (seen[m.id]) continue;
      seen[m.id] = nowSec;
    }
    const from = digits(m.from || conv.phone_number);
    if (!from) continue;
    let text = '';
    if (m.type === 'text') text = (m.text && m.text.body) || '';
    else if (m.type === 'interactive') text = (m.interactive && ((m.interactive.button_reply && m.interactive.button_reply.title) || (m.interactive.list_reply && m.interactive.list_reply.title))) || '';
    else if (m.type === 'button') text = (m.button && m.button.text) || '';
    text = String(text).trim();
    if (!text && !MEDIA.includes(m.type)) continue; // reactions, system notices, empty texts
    const entry = byFrom.get(from) || { from, name: '', texts: [], media: false };
    entry.name = entry.name || String(conv.contact_name || '').trim();
    if (text) entry.texts.push(text);
    else entry.media = true;
    byFrom.set(from, entry);
  }
}

const out = [];
for (const e of byFrom.values()) {
  let reply = '';
  if (allowed.length && !allowed.includes(e.from)) reply = 'Sorry, this number is not registered for iPad bookings. Please ask the school office to add it.';
  else if (e.texts.length === 0) reply = 'Sorry, I can only read text messages. Please type your request, e.g. "book 2 iPads tomorrow 9 to 10".';
  out.push({ json: { from: e.from, name: e.name, text: e.texts.join('\n'), reply, _cfg: cfg } });
}
return out;
