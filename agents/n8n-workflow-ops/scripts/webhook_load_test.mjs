// Fire N webhook calls at an n8n workflow at the same moment and report how the
// webhook answered. Pair it with the execution list to see how the runs finished.
//
// Every request uses ONE sender the operator names, so any reply the workflow
// sends goes to that sender only. There is no default sender on purpose.
//
// Usage:
//   WEBHOOK_URL=https://n8n.example.com/webhook/my-bot \
//   WEBHOOK_TOKEN=... SENDER=15550100001 \
//   node webhook_load_test.mjs 50
//
// The body is Kapso-shaped (message + conversation). Edit buildBody() for another
// provider. Each request carries a unique message id so dedupe does not swallow it.
// Works on Node 18+ and Bun.

const COUNT = Number(process.argv[2] || 1);
const URL_BASE = process.env.WEBHOOK_URL;
const TOKEN = process.env.WEBHOOK_TOKEN || '';
const SENDER = String(process.env.SENDER || '').replace(/\D/g, '');

if (!URL_BASE) throw new Error('Set WEBHOOK_URL.');
if (!SENDER) throw new Error('Set SENDER to the number that should receive every reply.');
if (!Number.isInteger(COUNT) || COUNT < 1 || COUNT > 500) throw new Error('Count must be 1 to 500.');

const TEXTS = [
  'what is free tomorrow?',
  'show my bookings',
  'are 3 free tomorrow 9 to 10?',
  'any free time on Wednesday?',
  'hi',
  'what can you do?',
];
const run = Date.now().toString(36);

function buildBody(i) {
  return {
    message: {
      id: `wamid.load.${run}.${i}`,
      timestamp: String(Math.floor(Date.now() / 1000)),
      type: 'text',
      from: SENDER,
      text: { body: TEXTS[i % TEXTS.length] },
      kapso: { direction: 'inbound' },
    },
    conversation: { id: `conv_load_${run}`, contact_name: 'Load Test', phone_number: SENDER },
  };
}

async function one(i) {
  const url = TOKEN ? `${URL_BASE}?token=${encodeURIComponent(TOKEN)}` : URL_BASE;
  const t0 = Date.now();
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(buildBody(i)) });
    return { status: r.status, ms: Date.now() - t0 };
  } catch (e) {
    return { status: `ERR ${e.message}`, ms: Date.now() - t0 };
  }
}

const t0 = Date.now();
const res = await Promise.all(Array.from({ length: COUNT }, (_, i) => one(i)));
const ms = res.map((r) => r.ms).sort((a, b) => a - b);
const statuses = res.reduce((m, r) => ((m[r.status] = (m[r.status] || 0) + 1), m), {});
console.log(JSON.stringify({
  run,
  count: COUNT,
  wall_ms: Date.now() - t0,
  statuses,
  p50_ms: ms[Math.floor(ms.length / 2)],
  max_ms: ms[ms.length - 1],
  started_after: new Date(t0).toISOString(),
}));
