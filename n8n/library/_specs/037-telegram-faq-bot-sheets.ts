import { defineSpec } from '../_kit/spec';
import { trigger, code, ifTrue, merge, stop, sheets, telegram } from '../_kit/n';

const cfg = (k: string) => `$('config').first().json.${k}`;

export default defineSpec({
  slug: 'telegram-faq-bot-sheets',
  title: 'Answer Telegram FAQ messages from a Google Sheets knowledge table',
  summary: 'Receives Telegram bot updates on a webhook, scores each message against the questions and keyword phrases in a Google Sheets FAQ table, replies with the best answer above a confidence line, hands everything else to a person with an alert, and rate-limits chats that flood the bot.',
  category: 'Customer support',
  description: {
    who: 'Small businesses that get the same ten questions on Telegram every day and want a bot that answers those from a sheet anyone on the team can edit, and passes the rest to a human.',
    how: [
      'Telegram posts each message to the webhook. A manual run uses 8 sample messages and 6 sample FAQ rows.',
      'The FAQ tab is read fresh on every message, so an edited answer is live on the next question.',
      'Each row scores on keyword phrases found in the message (60%) and shared words with its question (40%). The best row answers if it reaches 0.45 and beats the runner-up.',
      'Below the line, or on /human, the user gets a handoff message and your admin chat gets the question with a link back to the user.',
      'A chat sending more than 3 messages a minute gets one "slow down" reply, then silence until the minute passes.',
    ],
    setup: [
      'Run it once as imported. It answers the sample messages and stops at `STOP: preview - no replies sent`.',
      'Create a sheet with an FAQ tab (question, keywords, answer, enabled) and put its id in `FAQ_SHEET_ID`.',
      'Add your bot token as a Telegram credential on both Telegram nodes, activate the workflow and point the bot at the webhook with setWebhook.',
      'Put your own chat id in `TEST_CHAT_ID` so the bot answers only you, and `ADMIN_CHAT_ID` for handoffs. Set `DRY_RUN = false` to answer everyone.',
    ],
    requirements: ['A Telegram bot token from BotFather', 'A Google Sheet with an FAQ tab'],
    customize: [
      '`CONFIDENCE_MIN` and `MARGIN` decide when the bot answers instead of handing off.',
      '`RATE_LIMIT` and `RATE_WINDOW_SECONDS` set the flood limit.',
      '`WELCOME_TEXT` and `HANDOFF_TEXT` are the fixed replies.',
    ],
  },
  config: {
    intro: ['A manual run uses SAMPLE messages. FAQ_SHEET_ID blank -> SAMPLE FAQ rows.', 'DRY_RUN true -> the bot only replies to TEST_CHAT_ID; nobody else gets a message. ADMIN_CHAT_ID blank -> no handoff alerts.'],
    consts: [
      { name: 'FAQ_SHEET_ID', value: '', note: 'Google Sheets id with an FAQ tab; blank uses sample rows' },
      { name: 'CONFIDENCE_MIN', value: 0.45, note: 'best match must reach this score (0 to 1) to be sent' },
      { name: 'MARGIN', value: 0.1, note: 'best match must beat the second by this much' },
      { name: 'RATE_LIMIT', value: 3, note: 'messages per chat allowed inside the window' },
      { name: 'RATE_WINDOW_SECONDS', value: 60, note: 'length of the rate-limit window' },
      { name: 'WELCOME_TEXT', value: 'Hi! Ask me about pricing, refunds, orders, trials or passwords. Type /human to reach a person.', note: 'reply to /start and /help' },
      { name: 'HANDOFF_TEXT', value: 'I am not sure about that one, so I have passed it to the team. Someone will reply here during business hours.', note: 'reply when no answer is confident' },
      { name: 'SLOW_DOWN_TEXT', value: 'You are sending messages quickly. I will catch up in a minute.', note: 'sent once when a chat hits the limit' },
      { name: 'TEST_CHAT_ID', value: '', note: 'your own chat id; while DRY_RUN is true the bot answers only this chat' },
      { name: 'ADMIN_CHAT_ID', value: '', note: 'chat that receives handoff alerts; blank skips them' },
    ],
    flags: { sheet_enabled: "FAQ_SHEET_ID.trim() !== ''", admin_enabled: "ADMIN_CHAT_ID.trim() !== ''" },
    safety: 'dry_run',
  },
  nodes: [
    trigger.manual(),
    trigger.webhook('Telegram update received', 'telegram-faq-bot'),
    code('Read the Telegram update', `
// Webhook body is a Telegram Update. Only text messages are answered; edits,
// stickers and joins are ignored. A manual run returns a marker for the sample path.
let bodies = [];
try { if ($('Telegram update received').isExecuted) bodies = $('Telegram update received').all().map(i => i.json.body || {}); } catch (e) { bodies = []; }
if (!bodies.length) return [{ json: { source: 'none' } }];
return bodies.filter(b => b.message && typeof b.message.text === 'string').map(b => ({ json: { source: 'webhook',
  chat_id: String(b.message.chat.id), user: b.message.from?.first_name || '', username: b.message.from?.username || '',
  text: b.message.text, at: new Date((b.message.date || Date.now() / 1000) * 1000).toISOString() } }));`),
    ifTrue('Update received?', "$json.source === 'webhook'"),
    code('Load sample messages', `
// Used on a manual run. Chat 5550105 sends four messages inside a minute.
const at = s => new Date(Date.now() - s * 1000).toISOString();
return [
  ['5550101', 'Ana', 'How much does the pro plan cost per month?', 300],
  ['5550102', 'Ben', 'I want my money back, can I get a refund for order 4471?', 280],
  ['5550103', 'Cy', '/start', 260],
  ['5550104', 'Dee', 'Do you deliver to Antarctica by drone?', 240],
  ['5550105', 'Eli', 'I am locked out, password reset does not work', 50],
  ['5550105', 'Eli', 'hello??', 40],
  ['5550105', 'Eli', 'anyone there', 30],
  ['5550105', 'Eli', 'please answer', 20],
].map(([chat_id, user, text, s]) => ({ json: { source: 'sample', chat_id, user, username: '', text, at: at(s) } }));`),
    merge('Combine message sources'),
    code('Collect the messages', `
// One item holding every message, so the FAQ sheet is read once per run.
return [{ json: { messages: $input.all().map(i => i.json).filter(m => m.source !== 'none') } }];`),
    ifTrue('FAQ sheet set?', cfg('sheet_enabled')),
    sheets.read('Read the FAQ rows', cfg('faq_sheet_id'), 'FAQ'),
    code('Load sample FAQ rows', `
// Used until FAQ_SHEET_ID is set. The last row is switched off.
return [
  { question: 'How much does it cost?', keywords: 'price, pricing, cost, how much, plan', answer: 'Starter is $12/month, Pro is $29/month, billed monthly. Annual billing saves 2 months.', enabled: 'yes' },
  { question: 'How do I get a refund?', keywords: 'refund, money back, return, charged', answer: 'Refunds are open for 14 days after purchase. Reply with your order number and we will process it within 2 working days.', enabled: 'yes' },
  { question: 'Where is my order?', keywords: 'where is my order, tracking, shipped, delivery, arrive', answer: 'Every order gets a tracking link by email on the day it ships. Orders ship within 2 working days.', enabled: 'yes' },
  { question: 'Do you have a free trial?', keywords: 'trial, free, try it', answer: 'Yes, 14 days free with no card needed: sign up on our website.', enabled: 'yes' },
  { question: 'How do I reset my password?', keywords: 'password, reset, log in, login, locked out', answer: 'Use Forgot password on the login page. The link expires after 30 minutes, so use it straight away.', enabled: 'yes' },
  { question: 'What are your opening hours?', keywords: 'hours, open, weekend', answer: 'Mon to Fri, 9:00 to 17:00.', enabled: 'no' },
].map(json => ({ json }));`),
    merge('Combine FAQ sources'),
    code('Match each message', `
// Rate limit first (static memory + this batch), then commands, then FAQ scoring:
// 0.6 x keyword phrases found (2 = full) + 0.4 x share of message words in the question.
const cfg = $('config').first().json;
const { messages } = $('Collect the messages').first().json;
const STOP = new Set('a an and are can do does for from get has have how i if in is it me my of on or our the this to we what when where which who why will with you your please any anyone there hello hi'.split(' '));
const words = s => String(s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\\s+/).filter(w => w.length > 2 && !STOP.has(w)).map(w => w.length > 4 && w.endsWith('s') ? w.slice(0, -1) : w);
const faq = $input.all().map(i => i.json).filter(r => r.question && r.answer && !/^(no|false|0)$/i.test(String(r.enabled ?? 'yes').trim()))
  .map(r => ({ ...r, phrases: String(r.keywords || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean), qwords: new Set(words(r.question)) }));
const memory = $getWorkflowStaticData('global');
const seen = memory.recent || {};
const now = Date.now(), win = cfg.rate_window_seconds * 1000;
const out = [];
for (const m of [...messages].sort((a, b) => a.at.localeCompare(b.at))) {
  const list = (seen[m.chat_id] || []).filter(t => now - t < win);
  list.push(new Date(m.at).getTime()); seen[m.chat_id] = list;
  if (list.length > cfg.rate_limit + 1) { out.push({ ...m, kind: 'silent', reason: 'rate limited' }); continue; }
  if (list.length === cfg.rate_limit + 1) { out.push({ ...m, kind: 'slow_down', reply: cfg.slow_down_text }); continue; }
  const cmd = m.text.trim().split(/\\s+/)[0].toLowerCase();
  if (cmd === '/start' || cmd === '/help') { out.push({ ...m, kind: 'welcome', reply: cfg.welcome_text }); continue; }
  if (cmd === '/human') { out.push({ ...m, kind: 'handoff', reply: cfg.handoff_text, reason: 'asked for a person' }); continue; }
  const text = ' ' + m.text.toLowerCase() + ' ';
  const q = words(m.text);
  if (!q.length) { out.push({ ...m, kind: 'welcome', reply: cfg.welcome_text, reason: 'no question words' }); continue; }
  const ranked = faq.map(r => {
    const k = r.phrases.filter(p => text.includes(p)).length;
    const overlap = q.length ? q.filter(w => r.qwords.has(w)).length / q.length : 0;
    return { r, score: Math.round((0.6 * Math.min(1, k / 2) + 0.4 * overlap) * 100) / 100 };
  }).sort((a, b) => b.score - a.score);
  const best = ranked[0], second = ranked[1] || { score: 0 };
  if (best && best.score >= cfg.confidence_min && best.score - second.score >= cfg.margin) {
    out.push({ ...m, kind: 'answer', faq: best.r.question, score: best.score, reply: best.r.answer + '\\n\\nNot what you asked? Type /human.' });
  } else {
    out.push({ ...m, kind: 'handoff', reply: cfg.handoff_text, score: best ? best.score : 0,
      reason: best ? 'best match "' + best.r.question + '" at ' + best.score : 'no FAQ rows' });
  }
}
for (const [chat, list] of Object.entries(seen)) if (!list.some(t => now - t < win)) delete seen[chat];
memory.recent = seen;
return [{ json: { results: out, handoffs: out.filter(o => o.kind === 'handoff') } }];`),
    code('Write each reply', `
// One Telegram message per result that has something to say.
return $input.first().json.results.filter(r => r.reply).map(r => ({ json: { chat_id: r.chat_id, kind: r.kind, text: r.reply } }));`),
    ifTrue('Reply switched on?', `${cfg('live')} || ($json.chat_id === ${cfg('test_chat_id')} && ${cfg('test_chat_id')} !== '')`),
    stop('STOP: preview - no replies sent'),
    telegram.send('Send the reply', '$json.chat_id', '$json.text'),
    code('Write the handoff alert', `
// One alert for the team with every question the bot could not answer.
const d = $input.first().json;
const text = ['Bot handoff: ' + d.handoffs.length + ' question' + (d.handoffs.length === 1 ? '' : 's'),
  ...d.handoffs.map(h => '- ' + (h.username ? '@' + h.username : h.user) + ' (chat ' + h.chat_id + '): "' + h.text + '" [' + h.reason + ']')].join('\\n');
return [{ json: { text, count: d.handoffs.length, chats: d.handoffs.map(h => h.chat_id) } }];`),
    ifTrue('Any handoffs?', '$json.count > 0'),
    stop('STOP: no handoffs'),
    ifTrue('Admin chat set?', cfg('admin_enabled')),
    stop('STOP: no admin chat'),
    ifTrue('Alert switched on?', `${cfg('live')} || $json.chats.every(c => c === ${cfg('test_chat_id')})`),
    stop('STOP: preview - no alert sent'),
    telegram.send('Alert the admin chat', cfg('admin_chat_id'), '$json.text'),
  ],
  edges: [
    ['Run manually', 'config'], ['Telegram update received', 'config'],
    ['config', 'Read the Telegram update'],
    ['Read the Telegram update', 'Update received?'],
    ['Update received?', 0, 'Combine message sources'], ['Update received?', 1, 'Load sample messages'],
    ['Load sample messages', 0, 'Combine message sources', 1],
    ['Combine message sources', 'Collect the messages'],
    ['Collect the messages', 'FAQ sheet set?'],
    ['FAQ sheet set?', 0, 'Read the FAQ rows'], ['FAQ sheet set?', 1, 'Load sample FAQ rows'],
    ['Read the FAQ rows', 'Combine FAQ sources'], ['Load sample FAQ rows', 0, 'Combine FAQ sources', 1],
    ['Combine FAQ sources', 'Match each message'],
    ['Match each message', 'Write each reply'],
    ['Match each message', 'Write the handoff alert'],
    ['Write each reply', 'Reply switched on?'],
    ['Reply switched on?', 0, 'Send the reply'], ['Reply switched on?', 1, 'STOP: preview - no replies sent'],
    ['Write the handoff alert', 'Any handoffs?'],
    ['Any handoffs?', 0, 'Admin chat set?'], ['Any handoffs?', 1, 'STOP: no handoffs'],
    ['Admin chat set?', 0, 'Alert switched on?'], ['Admin chat set?', 1, 'STOP: no admin chat'],
    ['Alert switched on?', 0, 'Alert the admin chat'], ['Alert switched on?', 1, 'STOP: preview - no alert sent'],
  ],
  groups: [
    { title: 'Start and settings', why: 'Telegram posts each update to the webhook, which answers at once; the manual trigger replays sample messages. Thresholds, rate limits and fixed replies live in `config`.', nodes: ['Run manually', 'Telegram update received', 'config'] },
    { title: 'Read the message', why: 'Only text messages go on; edits, stickers and joins stop here. `Collect the messages` turns them into one item so the FAQ sheet is read once, not once per message.', nodes: ['Read the Telegram update', 'Update received?', 'Load sample messages', 'Combine message sources', 'Collect the messages'] },
    { title: 'Read the FAQ table', why: 'The sheet is read on every run, so an answer edited by anyone on the team is live for the next question. Rows with enabled set to no are dropped before scoring.', nodes: ['FAQ sheet set?', 'Read the FAQ rows', 'Load sample FAQ rows', 'Combine FAQ sources'] },
    { title: 'Match, reply and hand off', why: 'The flood check runs before scoring so a spammer costs nothing. An answer needs both `CONFIDENCE_MIN` and a `MARGIN` over the runner-up; a near tie goes to a person rather than a coin flip.', nodes: ['Match each message', 'Write each reply', 'Reply switched on?', 'STOP: preview - no replies sent', 'Send the reply', 'Write the handoff alert', 'Any handoffs?', 'STOP: no handoffs', 'Admin chat set?', 'STOP: no admin chat', 'Alert switched on?', 'STOP: preview - no alert sent', 'Alert the admin chat'] },
  ],
  scenarios: [
    {
      name: 'shipped config (dry run)', start: 'Run manually',
      expect: { reached: ['Load sample messages', 'Load sample FAQ rows', 'STOP: preview - no replies sent', 'STOP: no admin chat'], outward: 'none' },
      check: out => {
        const f: string[] = [];
        const r = out['Match each message'][0].results;
        const by = (chat: string, i = 0) => r.filter((x: any) => x.chat_id === chat)[i];
        if (by('5550101')?.faq !== 'How much does it cost?') f.push(`pricing question should match, got ${by('5550101')?.kind} ${by('5550101')?.reason || ''}`);
        if (by('5550102')?.faq !== 'How do I get a refund?') f.push(`refund question should match, got ${by('5550102')?.kind} ${by('5550102')?.reason || ''}`);
        if (by('5550103')?.kind !== 'welcome') f.push('/start should get the welcome');
        if (by('5550104')?.kind !== 'handoff') f.push(`delivery to Antarctica should hand off, got ${by('5550104')?.kind} ${by('5550104')?.faq || ''}`);
        if (by('5550105', 0)?.faq !== 'How do I reset my password?') f.push('first password message should be answered');
        if (by('5550105', 3)?.kind !== 'slow_down') f.push(`4th message in a minute should get slow down, got ${by('5550105', 3)?.kind}`);
        if (out['Write each reply'].length !== 8) f.push(`8 replies expected, got ${out['Write each reply'].length}`);
        if (by('5550105', 1)?.kind !== 'welcome') f.push('a message with no question words gets the welcome, not a handoff');
        if (out['Match each message'][0].handoffs.length !== 1) f.push('only the Antarctica question should be handed off');
        return f;
      },
    },
    {
      name: 'live webhook answer and handoff alert', start: 'Telegram update received',
      input: [{ headers: {}, params: {}, query: {}, body: { update_id: 901, message: { message_id: 5, from: { id: 5550177, first_name: 'Rita', username: 'rita_k' }, chat: { id: 5550177, type: 'private' }, date: Math.floor(Date.now() / 1000), text: 'Can I pay with crypto?' } } }],
      overrides: { FAQ_SHEET_ID: '1FaqSheet', DRY_RUN: false, ADMIN_CHAT_ID: '5550100' },
      mocks: {
        'Read the FAQ rows': [{ row_number: 2, question: 'Which payment methods do you take?', keywords: 'card, paypal, invoice', answer: 'Card, PayPal and invoice.', enabled: 'yes' }],
        'Send the reply': [{ ok: true }],
        'Alert the admin chat': [{ ok: true }],
      },
      expect: { reached: ['Send the reply', 'Alert the admin chat'], notReached: ['Load sample messages', 'Load sample FAQ rows'], outward: 'some' },
      check: out => {
        const f: string[] = [];
        const r = out['Match each message'][0].results[0];
        if (r?.kind !== 'handoff') f.push(`crypto question should hand off, got ${r?.kind}`);
        if (!out['Write the handoff alert'][0].text.includes('@rita_k')) f.push('alert should name the user');
        return f;
      },
    },
    {
      name: 'dry run answers only the test chat', start: 'Telegram update received',
      input: [{ headers: {}, params: {}, query: {}, body: { update_id: 902, message: { message_id: 6, from: { id: 5550199, first_name: 'Owner' }, chat: { id: 5550199, type: 'private' }, date: Math.floor(Date.now() / 1000), text: 'is there a free trial?' } } }],
      overrides: { TEST_CHAT_ID: '5550199' },
      mocks: { 'Send the reply': [{ ok: true }] },
      expect: { reached: ['Send the reply'], outward: 'some' },
      check: out => out['Match each message'][0].results[0]?.faq === 'Do you have a free trial?' ? [] : ['trial question should match from the sample FAQ'],
    },
  ],
});
