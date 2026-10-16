import { defineSpec } from '../_kit/spec';
import { trigger, code, ifTrue, merge, stop, http, telegram } from '../_kit/n';

const cfg = (k: string) => `$('config').first().json.${k}`;

export default defineSpec({
  slug: 'paypal-dispute-alerts',
  title: 'Alert Telegram when PayPal disputes open, with the response deadline',
  summary: 'Polls PayPal every 30 minutes for disputes that need a seller response, labels each by time left to respond, and sends one Telegram message per run listing new disputes plus any that just crossed into the last 24 hours.',
  category: 'Finance and billing',
  description: {
    who: 'Online sellers and small ecommerce teams who take payments through PayPal and have lost a dispute by missing the response window. The alert arrives on your phone with the deadline in the first line.',
    how: [
      'Every 30 minutes it lists open PayPal disputes, or a sample set until PayPal is connected.',
      'Disputes waiting on the buyer, and resolved ones, are skipped. The rest get a label from the seller response deadline: OVERDUE, DUE TODAY (under 24 hours), URGENT (under 72 hours), this week, or later.',
      'A dispute is alerted once when first seen, and once more when it enters its last 24 hours. Ids are kept in workflow static data.',
      'One Telegram message lists them in deadline order with amount, reason and stage, plus the total amount in dispute.',
    ],
    setup: [
      'Run it once as imported. It labels sample disputes and stops at `STOP: preview - nothing sent`.',
      'Add a PayPal credential to `List open PayPal disputes`, set `PAYPAL_ENV`, then set `USE_PAYPAL = true`.',
      'Connect Telegram and put your chat id in `TELEGRAM_CHAT_ID`.',
      'For a test, set `TEST_EMAIL` to any address and `TEST_TELEGRAM_CHAT_ID` to a private chat, where the test message lands. Set `TEST_RUN = false` to send to `TELEGRAM_CHAT_ID` and remember alerted disputes.',
    ],
    requirements: ['A PayPal business account with REST API credentials', 'A Telegram bot and a chat id'],
    customize: [
      '`URGENT_HOURS` and `TODAY_HOURS` move the label boundaries.',
      '`MIN_AMOUNT` keeps small disputes out of the alert.',
      '`PAYPAL_ENV` switches between sandbox and live API hosts.',
    ],
  },
  config: {
    intro: ['USE_PAYPAL false -> SAMPLE disputes so the run works before any credential exists.', 'TELEGRAM_CHAT_ID blank -> nothing is sent.', 'Test mode (TEST_RUN true + TEST_EMAIL set) sends to TEST_TELEGRAM_CHAT_ID, never to TELEGRAM_CHAT_ID.'],
    consts: [
      { name: 'USE_PAYPAL', value: false, note: 'set true after adding the PayPal credential' },
      { name: 'PAYPAL_ENV', value: 'live', note: "'live' or 'sandbox'" },
      { name: 'TODAY_HOURS', value: 24, note: 'under this many hours left -> DUE TODAY, and a second alert' },
      { name: 'URGENT_HOURS', value: 72, note: 'under this many hours left -> URGENT' },
      { name: 'MIN_AMOUNT', value: 0, note: 'disputes below this amount are not alerted' },
      { name: 'TELEGRAM_CHAT_ID', value: '', note: 'chat or group id for alerts; blank sends nothing' },
      { name: 'TEST_TELEGRAM_CHAT_ID', value: '', note: 'test mode posts here instead of the real chat; blank means test mode posts nothing' },
    ],
    flags: { telegram_enabled: "TELEGRAM_CHAT_ID.trim() !== ''", test_telegram_enabled: "TEST_TELEGRAM_CHAT_ID.trim() !== ''" },
    safety: 'test_run',
  },
  nodes: [
    trigger.manual(),
    trigger.schedule('Every 30 minutes', '*/30 * * * *'),
    ifTrue('PayPal connected?', cfg('use_paypal')),
    http('List open PayPal disputes', {
      url: `={{ (${cfg('paypal_env')} === 'sandbox' ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com') + '/v1/customer/disputes' }}`, auth: 'paypalApi',
      query: { dispute_state: 'REQUIRED_ACTION', page_size: '50' },
    }),
    code('Read PayPal disputes', `
// PayPal list response -> one item per dispute with the fields the labeller needs.
const out = [];
for (const page of $input.all()) for (const d of page.json.items || []) out.push({ json: {
  id: d.dispute_id, created: d.create_time, reason: d.reason || 'OTHER', status: d.status, stage: d.dispute_life_cycle_stage || '',
  amount: Number(d.dispute_amount?.value || 0), currency: d.dispute_amount?.currency_code || '', due: d.seller_response_due_date || null,
} });
return out;`),
    code('Load sample disputes', `
// Used until USE_PAYPAL is true. Deadlines are relative to now so every label shows.
const at = h => new Date(Date.now() + h * 3600e3).toISOString();
const d = (id, reason, status, stage, amount, dueH) => ({ id, created: at(-48), reason, status, stage, amount, currency: 'USD', due: dueH === null ? null : at(dueH) });
return [
  d('PP-D-1101', 'MERCHANDISE_OR_SERVICE_NOT_RECEIVED', 'WAITING_FOR_SELLER_RESPONSE', 'CHARGEBACK', 189.00, 20),
  d('PP-D-1102', 'MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED', 'WAITING_FOR_SELLER_RESPONSE', 'INQUIRY', 64.50, 60),
  d('PP-D-1103', 'UNAUTHORISED', 'OPEN', 'INQUIRY', 420.00, 9 * 24),
  d('PP-D-1104', 'DUPLICATE_TRANSACTION', 'WAITING_FOR_SELLER_RESPONSE', 'CHARGEBACK', 35.00, -5),
  d('PP-D-1105', 'CREDIT_NOT_PROCESSED', 'WAITING_FOR_BUYER_RESPONSE', 'INQUIRY', 75.00, null),
  d('PP-D-1106', 'INCORRECT_AMOUNT', 'RESOLVED', 'INQUIRY', 22.00, null),
].map(json => ({ json }));`),
    merge('Combine dispute sources'),
    code('Label by deadline', `
// Only disputes the seller can act on. A dispute alerts when first seen, and again
// the first time it is under TODAY_HOURS, so the last day never passes silently.
const cfg = $('config').first().json;
const seen = $getWorkflowStaticData('global').disputes || {};
const now = Date.now();
const label = h => h === null ? 'NO DEADLINE' : h < 0 ? 'OVERDUE' : h < cfg.today_hours ? 'DUE TODAY' : h < cfg.urgent_hours ? 'URGENT' : h < 168 ? 'THIS WEEK' : 'LATER';
const alert = [], skipped = [];
for (const { json: d } of $input.all()) {
  if (d.status === 'RESOLVED') { skipped.push({ id: d.id, reason: 'resolved' }); continue; }
  if (d.status === 'WAITING_FOR_BUYER_RESPONSE' || d.status === 'UNDER_REVIEW') { skipped.push({ id: d.id, reason: 'no seller action needed (' + d.status.toLowerCase() + ')' }); continue; }
  if (d.amount < cfg.min_amount) { skipped.push({ id: d.id, reason: 'below MIN_AMOUNT' }); continue; }
  const hours = d.due ? Math.round((new Date(d.due) - now) / 3600e3) : null;
  const lab = label(hours);
  const prev = seen[d.id];
  const lastDay = hours !== null && hours < cfg.today_hours;
  const why = !prev ? 'new' : lastDay && !prev.last_day ? 'entered last ' + cfg.today_hours + 'h' : '';
  if (!why) { skipped.push({ id: d.id, reason: 'already alerted' }); continue; }
  alert.push({ ...d, hours_left: hours, label: lab, why, last_day: lastDay });
}
alert.sort((a, b) => (a.hours_left ?? 1e9) - (b.hours_left ?? 1e9));
return [{ json: { alert, skipped, total: alert.reduce((s, d) => s + d.amount, 0) } }];`),
    code('Write the Telegram alert', `
// Plain text so no Markdown escaping can break the send. Deadline first on every line.
const cfg = $('config').first().json;
const { alert, total } = $input.first().json;
const left = h => h === null ? 'no deadline' : h < 0 ? Math.abs(h) + 'h overdue' : h < 48 ? h + 'h left' : Math.round(h / 24) + ' days left';
const nice = s => s.toLowerCase().replace(/_/g, ' ');
const lines = alert.map(d => [
  d.label + ' - ' + left(d.hours_left) + (d.due ? ' (respond by ' + d.due.slice(0, 16).replace('T', ' ') + ' UTC)' : ''),
  '  ' + d.id + ': ' + d.currency + ' ' + d.amount.toFixed(2) + ', ' + nice(d.reason) + ', ' + nice(d.stage) + (d.why === 'new' ? ' [new]' : ' [' + d.why + ']'),
].join('\\n'));
const text = [(cfg.mode === 'test' ? '[TEST] ' : '') + 'PayPal disputes needing a response: ' + alert.length + ' (' + total.toFixed(2) + ' in dispute)', '', ...lines, '', 'Respond in the PayPal Resolution Center.'].join('\\n');
const send_to = cfg.mode === 'test' ? cfg.test_telegram_chat_id.trim() : cfg.telegram_chat_id;
return [{ json: { text, send_to, count: alert.length, remember: alert.map(d => [d.id, d.last_day]) } }];`),
    ifTrue('Anything to alert?', '$json.count > 0'),
    stop('STOP: no new disputes'),
    ifTrue('Sending switched on?', `${cfg('sends_enabled')} && (${cfg('mode')} === 'test' || ${cfg('telegram_enabled')})`),
    stop('STOP: preview - nothing sent'),
    ifTrue('Test chat set?', `${cfg('mode')} !== 'test' || ${cfg('test_telegram_enabled')}`),
    stop('STOP: test - TEST_TELEGRAM_CHAT_ID blank'),
    telegram.send('Send the alert to Telegram', '$json.send_to', "$('Write the Telegram alert').first().json.text"),
    ifTrue('Live run?', cfg('live')),
    stop('STOP: test send - disputes not remembered'),
    code('Remember alerted disputes', `
// Live only. Stores whether the last-day alert has gone, so each dispute alerts at most twice.
const store = $getWorkflowStaticData('global');
const seen = store.disputes || {};
for (const [id, lastDay] of $('Write the Telegram alert').first().json.remember) seen[id] = { last_day: Boolean(lastDay || seen[id]?.last_day), at: new Date().toISOString() };
store.disputes = Object.fromEntries(Object.entries(seen).slice(-500));
return [{ json: { remembered: Object.keys(store.disputes).length } }];`),
  ],
  edges: [
    ['Run manually', 'config'], ['Every 30 minutes', 'config'],
    ['config', 'PayPal connected?'],
    ['PayPal connected?', 0, 'List open PayPal disputes'], ['PayPal connected?', 1, 'Load sample disputes'],
    ['List open PayPal disputes', 'Read PayPal disputes'],
    ['Read PayPal disputes', 'Combine dispute sources'], ['Load sample disputes', 0, 'Combine dispute sources', 1],
    ['Combine dispute sources', 'Label by deadline'],
    ['Label by deadline', 'Write the Telegram alert'],
    ['Write the Telegram alert', 'Anything to alert?'],
    ['Anything to alert?', 0, 'Sending switched on?'], ['Anything to alert?', 1, 'STOP: no new disputes'],
    ['Sending switched on?', 0, 'Test chat set?'], ['Sending switched on?', 1, 'STOP: preview - nothing sent'],
    ['Test chat set?', 0, 'Send the alert to Telegram'], ['Test chat set?', 1, 'STOP: test - TEST_TELEGRAM_CHAT_ID blank'],
    ['Send the alert to Telegram', 'Live run?'],
    ['Live run?', 0, 'Remember alerted disputes'], ['Live run?', 1, 'STOP: test send - disputes not remembered'],
  ],
  groups: [
    { title: 'Start and settings', why: 'Polls every 30 minutes because the shortest PayPal windows are counted in hours. Label boundaries and the sandbox switch live in `config`.', nodes: ['Run manually', 'Every 30 minutes', 'config'] },
    { title: 'Read open disputes', why: 'Only disputes in the REQUIRED_ACTION state are listed. `Load sample disputes` returns the same fields until `USE_PAYPAL` is true, with deadlines set relative to now.', nodes: ['PayPal connected?', 'List open PayPal disputes', 'Read PayPal disputes', 'Load sample disputes', 'Combine dispute sources'] },
    { title: 'Label and decide what is new', why: '`Label by deadline` skips disputes waiting on the buyer and anything already alerted, but lets a dispute through a second time when it enters its last day. An empty run ends at `STOP: no new disputes`.', nodes: ['Label by deadline', 'Write the Telegram alert', 'Anything to alert?', 'STOP: no new disputes'] },
    { title: 'Send and remember', why: 'A test send goes only to `TEST_TELEGRAM_CHAT_ID`, stops at a STOP if that is blank, and stores nothing, so the real alert still fires later. Only `Live run?` writes the dispute ids to static data.', nodes: ['Sending switched on?', 'STOP: preview - nothing sent', 'Test chat set?', 'STOP: test - TEST_TELEGRAM_CHAT_ID blank', 'Send the alert to Telegram', 'Live run?', 'STOP: test send - disputes not remembered', 'Remember alerted disputes'] },
  ],
  scenarios: [
    {
      name: 'shipped config (preview)', start: 'Run manually',
      expect: { reached: ['Load sample disputes', 'STOP: preview - nothing sent'], outward: 'none' },
      check: out => {
        const l = out['Label by deadline'][0];
        const f: string[] = [];
        const got = l.alert.map((d: any) => d.id + ':' + d.label).join(',');
        if (got !== 'PP-D-1104:OVERDUE,PP-D-1101:DUE TODAY,PP-D-1102:URGENT,PP-D-1103:LATER') f.push(`order/labels wrong: ${got}`);
        if (l.skipped.length !== 2) f.push('buyer-waiting and resolved disputes should be skipped');
        if (l.total !== 708.5) f.push(`total should be 708.5, got ${l.total}`);
        if (!out['Write the Telegram alert'][0].text.startsWith('PayPal disputes needing a response: 4')) f.push('alert header wrong');
        return f;
      },
    },
    {
      name: 'test mode with no test chat', start: 'Run manually',
      overrides: { TEST_EMAIL: 'you@example.com', TELEGRAM_CHAT_ID: '-1001234567' },
      expect: { reached: ['STOP: test - TEST_TELEGRAM_CHAT_ID blank'], notReached: ['Send the alert to Telegram', 'STOP: preview - nothing sent'], outward: 'none' },
    },
    {
      name: 'test mode into the test chat', start: 'Run manually',
      overrides: { TEST_EMAIL: 'you@example.com', TELEGRAM_CHAT_ID: '-1001234567', TEST_TELEGRAM_CHAT_ID: '-1009999999' },
      mocks: { 'Send the alert to Telegram': (items: any[]) => items.map(j => ({ ok: true, result: { message_id: 7, chat: { id: j.send_to } } })) },
      expect: { reached: ['Send the alert to Telegram', 'STOP: test send - disputes not remembered'], notReached: ['Remember alerted disputes'], outward: 'some' },
      check: out => {
        const f: string[] = [];
        const chat = out['Send the alert to Telegram'][0]?.result?.chat?.id;
        if (chat !== '-1009999999') f.push(`test send must go to TEST_TELEGRAM_CHAT_ID, went to ${chat}`);
        if (!out['Write the Telegram alert'][0].text.startsWith('[TEST] ')) f.push('test alert needs the [TEST] prefix');
        return f;
      },
    },
    {
      name: 'live with PayPal and Telegram', start: 'Every 30 minutes',
      overrides: { USE_PAYPAL: true, TELEGRAM_CHAT_ID: '-1001234567', TEST_RUN: false },
      mocks: {
        'List open PayPal disputes': [{ items: [
          { dispute_id: 'PP-D-LIVE1', create_time: new Date().toISOString(), reason: 'MERCHANDISE_OR_SERVICE_NOT_RECEIVED', status: 'WAITING_FOR_SELLER_RESPONSE',
            dispute_amount: { currency_code: 'EUR', value: '58.00' }, dispute_life_cycle_stage: 'INQUIRY', seller_response_due_date: new Date(Date.now() + 100 * 3600e3).toISOString() },
        ], links: [] }],
        'Send the alert to Telegram': (items: any[]) => items.map(j => ({ ok: true, result: { message_id: 42, chat: { id: j.send_to } } })),
      },
      expect: { reached: ['Read PayPal disputes', 'Send the alert to Telegram', 'Remember alerted disputes'], outward: 'some' },
      check: out => {
        const f: string[] = [];
        if (out['Label by deadline'][0].alert[0]?.label !== 'THIS WEEK') f.push('100h left should be THIS WEEK');
        if (out['Send the alert to Telegram'][0]?.result?.chat?.id !== '-1001234567') f.push('live send must go to TELEGRAM_CHAT_ID');
        return f;
      },
    },
  ],
});
