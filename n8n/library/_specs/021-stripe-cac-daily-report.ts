import { defineSpec } from '../_kit/spec';
import { trigger, code, ifTrue, merge, stop, http, sheets, slack } from '../_kit/n';

const cfg = (k: string) => `$('config').first().json.${k}`;

export default defineSpec({
  slug: 'stripe-cac-daily-report',
  title: 'Combine Stripe revenue and Google Sheets ad spend into a daily CAC report in Slack',
  summary: 'Every morning, counts new paying Stripe subscriptions by acquisition channel, joins them to ad spend from a Google Sheet, and posts yesterday\'s and the 7-day CAC, CAC per channel and payback months to Slack, with channels that spent without converting called out.',
  category: 'Finance and billing',
  description: {
    who: 'Founders and growth marketers at subscription businesses who log ad spend in a Google Sheet and sell through Stripe. The morning post answers what a new customer cost yesterday and over the last week, per channel.',
    how: [
      'Every day at 07:15 it reads Stripe subscriptions created in the last 8 days and the Ad spend tab, or sample data for either until connected.',
      'Only subscriptions that are active or past due count as new customers. The channel comes from the customer metadata key in `CHANNEL_METADATA_FIELD`, cleaned up through `CHANNEL_ALIASES`.',
      'For yesterday and for the 7 complete days before today it works out blended CAC (spend divided by new customers), CAC per channel, average new MRR, and payback months at your gross margin.',
      'Channels that spent money with no new customers, and a 7-day CAC above `TARGET_CAC`, are flagged in the Slack post.',
    ],
    setup: [
      'Run it once as imported. It reports on sample data and stops at `STOP: preview - nothing posted`.',
      'Add a Stripe credential to `Fetch new subscriptions` and set `USE_STRIPE = true`. Store the acquisition channel on each Stripe customer as metadata.',
      'Connect Google Sheets with `SPEND_SHEET_ID` (Ad spend tab: Date, Channel, Spend) and Slack with `SLACK_CHANNEL_ID`.',
      'For a test, set `TEST_EMAIL` to any address and `TEST_SLACK_CHANNEL` to a private channel, where the test report lands. Set `TEST_RUN = false` for the daily post to `SLACK_CHANNEL_ID`.',
    ],
    requirements: ['A Stripe account with subscriptions', 'A Google Sheet with daily ad spend', 'A Slack workspace'],
    customize: [
      '`GROSS_MARGIN` and `TARGET_CAC` drive payback and the warning line.',
      '`CHANNEL_ALIASES` folds names like adwords and google into one channel.',
      '`WINDOW_DAYS` changes the rolling window from 7 days.',
    ],
  },
  config: {
    intro: ['USE_STRIPE false -> SAMPLE subscriptions. SPEND_SHEET_ID blank -> SAMPLE ad spend.', 'Days are UTC calendar days; today is never counted because it is incomplete.', 'Test mode (TEST_RUN true + TEST_EMAIL set) posts to TEST_SLACK_CHANNEL, never to SLACK_CHANNEL_ID.'],
    consts: [
      { name: 'USE_STRIPE', value: false, note: 'set true after adding the Stripe credential' },
      { name: 'SPEND_SHEET_ID', value: '', note: 'Google Sheets id with an Ad spend tab; blank uses sample spend' },
      { name: 'CHANNEL_METADATA_FIELD', value: 'channel', note: 'Stripe customer metadata key holding the acquisition channel' },
      { name: 'CHANNEL_ALIASES', value: { google: 'Google Ads', adwords: 'Google Ads', 'google ads': 'Google Ads', meta: 'Meta Ads', facebook: 'Meta Ads', instagram: 'Meta Ads', 'meta ads': 'Meta Ads', linkedin: 'LinkedIn Ads', 'linkedin ads': 'LinkedIn Ads' }, note: 'lowercase name -> channel used in the report' },
      { name: 'COUNTED_STATUSES', value: ['active', 'past_due'], note: 'subscription statuses that count as a new paying customer' },
      { name: 'WINDOW_DAYS', value: 7, note: 'rolling window in complete days' },
      { name: 'GROSS_MARGIN', value: 0.8, note: 'share of MRR kept after cost of service, for payback' },
      { name: 'TARGET_CAC', value: 140, note: '7-day blended CAC above this is flagged' },
      { name: 'CURRENCY', value: 'USD', note: 'currency of spend and prices' },
      { name: 'SLACK_CHANNEL_ID', value: '', note: 'channel for the report; blank posts nothing' },
      { name: 'TEST_SLACK_CHANNEL', value: '', note: 'test mode posts here instead of the real channel; blank means test mode posts nothing' },
    ],
    flags: { sheets_enabled: "SPEND_SHEET_ID.trim() !== ''", slack_enabled: "SLACK_CHANNEL_ID.trim() !== ''", test_slack_enabled: "TEST_SLACK_CHANNEL.trim() !== ''" },
    safety: 'test_run',
  },
  nodes: [
    trigger.manual(),
    trigger.schedule('Every day at 07:15', '15 7 * * *'),
    ifTrue('Use sample subscriptions?', '!' + cfg('use_stripe')),
    code('Load sample subscriptions', `
// Used until USE_STRIPE is true. 14 counted signups over 7 days, plus one incomplete
// and one from today, which must both be ignored.
const at = d => Math.floor((Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()) - d * 864e5) / 1000) + 3600 * 10;
const s = (n, day, channel, mrr, status = 'active') => ({ id: 'sub_s' + n, created: at(day), status, channel, mrr });
return [{ json: { subs: [
  s(1, 1, 'google', 49), s(2, 1, 'Google Ads', 91), s(3, 1, 'facebook', 91),
  s(4, 2, 'google', 49), s(5, 2, '', 91), s(6, 3, 'adwords', 49), s(7, 3, 'meta', 49),
  s(8, 4, 'google', 91), s(9, 4, '', 49), s(10, 5, 'google', 49), s(11, 5, 'instagram', 91),
  s(12, 6, 'google', 91), s(13, 7, 'google', 49), s(14, 7, 'meta', 49),
  s(15, 2, 'google', 99, 'incomplete'), s(16, 0, 'google', 99),
] } }];`),
    http('Fetch new subscriptions', { url: 'https://api.stripe.com/v1/subscriptions', auth: 'stripeApi',
      query: { status: 'all', limit: '100', 'created[gte]': `={{ Math.floor(Date.now() / 1000) - (${cfg('window_days')} + 1) * 86400 }}`, 'expand[0]': 'data.customer' } }),
    code('Read new subscriptions', `
// MRR from each item: unit price x quantity, yearly prices divided by 12, weekly x 52/12.
const cfg = $('config').first().json;
const subs = [];
for (const page of $input.all()) for (const s of page.json.data || []) {
  const mrr = (s.items?.data || []).reduce((sum, it) => {
    const p = it.price || {}, r = p.recurring || {};
    const per = (p.unit_amount || 0) * (it.quantity || 1) / 100 / (r.interval_count || 1);
    return sum + (r.interval === 'year' ? per / 12 : r.interval === 'week' ? per * 52 / 12 : r.interval === 'day' ? per * 365 / 12 : per);
  }, 0);
  const meta = typeof s.customer === 'object' ? s.customer.metadata || {} : {};
  subs.push({ id: s.id, created: s.created, status: s.status, channel: meta[cfg.channel_metadata_field] || s.metadata?.[cfg.channel_metadata_field] || '', mrr: Math.round(mrr * 100) / 100 });
}
return [{ json: { subs } }];`),
    merge('Combine subscription sources'),
    ifTrue('Use sample ad spend?', '!' + cfg('sheets_enabled')),
    code('Load sample ad spend', `
// Used until SPEND_SHEET_ID is set: three channels every day, LinkedIn never converts.
const day = n => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
const rows = [];
for (let n = 1; n <= 7; n++) rows.push({ Date: day(n), Channel: 'Google Ads', Spend: 150 }, { Date: day(n), Channel: 'Meta', Spend: '90.00' }, { Date: day(n), Channel: 'LinkedIn', Spend: 60 });
rows.push({ Date: day(0), Channel: 'Google Ads', Spend: 40 }, { Date: day(9), Channel: 'Google Ads', Spend: 150 });
return [{ json: { spend: rows } }];`),
    sheets.read('Read the Ad spend tab', cfg('spend_sheet_id'), 'Ad spend'),
    code('Collect ad spend', `
// Sheet rows -> one item in the sample shape.
return [{ json: { spend: $input.all().map(i => i.json) } }];`),
    merge('Combine spend sources'),
    code('Work out CAC and payback', `
// CAC = spend / new paying customers, per day and per channel, for yesterday and the
// rolling window. Payback months = CAC / (average new MRR x GROSS_MARGIN).
const cfg = $('config').first().json;
const subs = $('Combine subscription sources').first().json.subs;
const spendRows = $input.first().json.spend;
const today = new Date().toISOString().slice(0, 10);
const dayOf = n => new Date(Date.parse(today) - n * 864e5).toISOString().slice(0, 10);
const yesterday = dayOf(1);
const windowDays = new Set(Array.from({ length: cfg.window_days }, (_, i) => dayOf(i + 1)));
const alias = c => { const k = String(c || '').trim().toLowerCase(); return k ? (cfg.channel_aliases[k] || String(c).trim()) : 'Unattributed'; };
const num = v => typeof v === 'number' ? v : Number(String(v ?? '').replace(/[^0-9.-]/g, '')) || 0;
const customers = subs.filter(s => cfg.counted_statuses.includes(s.status)).map(s => ({ ...s, day: new Date(s.created * 1000).toISOString().slice(0, 10), channel: alias(s.channel) }))
  .filter(s => windowDays.has(s.day));
const spend = spendRows.map(r => ({ day: String(r.Date).slice(0, 10), channel: alias(r.Channel), amount: num(r.Spend) })).filter(r => windowDays.has(r.day));
const r1 = x => Math.round(x * 10) / 10, r2 = x => Math.round(x * 100) / 100;
const stats = (cs, sp) => {
  const n = cs.length, total = sp.reduce((s, r) => s + r.amount, 0), mrr = n ? cs.reduce((s, c) => s + c.mrr, 0) / n : 0;
  const cac = n ? total / n : null;
  return { customers: n, spend: r2(total), cac: cac === null ? null : r2(cac), avg_mrr: r2(mrr), payback_months: cac !== null && mrr > 0 ? r1(cac / (mrr * cfg.gross_margin)) : null };
};
const y = stats(customers.filter(c => c.day === yesterday), spend.filter(r => r.day === yesterday));
const w = stats(customers, spend);
const channels = [...new Set([...customers.map(c => c.channel), ...spend.map(r => r.channel)])].map(ch => ({ channel: ch, ...stats(customers.filter(c => c.channel === ch), spend.filter(r => r.channel === ch)) }))
  .sort((a, b) => b.spend - a.spend);
const flags = [];
for (const c of channels) if (c.spend > 0 && c.customers === 0) flags.push(c.channel + ' spent ' + c.spend + ' with no new customers');
if (w.cac !== null && w.cac > cfg.target_cac) flags.push(cfg.window_days + '-day CAC ' + w.cac + ' is above TARGET_CAC ' + cfg.target_cac);
return [{ json: { yesterday: { date: yesterday, ...y }, window: { days: cfg.window_days, ...w }, channels, flags } }];`),
    code('Write the Slack report', `
// Yesterday first, then the rolling window, then one line per channel.
const cfg = $('config').first().json;
const { yesterday: y, window: w, channels, flags } = $input.first().json;
const m = n => n === null ? 'n/a' : new Intl.NumberFormat('en-US', { style: 'currency', currency: cfg.currency, maximumFractionDigits: 0 }).format(n);
const pb = n => n === null ? 'n/a' : n + ' mo';
const text = [
  (cfg.mode === 'test' ? '[TEST] ' : '') + '*CAC report for ' + y.date + '*',
  'Yesterday: ' + y.customers + ' new customers, ' + m(y.spend) + ' spend, CAC ' + m(y.cac) + ', payback ' + pb(y.payback_months),
  w.days + ' days: ' + w.customers + ' new customers, ' + m(w.spend) + ' spend, CAC ' + m(w.cac) + ', avg new MRR ' + m(w.avg_mrr) + ', payback ' + pb(w.payback_months),
  '', '*By channel (' + w.days + ' days)*',
  ...channels.map(c => '- ' + c.channel + ': ' + c.customers + ' customers, ' + m(c.spend) + ' spend, CAC ' + m(c.cac)),
  ...(flags.length ? ['', ':warning: ' + flags.join('\\n:warning: ')] : []),
].join('\\n');
return [{ json: { text, send_to: cfg.mode === 'test' ? cfg.test_slack_channel.trim() : cfg.slack_channel_id } }];`),
    ifTrue('Posting switched on?', `${cfg('sends_enabled')} && (${cfg('mode')} === 'test' || ${cfg('slack_enabled')})`),
    stop('STOP: preview - nothing posted'),
    ifTrue('Test channel set?', `${cfg('mode')} !== 'test' || ${cfg('test_slack_enabled')}`),
    stop('STOP: test - TEST_SLACK_CHANNEL blank'),
    slack.post('Post the CAC report to Slack', '$json.send_to', '$json.text'),
  ],
  edges: [
    ['Run manually', 'config'], ['Every day at 07:15', 'config'],
    ['config', 'Use sample subscriptions?'],
    ['Use sample subscriptions?', 0, 'Load sample subscriptions'], ['Use sample subscriptions?', 1, 'Fetch new subscriptions'],
    ['Fetch new subscriptions', 'Read new subscriptions'],
    ['Load sample subscriptions', 'Combine subscription sources'], ['Read new subscriptions', 0, 'Combine subscription sources', 1],
    ['Combine subscription sources', 'Use sample ad spend?'],
    ['Use sample ad spend?', 0, 'Load sample ad spend'], ['Use sample ad spend?', 1, 'Read the Ad spend tab'],
    ['Read the Ad spend tab', 'Collect ad spend'],
    ['Load sample ad spend', 'Combine spend sources'], ['Collect ad spend', 0, 'Combine spend sources', 1],
    ['Combine spend sources', 'Work out CAC and payback'],
    ['Work out CAC and payback', 'Write the Slack report'],
    ['Write the Slack report', 'Posting switched on?'],
    ['Posting switched on?', 0, 'Test channel set?'], ['Posting switched on?', 1, 'STOP: preview - nothing posted'],
    ['Test channel set?', 0, 'Post the CAC report to Slack'], ['Test channel set?', 1, 'STOP: test - TEST_SLACK_CHANNEL blank'],
  ],
  groups: [
    { title: 'Start and settings', why: 'Runs at 07:15 so yesterday is a complete UTC day in both Stripe and the sheet. Margin, target CAC and channel aliases live in `config`.', nodes: ['Run manually', 'Every day at 07:15', 'config'] },
    { title: 'Read new subscriptions', why: 'Subscriptions carry price and interval, so MRR per new customer comes from the same call. `Load sample subscriptions` stands in until `USE_STRIPE` is true.', nodes: ['Use sample subscriptions?', 'Load sample subscriptions', 'Fetch new subscriptions', 'Read new subscriptions', 'Combine subscription sources'] },
    { title: 'Read ad spend', why: 'The spend tab is read once, after the subscriptions are collected into one item. `Load sample ad spend` covers it until `SPEND_SHEET_ID` is set.', nodes: ['Use sample ad spend?', 'Load sample ad spend', 'Read the Ad spend tab', 'Collect ad spend', 'Combine spend sources'] },
    { title: 'Compute and post', why: 'Today is excluded and channel names pass through `CHANNEL_ALIASES` before joining, so "facebook" spend and "Meta" signups land in one row. Spend with no conversions is flagged rather than shown as a zero CAC. A test report goes only to `TEST_SLACK_CHANNEL`, and stops at a STOP if that is blank.', nodes: ['Work out CAC and payback', 'Write the Slack report', 'Posting switched on?', 'STOP: preview - nothing posted', 'Test channel set?', 'STOP: test - TEST_SLACK_CHANNEL blank', 'Post the CAC report to Slack'] },
  ],
  scenarios: [
    {
      name: 'shipped config (preview)', start: 'Run manually',
      expect: { reached: ['Load sample subscriptions', 'Load sample ad spend', 'STOP: preview - nothing posted'], outward: 'none' },
      check: out => {
        const r = out['Work out CAC and payback'][0];
        const f: string[] = [];
        if (r.yesterday.customers !== 3 || r.yesterday.spend !== 300 || r.yesterday.cac !== 100) f.push(`yesterday wrong: ${JSON.stringify(r.yesterday)}`);
        if (r.window.customers !== 14 || r.window.spend !== 2100 || r.window.cac !== 150 || r.window.avg_mrr !== 67 || r.window.payback_months !== 2.8) f.push(`window wrong: ${JSON.stringify(r.window)}`);
        const ch = Object.fromEntries(r.channels.map((c: any) => [c.channel, c]));
        if (ch['Google Ads']?.customers !== 8 || ch['Google Ads']?.cac !== 131.25) f.push(`Google Ads wrong: ${JSON.stringify(ch['Google Ads'])}`);
        if (ch['Meta Ads']?.customers !== 4 || ch['Meta Ads']?.cac !== 157.5) f.push(`Meta folding wrong: ${JSON.stringify(ch['Meta Ads'])}`);
        if (ch['Unattributed']?.customers !== 2) f.push('two unattributed customers expected');
        if (r.flags.length !== 2) f.push(`expected LinkedIn and target flags, got ${r.flags}`);
        return f;
      },
    },
    {
      name: 'test mode with no test channel', start: 'Run manually',
      overrides: { TEST_EMAIL: 'you@example.com', SLACK_CHANNEL_ID: 'C0GROWTH' },
      expect: { reached: ['STOP: test - TEST_SLACK_CHANNEL blank'], notReached: ['Post the CAC report to Slack', 'STOP: preview - nothing posted'], outward: 'none' },
    },
    {
      name: 'test mode into the test channel', start: 'Run manually',
      overrides: { TEST_EMAIL: 'you@example.com', SLACK_CHANNEL_ID: 'C0GROWTH', TEST_SLACK_CHANNEL: 'C0TESTCHAN' },
      mocks: { 'Post the CAC report to Slack': (items: any[]) => items.map(j => ({ ok: true, channel: j.send_to })) },
      expect: { reached: ['Post the CAC report to Slack'], notReached: ['STOP: preview - nothing posted'], outward: 'some' },
      check: out => {
        const f: string[] = [];
        if (out['Post the CAC report to Slack'][0]?.channel !== 'C0TESTCHAN') f.push(`test post must go to TEST_SLACK_CHANNEL, went to ${out['Post the CAC report to Slack'][0]?.channel}`);
        if (!out['Write the Slack report'][0].text.startsWith('[TEST] ')) f.push('test report needs the [TEST] prefix');
        return f;
      },
    },
    {
      name: 'live with Stripe, Sheets and Slack', start: 'Every day at 07:15',
      overrides: { USE_STRIPE: true, SPEND_SHEET_ID: '1SpendSheet', SLACK_CHANNEL_ID: 'C0GROWTH', TEST_RUN: false },
      mocks: {
        'Fetch new subscriptions': [{ object: 'list', data: [
          { id: 'sub_L1', created: Math.floor(Date.now() / 1000) - 30 * 3600, status: 'active', customer: { id: 'cus_1', metadata: { channel: 'LinkedIn' } },
            items: { data: [{ quantity: 2, price: { unit_amount: 120000, recurring: { interval: 'year', interval_count: 1 } } }] } },
        ] }],
        'Read the Ad spend tab': [{ row_number: 2, Date: new Date(Date.now() - 30 * 3600e3).toISOString().slice(0, 10), Channel: 'linkedin ads', Spend: '$400.00' }],
        'Post the CAC report to Slack': (items: any[]) => items.map(j => ({ ok: true, channel: j.send_to })),
      },
      expect: { reached: ['Read new subscriptions', 'Collect ad spend', 'Post the CAC report to Slack'], notReached: ['Load sample subscriptions', 'Load sample ad spend'], outward: 'some' },
      check: out => {
        const r = out['Work out CAC and payback'][0];
        const f: string[] = [];
        if (out['Read new subscriptions'][0].subs[0].mrr !== 200) f.push('2 x 1200/year should be 200 MRR');
        if (r.window.cac !== 400 || r.window.payback_months !== 2.5) f.push(`live CAC/payback wrong: ${JSON.stringify(r.window)}`);
        if (r.channels[0]?.channel !== 'LinkedIn Ads') f.push('LinkedIn aliases should fold together');
        if (out['Post the CAC report to Slack'][0]?.channel !== 'C0GROWTH') f.push('live post must go to SLACK_CHANNEL_ID');
        return f;
      },
    },
  ],
});
