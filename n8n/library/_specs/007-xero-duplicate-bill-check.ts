import { defineSpec } from '../_kit/spec';
import { trigger, code, ifTrue, merge, stop, http, slack } from '../_kit/n';

const cfg = (k: string) => `$('config').first().json.${k}`;

export default defineSpec({
  slug: 'xero-duplicate-bill-check',
  title: 'Detect likely duplicate bills in Xero and post a review list to Slack',
  summary: 'Scores every pair of draft and awaiting-payment Xero bills from the last 90 days on supplier, amount, date and reference, and posts the pairs above a threshold to Slack with links to both bills. It only reads from Xero; nothing is voided or edited.',
  category: 'Finance and billing',
  description: {
    who: 'Accounts payable staff and bookkeepers on Xero who enter bills from email, scans and supplier portals, where the same invoice often gets keyed twice. The check runs before each payment run so a duplicate is caught before it is paid.',
    how: [
      'Every Tuesday and Thursday at 08:00 it reads bills with status Draft or Awaiting Payment from the last 90 days, or a sample set until Xero is connected.',
      'Each pair of bills from the same supplier, or from two suppliers whose names differ by a typo, is scored: 30 for the supplier, 30 for the same amount, 25 for the same date and 40 for the same supplier reference.',
      'Two different references take 30 points off, so weekly bills of the same amount are not flagged. Pairs scoring 70 or more go on the list.',
      'Slack gets each pair with the reasons and a link to both bills. Pairs already posted are not posted again.',
    ],
    setup: [
      'Run it once as imported. It scores sample bills and stops at `STOP: preview - nothing posted`.',
      'Add a Xero OAuth2 credential to `Fetch bills from Xero`, put your organisation id in `XERO_TENANT_ID`, then set `USE_XERO = true`.',
      'Connect Slack and set `SLACK_CHANNEL_ID`.',
      'For a test, set `TEST_EMAIL` to any address and `TEST_SLACK_CHANNEL` to a private channel, where the test list lands. Set `TEST_RUN = false` to post to `SLACK_CHANNEL_ID` and remember posted pairs.',
    ],
    requirements: ['A Xero organisation with bills', 'A Slack workspace'],
    customize: [
      '`REVIEW_SCORE` raises or lowers how sure a pair must be before it is posted.',
      '`AMOUNT_TOLERANCE`, `AMOUNT_NEAR_PCT` and `DATE_WINDOW_DAYS` set what counts as the same amount and date.',
      '`LOOKBACK_DAYS` limits how far back bills are compared.',
    ],
  },
  config: {
    intro: ['USE_XERO false -> SAMPLE bills so the run works before any credential exists.', 'This workflow only reads Xero. It never voids, deletes or edits a bill.', 'Test mode (TEST_RUN true + TEST_EMAIL set) posts to TEST_SLACK_CHANNEL, never to SLACK_CHANNEL_ID.'],
    consts: [
      { name: 'USE_XERO', value: false, note: 'set true after adding the Xero credential and XERO_TENANT_ID' },
      { name: 'XERO_TENANT_ID', value: '', note: 'Xero organisation (tenant) id, sent as the xero-tenant-id header' },
      { name: 'LOOKBACK_DAYS', value: 90, note: 'bills dated within this many days are compared' },
      { name: 'AMOUNT_TOLERANCE', value: 0.5, note: 'totals this close count as the same amount' },
      { name: 'AMOUNT_NEAR_PCT', value: 2, note: 'totals within this percent score half the amount points' },
      { name: 'DATE_WINDOW_DAYS', value: 14, note: 'bill dates this close score the date points' },
      { name: 'REVIEW_SCORE', value: 70, note: 'pairs at or above this score are posted' },
      { name: 'SLACK_CHANNEL_ID', value: '', note: 'channel for the review list; blank means nothing is posted' },
      { name: 'TEST_SLACK_CHANNEL', value: '', note: 'test mode posts here instead of the real channel; blank means test mode posts nothing' },
    ],
    flags: { slack_enabled: "SLACK_CHANNEL_ID.trim() !== ''", test_slack_enabled: "TEST_SLACK_CHANNEL.trim() !== ''" },
    safety: 'test_run',
  },
  nodes: [
    trigger.manual(),
    trigger.schedule('Tuesday and Thursday at 08:00', '0 8 * * 2,4'),
    ifTrue('Xero connected?', cfg('use_xero')),
    http('Fetch bills from Xero', {
      url: 'https://api.xero.com/api.xro/2.0/Invoices', auth: 'xeroOAuth2Api',
      headers: { 'xero-tenant-id': `={{ ${cfg('xero_tenant_id')} }}`, Accept: 'application/json' },
      query: {
        where: `={{ 'Type=="ACCPAY" AND Date>=DateTime(' + new Date(Date.now() - ${cfg('lookback_days')} * 864e5).toISOString().slice(0, 10).replace(/-/g, ',') + ')' }}`,
        Statuses: 'DRAFT,AUTHORISED', order: 'Date DESC', page: '1',
      },
    }),
    code('Read Xero bills', `
// Xero Invoices response -> one item per bill. Dates come as DateString, or as
// the older /Date(ms+0000)/ form, so both are handled.
const toDate = (s, legacy) => {
  if (s) return String(s).slice(0, 10);
  const m = String(legacy || '').match(/\\/Date\\((\\d+)/);
  return m ? new Date(Number(m[1])).toISOString().slice(0, 10) : '';
};
const out = [];
for (const page of $input.all()) {
  for (const b of page.json.Invoices || []) {
    if (b.Type !== 'ACCPAY') continue;
    out.push({ json: { id: b.InvoiceID, number: b.InvoiceNumber || '', reference: b.Reference || '', contact_id: b.Contact?.ContactID || '',
      contact: b.Contact?.Name || '', date: toDate(b.DateString, b.Date), total: Number(b.Total || 0), currency: b.CurrencyCode || '', status: b.Status } });
  }
}
return out;`),
    code('Load sample bills', `
// Used until USE_XERO is true. Three real duplicates hidden among recurring look-alikes.
const day = n => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
const b = (id, contact_id, contact, number, total, d, status = 'AUTHORISED') => ({ id, number, reference: '', contact_id, contact, date: day(d), total, currency: 'USD', status });
return [
  b('bill-01', 'c-green', 'Greenleaf Supplies', 'INV-2041', 1250.00, 10),
  b('bill-02', 'c-green', 'Greenleaf Supplies', 'INV2041', 1250.00, 8, 'DRAFT'),
  b('bill-03', 'c-metro', 'Metro Couriers', 'MC-5531', 89.50, 20),
  b('bill-04', 'c-metro', 'Metro Couriers', 'MC-5562', 89.50, 13),
  b('bill-05', 'c-bright', 'Brightline Energy', 'BE-7781', 412.30, 5),
  b('bill-06', 'c-bright', 'Brightline Energy', 'BE-07781', 413.30, 30),
  b('bill-07', 'c-harb1', 'Harbor Print', 'HP-100', 640.00, 3),
  b('bill-08', 'c-harb2', 'Harbour Print Ltd', 'HP-100', 640.00, 3, 'DRAFT'),
  b('bill-09', 'c-oak', 'Oakridge Cleaning', 'OC-88', 300.00, 6),
].map(json => ({ json }));`),
    merge('Combine bill sources'),
    code('Score duplicate pairs', `
// Pairwise scoring. A pair is only compared when the suppliers match by id or by a
// near-identical name. Different supplier references count against a match, which
// keeps recurring same-amount bills off the list.
const cfg = $('config').first().json;
const reported = new Set($getWorkflowStaticData('global').reported_pairs || []);
const bills = $input.all().map(i => i.json);
const norm = s => String(s || '').toLowerCase().replace(/\\b(ltd|limited|inc|llc|co|corp|plc|gmbh)\\b/g, '').replace(/[^a-z0-9]/g, '').replace(/^0+|(?<=[a-z])0+/g, '');
const lev = (a, b) => {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
};
const days = (a, b) => Math.abs(Math.round((new Date(a) - new Date(b)) / 864e5));
const pairs = [];
let compared = 0;
for (let i = 0; i < bills.length; i++) for (let j = i + 1; j < bills.length; j++) {
  const a = bills[i], b = bills[j];
  const reasons = [];
  let score = 0;
  if (a.contact_id && a.contact_id === b.contact_id) { score += 30; reasons.push('same supplier'); }
  else if (lev(norm(a.contact), norm(b.contact)) <= 2) { score += 20; reasons.push('supplier names nearly identical (' + a.contact + ' / ' + b.contact + ')'); }
  else continue;
  compared++;
  if (a.currency !== b.currency) continue;
  const diff = Math.abs(a.total - b.total);
  if (diff <= cfg.amount_tolerance) { score += 30; reasons.push('same amount'); }
  else if (diff / Math.max(a.total, b.total) * 100 <= cfg.amount_near_pct) { score += 15; reasons.push('amounts ' + diff.toFixed(2) + ' apart'); }
  const dd = days(a.date, b.date);
  if (dd <= 1) { score += 25; reasons.push(dd ? 'dates 1 day apart' : 'same date'); }
  else if (dd <= cfg.date_window_days) { score += 20; reasons.push('dates ' + dd + ' days apart'); }
  const ra = norm(a.number || a.reference), rb = norm(b.number || b.reference);
  if (ra && rb) {
    if (ra === rb) { score += 40; reasons.push('same supplier reference'); }
    else if (lev(ra, rb) === 1) { score += 15; reasons.push('references differ by one character'); }
    else { score -= 30; reasons.push('different references'); }
  }
  if (score < cfg.review_score) continue;
  const key = [a.id, b.id].sort().join('|');
  pairs.push({ key, score, reasons, already_posted: reported.has(key), a, b });
}
pairs.sort((x, y) => y.score - x.score);
const fresh = pairs.filter(p => !p.already_posted);
return [{ json: { bills: bills.length, compared, pairs: fresh, repeats: pairs.length - fresh.length } }];`),
    code('Write the review list', `
// Links open each bill in Xero. The message says plainly that nothing was changed.
const cfg = $('config').first().json;
const { pairs, bills, repeats } = $input.first().json;
const link = b => '<https://go.xero.com/AccountsPayable/View.aspx?InvoiceID=' + b.id + '|' + (b.number || b.reference || b.id) + '>';
const money = b => b.currency + ' ' + b.total.toFixed(2);
const lines = pairs.map((p, i) => [
  (i + 1) + '. *' + p.a.contact + '* score ' + p.score,
  '   ' + link(p.a) + ' ' + money(p.a) + ' on ' + p.a.date + ' (' + p.a.status + ')  vs  ' + link(p.b) + ' ' + money(p.b) + ' on ' + p.b.date + ' (' + p.b.status + ')',
  '   ' + p.reasons.join(', '),
].join('\\n'));
const text = [
  (cfg.mode === 'test' ? '[TEST] ' : '') + '*Possible duplicate bills in Xero*: ' + pairs.length + ' pair' + (pairs.length === 1 ? '' : 's') + ' from ' + bills + ' open bills',
  '', ...lines, '',
  (repeats ? repeats + ' pair(s) already posted earlier are not repeated. ' : '') + 'Nothing has been voided or edited; check each pair in Xero.',
].join('\\n');
const send_to = cfg.mode === 'test' ? cfg.test_slack_channel.trim() : cfg.slack_channel_id;
return [{ json: { text, send_to, found: pairs.length, keys: pairs.map(p => p.key) } }];`),
    ifTrue('Any new pairs?', '$json.found > 0'),
    stop('STOP: no likely duplicates'),
    ifTrue('Posting switched on?', `${cfg('sends_enabled')} && (${cfg('mode')} === 'test' || ${cfg('slack_enabled')})`),
    stop('STOP: preview - nothing posted'),
    ifTrue('Test channel set?', `${cfg('mode')} !== 'test' || ${cfg('test_slack_enabled')}`),
    stop('STOP: test - TEST_SLACK_CHANNEL blank'),
    slack.post('Post the review list to Slack', '$json.send_to', "$('Write the review list').first().json.text"),
    ifTrue('Live run?', cfg('live')),
    stop('STOP: test post - pairs not remembered'),
    code('Remember posted pairs', `
// Live only: a posted pair is not posted again on the next run (last 1000 kept).
const store = $getWorkflowStaticData('global');
store.reported_pairs = [...new Set([...(store.reported_pairs || []), ...$('Write the review list').first().json.keys])].slice(-1000);
return [{ json: { remembered: store.reported_pairs.length } }];`),
  ],
  edges: [
    ['Run manually', 'config'], ['Tuesday and Thursday at 08:00', 'config'],
    ['config', 'Xero connected?'],
    ['Xero connected?', 0, 'Fetch bills from Xero'], ['Xero connected?', 1, 'Load sample bills'],
    ['Fetch bills from Xero', 'Read Xero bills'],
    ['Read Xero bills', 'Combine bill sources'], ['Load sample bills', 0, 'Combine bill sources', 1],
    ['Combine bill sources', 'Score duplicate pairs'],
    ['Score duplicate pairs', 'Write the review list'],
    ['Write the review list', 'Any new pairs?'],
    ['Any new pairs?', 0, 'Posting switched on?'], ['Any new pairs?', 1, 'STOP: no likely duplicates'],
    ['Posting switched on?', 0, 'Test channel set?'], ['Posting switched on?', 1, 'STOP: preview - nothing posted'],
    ['Test channel set?', 0, 'Post the review list to Slack'], ['Test channel set?', 1, 'STOP: test - TEST_SLACK_CHANNEL blank'],
    ['Post the review list to Slack', 'Live run?'],
    ['Live run?', 0, 'Remember posted pairs'], ['Live run?', 1, 'STOP: test post - pairs not remembered'],
  ],
  groups: [
    { title: 'Start and settings', why: 'Runs Tuesday and Thursday mornings, ahead of a typical payment run. Every score weight and window is a constant in `config`.', nodes: ['Run manually', 'Tuesday and Thursday at 08:00', 'config'] },
    { title: 'Read open bills', why: 'Only Draft and Awaiting Payment bills are fetched, because a paid duplicate is a refund problem, not a review. `Load sample bills` feeds the same shape until `USE_XERO` is true.', nodes: ['Xero connected?', 'Fetch bills from Xero', 'Read Xero bills', 'Load sample bills', 'Combine bill sources'] },
    { title: 'Score every pair', why: '`Score duplicate pairs` compares only bills whose suppliers match, which keeps the pair count small. Different references subtract points, so a weekly courier bill for the same amount stays off the list.', nodes: ['Score duplicate pairs', 'Write the review list', 'Any new pairs?', 'STOP: no likely duplicates'] },
    { title: 'Post and remember', why: 'There is no write to Xero anywhere in this workflow. Only a live post records the pair keys, so the same pair is not posted twice and a test post hides nothing. A test post goes only to `TEST_SLACK_CHANNEL`, and stops at a STOP if that is blank.', nodes: ['Posting switched on?', 'STOP: preview - nothing posted', 'Test channel set?', 'STOP: test - TEST_SLACK_CHANNEL blank', 'Post the review list to Slack', 'Live run?', 'STOP: test post - pairs not remembered', 'Remember posted pairs'] },
  ],
  scenarios: [
    {
      name: 'shipped config (preview)', start: 'Run manually',
      expect: { reached: ['Load sample bills', 'STOP: preview - nothing posted'], outward: 'none' },
      check: out => {
        const s = out['Score duplicate pairs'][0];
        const keys = s.pairs.map((p: any) => p.key + ':' + p.score);
        const f: string[] = [];
        if (JSON.stringify(keys) !== JSON.stringify(['bill-01|bill-02:120', 'bill-07|bill-08:115', 'bill-05|bill-06:85'])) f.push(`pairs wrong: ${JSON.stringify(keys)}`);
        if (s.pairs.some((p: any) => p.a.contact === 'Metro Couriers')) f.push('recurring courier bills must not be flagged');
        if (!out['Write the review list'][0].text.includes('Nothing has been voided')) f.push('review list must say nothing was changed');
        return f;
      },
    },
    {
      name: 'test mode with no test channel', start: 'Run manually',
      overrides: { TEST_EMAIL: 'you@example.com', SLACK_CHANNEL_ID: 'C0AP' },
      expect: { reached: ['STOP: test - TEST_SLACK_CHANNEL blank'], notReached: ['Post the review list to Slack', 'STOP: preview - nothing posted'], outward: 'none' },
    },
    {
      name: 'test mode into the test channel', start: 'Run manually',
      overrides: { TEST_EMAIL: 'you@example.com', SLACK_CHANNEL_ID: 'C0AP', TEST_SLACK_CHANNEL: 'C0TESTCHAN' },
      mocks: { 'Post the review list to Slack': (items: any[]) => items.map(j => ({ ok: true, channel: j.send_to })) },
      expect: { reached: ['Post the review list to Slack', 'STOP: test post - pairs not remembered'], notReached: ['Remember posted pairs'], outward: 'some' },
      check: out => {
        const f: string[] = [];
        if (out['Post the review list to Slack'][0]?.channel !== 'C0TESTCHAN') f.push(`test post must go to TEST_SLACK_CHANNEL, went to ${out['Post the review list to Slack'][0]?.channel}`);
        if (!out['Write the review list'][0].text.startsWith('[TEST] ')) f.push('test list needs the [TEST] prefix');
        return f;
      },
    },
    {
      name: 'live with Xero and Slack', start: 'Tuesday and Thursday at 08:00',
      overrides: { USE_XERO: true, XERO_TENANT_ID: 'tenant-123', SLACK_CHANNEL_ID: 'C0AP', TEST_RUN: false },
      mocks: {
        'Fetch bills from Xero': [{ Status: 'OK', Invoices: [
          { InvoiceID: 'a1', Type: 'ACCPAY', InvoiceNumber: 'S-900', Reference: '', Contact: { ContactID: 'k1', Name: 'Ridge Timber' }, DateString: '2026-10-01T00:00:00', Total: 5000, CurrencyCode: 'NZD', Status: 'AUTHORISED' },
          { InvoiceID: 'a2', Type: 'ACCPAY', InvoiceNumber: 'S-900', Reference: '', Contact: { ContactID: 'k1', Name: 'Ridge Timber' }, Date: '/Date(1759363200000+0000)/', Total: 5000, CurrencyCode: 'NZD', Status: 'DRAFT' },
          { InvoiceID: 'a3', Type: 'ACCREC', InvoiceNumber: 'S-900', Contact: { ContactID: 'k1', Name: 'Ridge Timber' }, DateString: '2026-10-01T00:00:00', Total: 5000, CurrencyCode: 'NZD', Status: 'AUTHORISED' },
        ] }],
        'Post the review list to Slack': (items: any[]) => items.map(j => ({ ok: true, channel: j.send_to })),
      },
      expect: { reached: ['Read Xero bills', 'Post the review list to Slack', 'Remember posted pairs'], outward: 'some' },
      check: out => {
        const f: string[] = [];
        if (out['Read Xero bills'].length !== 2) f.push('sales invoice (ACCREC) must be ignored');
        if (out['Read Xero bills'][1]?.date !== '2025-10-02') f.push('legacy /Date()/ format not parsed');
        if (out['Score duplicate pairs'][0].pairs[0]?.key !== 'a1|a2') f.push('a1/a2 should be flagged');
        if (out['Post the review list to Slack'][0]?.channel !== 'C0AP') f.push('live post must go to SLACK_CHANNEL_ID');
        return f;
      },
    },
  ],
});
