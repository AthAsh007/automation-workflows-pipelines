import { defineSpec } from '../_kit/spec';
import { trigger, code, ifTrue, merge, stop, http, gmail } from '../_kit/n';

const cfg = (k: string) => `$('config').first().json.${k}`;

export default defineSpec({
  slug: 'nonprofit-donation-thank-you',
  title: 'Thank Stripe donors by Gmail and log gifts to Airtable with receipt numbers',
  summary: 'Picks up new successful Stripe donations every hour, tells first-time donors from returning ones using Airtable gift history, numbers each receipt in sequence, adds a tax receipt line above a threshold, emails a thank-you through Gmail and logs the gift to Airtable.',
  category: 'Local business and services',
  description: {
    who: 'Small charities and community groups that take donations through Stripe payment links or Checkout and send thank-you notes by hand. Every donor gets a numbered receipt within the hour.',
    how: [
      'Every hour it reads successful Stripe charges created since the last processed charge, or sample donations until Stripe is connected. Refunded charges and charges with no email are skipped.',
      'The donors\' emails are looked up in your Airtable Gifts table, so the email can say "welcome" to a first-time donor and "thank you again" to a returning one. Monthly gifts get their own line.',
      'Receipt numbers run in sequence (R-2026-01001, R-2026-01002) in the order the gifts were made. Gifts of 250 or more get the written acknowledgement line for tax purposes.',
      'The email goes out through Gmail, then the gift is added to Airtable with its receipt number. The charge cursor and counter only move on a live run.',
    ],
    setup: [
      'Run it once as imported. It writes sample thank-yous and stops at `STOP: preview - nothing sent`.',
      'Add a Stripe credential to `Fetch new Stripe charges` and set `USE_STRIPE = true`.',
      'Add an Airtable token credential to both Airtable nodes, fill `AIRTABLE_BASE_ID`, and create a Gifts table with Email, Name, Amount, Currency, Date, Receipt number, Donor type and Stripe charge fields.',
      'Connect Gmail. Put your address in `TEST_EMAIL` to receive every thank-you yourself, then set `TEST_RUN = false`.',
    ],
    requirements: ['A Stripe account receiving donations', 'An Airtable base with a Gifts table', 'A Gmail account'],
    customize: [
      '`TAX_RECEIPT_THRESHOLD` and `TAX_LINE` control the acknowledgement wording.',
      '`RECEIPT_PREFIX` and `RECEIPT_START` set the numbering.',
      '`ORG_NAME` and `SIGNATORY` sign every email.',
    ],
  },
  config: {
    intro: ['USE_STRIPE false -> SAMPLE donations. AIRTABLE_BASE_ID blank -> SAMPLE gift history and no logging.', 'The charge cursor and receipt counter are kept in workflow static data and only move on a live run.'],
    consts: [
      { name: 'USE_STRIPE', value: false, note: 'set true after adding the Stripe credential' },
      { name: 'AIRTABLE_BASE_ID', value: '', note: 'Airtable base id (starts with app); blank uses sample history' },
      { name: 'GIFTS_TABLE', value: 'Gifts', note: 'Airtable table name for gifts' },
      { name: 'FIRST_LOOKBACK_HOURS', value: 24, note: 'how far back the very first run looks' },
      { name: 'RECEIPT_PREFIX', value: 'R', note: 'receipt numbers look like R-2026-01001' },
      { name: 'RECEIPT_START', value: 1001, note: 'first receipt number when no counter is stored yet' },
      { name: 'TAX_RECEIPT_THRESHOLD', value: 250, note: 'gifts at or above this get the tax acknowledgement line (major units)' },
      { name: 'TAX_LINE', value: 'No goods or services were provided in exchange for this contribution. Riverbend Food Share is a registered charity, EIN 00-0000000.', note: 'acknowledgement text for gifts over the threshold' },
      { name: 'ORG_NAME', value: 'Riverbend Food Share', note: 'organisation name in the email' },
      { name: 'SIGNATORY', value: 'Jo Marsh, Director', note: 'sign-off line' },
    ],
    flags: { airtable_enabled: "AIRTABLE_BASE_ID.trim() !== ''" },
    safety: 'test_run',
  },
  nodes: [
    trigger.manual(),
    trigger.schedule('Every hour', '5 * * * *'),
    code('Work out the start time', `
// Charges after the last processed one. The cursor lives in static data so an hour
// with no gifts, or a failed run, does not lose or repeat any donation.
const cfg = $('config').first().json;
const store = $getWorkflowStaticData('global');
const since = store.last_created || Math.floor(Date.now() / 1000) - cfg.first_lookback_hours * 3600;
return [{ json: { since, next_receipt: Math.max(store.next_receipt || 0, cfg.receipt_start) } }];`),
    ifTrue('Use sample donations?', '!' + cfg('use_stripe')),
    http('Fetch new Stripe charges', { url: 'https://api.stripe.com/v1/charges', auth: 'stripeApi', query: { 'created[gt]': '={{ $json.since }}', limit: '100' } }),
    code('Read Stripe charges', `
// Stripe list response -> one item per charge.
const out = [];
for (const page of $input.all()) for (const c of page.json.data || []) out.push({ json: {
  id: c.id, created: c.created, status: c.status, refunded: Boolean(c.refunded), amount: (c.amount || 0) / 100, currency: (c.currency || 'usd').toUpperCase(),
  name: c.billing_details?.name || '', email: (c.billing_details?.email || c.receipt_email || '').toLowerCase(), recurring: Boolean(c.invoice),
  fund: c.metadata?.fund || '',
} });
return out;`),
    code('Load sample donations', `
// Used until USE_STRIPE is true. One returning donor, one monthly gift at the threshold, and three to skip.
const t = m => Math.floor(Date.now() / 1000) - m * 60;
const g = (id, mins, name, email, amount, extra = {}) => ({ id, created: t(mins), status: 'succeeded', refunded: false, amount, currency: 'USD', name, email, recurring: false, fund: '', ...extra });
return [
  g('ch_s1', 50, 'Ana Lima', 'ana@lima-family.example', 50),
  g('ch_s2', 40, 'Ben Okafor', 'ben@okafor.example', 300, { fund: 'Winter appeal' }),
  g('ch_s3', 30, 'Cara Nguyen', 'cara@nguyen.example', 250, { recurring: true }),
  g('ch_s4', 20, 'Dev Patel', 'dev@patel.example', 100, { refunded: true }),
  g('ch_s5', 15, 'Eli Brook', 'eli@brook.example', 75, { status: 'failed' }),
  g('ch_s6', 10, 'Anonymous', '', 20),
].map(json => ({ json }));`),
    merge('Combine donation sources'),
    code('Collect new gifts', `
// Keep successful, unrefunded charges with an email, oldest first so receipt numbers follow gift order.
const gifts = [], skipped = [];
for (const { json: c } of $input.all()) {
  const reason = c.status !== 'succeeded' ? 'charge ' + c.status : c.refunded ? 'refunded' : !c.email ? 'no donor email' : '';
  if (reason) skipped.push({ id: c.id, reason }); else gifts.push(c);
}
gifts.sort((a, b) => a.created - b.created);
return [{ json: { gifts, skipped, emails: [...new Set(gifts.map(g => g.email))] } }];`),
    ifTrue('Any new gifts?', '$json.gifts.length > 0'),
    stop('STOP: no new gifts'),
    ifTrue('Use sample history?', '!' + cfg('airtable_enabled')),
    http('Look up past gifts in Airtable', {
      url: `={{ 'https://api.airtable.com/v0/' + ${cfg('airtable_base_id')} + '/' + encodeURIComponent(${cfg('gifts_table')}) }}`, auth: 'airtableTokenApi',
      query: { filterByFormula: `={{ 'OR(' + $json.emails.map(e => "LOWER({Email})='" + e.replace(/'/g, "\\\\'") + "'").join(',') + ')' }}`, 'fields[]': 'Email', pageSize: '100' },
    }),
    code('Count past gifts per donor', `
// Airtable records -> { email: number of earlier gifts }.
const history = {};
for (const page of $input.all()) for (const r of page.json.records || []) {
  const e = String(r.fields?.Email || '').toLowerCase();
  if (e) history[e] = (history[e] || 0) + 1;
}
return [{ json: { history } }];`),
    code('Load sample gift history', `
// Used until AIRTABLE_BASE_ID is set: Ben has given twice before.
return [{ json: { history: { 'ben@okafor.example': 2 } } }];`),
    merge('Combine history sources'),
    code('Number receipts and pick wording', `
// Receipt numbers follow gift order. A donor giving twice in one run is first-time
// only for the first gift. The tax line is added at or above the threshold.
const cfg = $('config').first().json;
const { gifts } = $('Collect new gifts').first().json;
const history = { ...$input.first().json.history };
let n = $('Work out the start time').first().json.next_receipt;
const year = new Date().getFullYear();
return gifts.map(g => {
  const before = history[g.email] || 0;
  history[g.email] = before + 1;
  const donor_type = before === 0 ? 'first-time' : 'returning';
  return { json: { ...g, donor_type, past_gifts: before, receipt_number: cfg.receipt_prefix + '-' + year + '-' + String(n++).padStart(5, '0'),
    tax_line: g.amount >= cfg.tax_receipt_threshold, next_receipt: n } };
});`),
    code('Write the thank-you email', `
// Wording changes with donor type and monthly giving; the facts are the same for everyone.
const cfg = $('config').first().json;
return $input.all().map(({ json: g }) => {
  const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: g.currency }).format(g.amount);
  const first = g.name.split(' ')[0] || 'friend';
  const open = g.donor_type === 'first-time'
    ? 'Thank you for your first gift to ' + cfg.org_name + ', and welcome.'
    : 'Thank you again. This is your gift number ' + (g.past_gifts + 1) + ' to ' + cfg.org_name + ', and it means a lot that you keep coming back.';
  const body = [
    'Dear ' + first + ',', '', open,
    g.recurring ? 'Your monthly gift of ' + money + ' has been received. You can change or stop it at any time by replying to this email.' : 'We have received your gift of ' + money + (g.fund ? ' for the ' + g.fund : '') + '.', '',
    'Receipt number: ' + g.receipt_number,
    'Date: ' + new Date(g.created * 1000).toISOString().slice(0, 10),
    'Amount: ' + money,
    g.tax_line ? '' : null, g.tax_line ? cfg.tax_line : null, '',
    'With thanks,', cfg.signatory, cfg.org_name,
  ].filter(l => l !== null).join('\\n');
  return { json: { ...g, subject: 'Thank you for your gift - receipt ' + g.receipt_number, body, send_to: cfg.mode === 'test' ? cfg.test_email : g.email } };
});`),
    ifTrue('Sending switched on?', cfg('sends_enabled')),
    stop('STOP: preview - nothing sent'),
    gmail.send('Email the thank-you', { to: '$json.send_to', subject: "($('config').first().json.mode === 'test' ? '[TEST to ' + $json.email + '] ' : '') + $json.subject", message: '$json.body' }),
    ifTrue('Live run?', cfg('live')),
    ifTrue('Airtable set for logging?', cfg('airtable_enabled')),
    stop('STOP: test send - nothing logged'),
    http('Log the gift in Airtable', {
      method: 'POST', url: `={{ 'https://api.airtable.com/v0/' + ${cfg('airtable_base_id')} + '/' + encodeURIComponent(${cfg('gifts_table')}) }}`, auth: 'airtableTokenApi',
      jsonBody: "JSON.stringify({ typecast: true, records: [{ fields: (g => ({ Email: g.email, Name: g.name, Amount: g.amount, Currency: g.currency, Date: new Date(g.created * 1000).toISOString().slice(0, 10), 'Receipt number': g.receipt_number, 'Donor type': g.donor_type, 'Stripe charge': g.id }))($('Write the thank-you email').item.json) }] })",
    }),
    code('Move the cursor and counter', `
// Live only, after logging: the next run starts after the newest gift and the next free receipt number.
const store = $getWorkflowStaticData('global');
const gifts = $('Write the thank-you email').all().map(i => i.json);
store.last_created = Math.max(store.last_created || 0, ...gifts.map(g => g.created));
store.next_receipt = Math.max(store.next_receipt || 0, ...gifts.map(g => g.next_receipt));
return [{ json: { last_created: store.last_created, next_receipt: store.next_receipt } }];`),
  ],
  edges: [
    ['Run manually', 'config'], ['Every hour', 'config'],
    ['config', 'Work out the start time'],
    ['Work out the start time', 'Use sample donations?'],
    ['Use sample donations?', 0, 'Load sample donations'], ['Use sample donations?', 1, 'Fetch new Stripe charges'],
    ['Fetch new Stripe charges', 'Read Stripe charges'],
    ['Load sample donations', 'Combine donation sources'], ['Read Stripe charges', 0, 'Combine donation sources', 1],
    ['Combine donation sources', 'Collect new gifts'],
    ['Collect new gifts', 'Any new gifts?'],
    ['Any new gifts?', 0, 'Use sample history?'], ['Any new gifts?', 1, 'STOP: no new gifts'],
    ['Use sample history?', 0, 'Load sample gift history'], ['Use sample history?', 1, 'Look up past gifts in Airtable'],
    ['Look up past gifts in Airtable', 'Count past gifts per donor'],
    ['Load sample gift history', 'Combine history sources'], ['Count past gifts per donor', 0, 'Combine history sources', 1],
    ['Combine history sources', 'Number receipts and pick wording'],
    ['Number receipts and pick wording', 'Write the thank-you email'],
    ['Write the thank-you email', 'Sending switched on?'],
    ['Sending switched on?', 0, 'Email the thank-you'], ['Sending switched on?', 1, 'STOP: preview - nothing sent'],
    ['Email the thank-you', 'Live run?'],
    ['Live run?', 0, 'Airtable set for logging?'], ['Live run?', 1, 'STOP: test send - nothing logged'],
    ['Airtable set for logging?', 0, 'Log the gift in Airtable'], ['Airtable set for logging?', 1, 'Move the cursor and counter'],
    ['Log the gift in Airtable', 'Move the cursor and counter'],
  ],
  groups: [
    { title: 'Start and settings', why: 'Runs five minutes past every hour. Receipt numbering, the tax threshold and the email sign-off are all set in `config`.', nodes: ['Run manually', 'Every hour', 'config'] },
    { title: 'Read new donations', why: '`Work out the start time` reads the stored cursor, so only charges after the last processed one are fetched. Failed, refunded and email-less charges stop at `Collect new gifts`, and an empty hour ends at `STOP: no new gifts`.', nodes: ['Work out the start time', 'Use sample donations?', 'Load sample donations', 'Fetch new Stripe charges', 'Read Stripe charges', 'Combine donation sources', 'Collect new gifts', 'Any new gifts?', 'STOP: no new gifts'] },
    { title: 'Check history and number receipts', why: 'Airtable is queried only for the donors in this batch. `Number receipts and pick wording` assigns numbers in gift order, so receipts never skip or repeat within a run.', nodes: ['Use sample history?', 'Load sample gift history', 'Look up past gifts in Airtable', 'Count past gifts per donor', 'Combine history sources', 'Number receipts and pick wording', 'Write the thank-you email'] },
    { title: 'Send, log and advance', why: 'A test send goes to `TEST_EMAIL` and logs nothing. Only a live run writes to Airtable and moves the cursor and receipt counter, so test runs never use up receipt numbers.', nodes: ['Sending switched on?', 'STOP: preview - nothing sent', 'Email the thank-you', 'Live run?', 'STOP: test send - nothing logged', 'Airtable set for logging?', 'Log the gift in Airtable', 'Move the cursor and counter'] },
  ],
  scenarios: [
    {
      name: 'shipped config (preview)', start: 'Run manually',
      expect: { reached: ['Load sample donations', 'Load sample gift history', 'STOP: preview - nothing sent'], outward: 'none' },
      check: out => {
        const w = out['Write the thank-you email'];
        const f: string[] = [];
        const year = new Date().getFullYear();
        const got = w.map((g: any) => `${g.id}:${g.donor_type}:${g.receipt_number}:${g.tax_line}`).join(',');
        const want = `ch_s1:first-time:R-${year}-01001:false,ch_s2:returning:R-${year}-01002:true,ch_s3:first-time:R-${year}-01003:true`;
        if (got !== want) f.push(`receipts wrong: ${got}`);
        if (out['Collect new gifts'][0].skipped.length !== 3) f.push('refunded, failed and email-less charges should be skipped');
        if (!w[1].body.includes('gift number 3')) f.push('returning donor wording should count gifts');
        if (!w[2].body.includes('monthly gift') || !w[2].body.includes('No goods or services')) f.push('monthly gift at threshold needs both lines');
        if (w[0].body.includes('No goods or services')) f.push('small gift should not get the tax line');
        return f;
      },
    },
    {
      name: 'test send to TEST_EMAIL', start: 'Run manually', overrides: { TEST_EMAIL: 'you@example.com' },
      mocks: { 'Email the thank-you': (items: any[]) => items.map(() => ({ id: 'msg', labelIds: ['SENT'] })) },
      expect: { reached: ['Email the thank-you', 'STOP: test send - nothing logged'], notReached: ['Log the gift in Airtable', 'Move the cursor and counter'], outward: 'some' },
      check: out => out['Write the thank-you email'].every((g: any) => g.send_to === 'you@example.com') ? [] : ['test send not redirected'],
    },
    {
      name: 'live with Stripe and Airtable', start: 'Every hour',
      overrides: { USE_STRIPE: true, AIRTABLE_BASE_ID: 'appAbc123', TEST_RUN: false },
      mocks: {
        'Fetch new Stripe charges': [{ object: 'list', data: [
          { id: 'ch_L2', created: Math.floor(Date.now() / 1000) - 600, status: 'succeeded', refunded: false, amount: 2500, currency: 'usd', billing_details: { name: 'Maya Ortiz', email: 'Maya@Ortiz.example' }, invoice: null, metadata: {} },
          { id: 'ch_L1', created: Math.floor(Date.now() / 1000) - 1200, status: 'succeeded', refunded: false, amount: 50000, currency: 'usd', billing_details: { name: 'Maya Ortiz', email: 'maya@ortiz.example' }, invoice: null, metadata: {} },
        ] }],
        'Look up past gifts in Airtable': [{ records: [] }],
        'Email the thank-you': (items: any[]) => items.map(() => ({ id: 'msg', labelIds: ['SENT'] })),
        'Log the gift in Airtable': (items: any[]) => items.map(() => ({ records: [{ id: 'rec1', fields: {} }] })),
      },
      expect: { reached: ['Count past gifts per donor', 'Log the gift in Airtable', 'Move the cursor and counter'], outward: 'some' },
      check: out => {
        const w = out['Write the thank-you email'];
        const f: string[] = [];
        if (w[0]?.id !== 'ch_L1' || w[0]?.donor_type !== 'first-time' || w[1]?.donor_type !== 'returning') f.push('two gifts from one new donor: first is first-time, second returning');
        if (out['Move the cursor and counter'][0].next_receipt !== 1003) f.push(`counter should be 1003, got ${out['Move the cursor and counter'][0].next_receipt}`);
        return f;
      },
    },
  ],
});
