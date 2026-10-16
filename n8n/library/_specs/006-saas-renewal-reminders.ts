import { defineSpec } from '../_kit/spec';
import { trigger, code, ifTrue, merge, stop, sheets, slack } from '../_kit/n';

const cfg = (k: string) => `$('config').first().json.${k}`;

export default defineSpec({
  slug: 'saas-renewal-reminders',
  title: 'Remind owners in Slack before SaaS renewals in a Google Sheets register',
  summary: 'Reads a Google Sheets register of software subscriptions, works out each cancel-by date from the renewal date and notice period, and posts a Slack digest that tags owners 30, 14 and 3 days before it, with unowned tools and missed notice windows called out.',
  category: 'Productivity and operations',
  description: {
    who: 'Operations and finance leads who keep a sheet of software subscriptions and still get caught by annual auto-renewals. The reminder is keyed to the last day you can cancel, not the renewal date, because that is the date that matters.',
    how: [
      'Every weekday at 09:00 it reads the Register tab, or sample tools until a sheet is connected.',
      'Past renewal dates roll forward by the billing cycle, then the cancel-by date is the renewal date minus the notice days.',
      'A tool enters the digest when its cancel-by date is 30, 14 or 3 days away. Each stage is posted once per renewal, even if a run is missed.',
      'Tools with no owner, and tools whose notice window has already closed, get their own sections. One Slack message tags each owner.',
    ],
    setup: [
      'Run it once as imported. It builds a digest from sample tools and stops at `STOP: preview - nothing posted`.',
      'Connect Google Sheets, put the spreadsheet id in `REGISTER_SHEET_ID`, and match the column names in `COLUMNS`.',
      'Connect Slack and set `SLACK_CHANNEL_ID`. Owners are tagged by the Slack member id in the owner id column.',
      'For a test, set `TEST_EMAIL` to any address and `TEST_SLACK_CHANNEL` to a private channel. The test digest lands there with no @mentions. Set `TEST_RUN = false` to post to `SLACK_CHANNEL_ID` and tag owners.',
    ],
    requirements: ['A Google Sheet listing your subscriptions', 'A Slack workspace'],
    customize: [
      '`STAGES` sets the reminder days before cancel-by (30, 14 and 3 by default).',
      '`DEFAULT_NOTICE_DAYS` covers rows with an empty notice column.',
      '`MIN_ANNUAL_COST` keeps cheap tools out of the digest.',
    ],
  },
  config: {
    intro: ['REGISTER_SHEET_ID blank -> SAMPLE tools so the run works before any credential exists.', 'Test mode (TEST_RUN true + TEST_EMAIL set) posts to TEST_SLACK_CHANNEL, never to SLACK_CHANNEL_ID.', 'A stage is remembered only after a live post, so test runs never use it up.'],
    consts: [
      { name: 'REGISTER_SHEET_ID', value: '', note: 'Google Sheets id with a Register tab; blank uses sample tools' },
      { name: 'COLUMNS', value: { tool: 'Tool', owner: 'Owner', owner_slack_id: 'Owner Slack ID', annual_cost: 'Annual cost', currency: 'Currency',
        renewal: 'Renewal date', cycle: 'Billing cycle', notice_days: 'Notice days', status: 'Status' }, note: 'column headers on the Register tab' },
      { name: 'STAGES', value: [30, 14, 3], note: 'days before the cancel-by date that trigger a reminder' },
      { name: 'DEFAULT_NOTICE_DAYS', value: 0, note: 'notice period when the column is empty' },
      { name: 'MIN_ANNUAL_COST', value: 0, note: 'tools cheaper than this per year are left out' },
      { name: 'SLACK_CHANNEL_ID', value: '', note: 'channel for the digest; blank means nothing is posted' },
      { name: 'TEST_SLACK_CHANNEL', value: '', note: 'test mode posts here instead of the real channel; blank means test mode posts nothing' },
    ],
    flags: { sheets_enabled: "REGISTER_SHEET_ID.trim() !== ''", slack_enabled: "SLACK_CHANNEL_ID.trim() !== ''", test_slack_enabled: "TEST_SLACK_CHANNEL.trim() !== ''" },
    safety: 'test_run',
  },
  nodes: [
    trigger.manual(),
    trigger.schedule('Every weekday at 09:00', '0 9 * * 1-5'),
    ifTrue('Register connected?', cfg('sheets_enabled')),
    sheets.read('Read the Register tab', cfg('register_sheet_id'), 'Register'),
    code('Read register rows', `
// Sheet rows -> the field names the reminder logic reads, using COLUMNS.
const col = $('config').first().json.columns;
return $input.all().map(({ json: r }) => ({ json: {
  tool: String(r[col.tool] || '').trim(), owner: String(r[col.owner] || '').trim(), owner_slack_id: String(r[col.owner_slack_id] || '').trim(),
  annual_cost: Number(String(r[col.annual_cost] || '0').replace(/[^0-9.]/g, '')) || 0, currency: r[col.currency] || 'USD',
  renewal: String(r[col.renewal] || '').slice(0, 10), cycle: String(r[col.cycle] || 'annual').toLowerCase(),
  notice_days: r[col.notice_days] === '' || r[col.notice_days] === undefined ? null : Number(r[col.notice_days]),
  status: String(r[col.status] || 'active').toLowerCase(),
} })).filter(i => i.json.tool);`),
    code('Load sample tools', `
// Used until REGISTER_SHEET_ID is set. Dates are relative to today so every section has an entry.
const day = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const t = (tool, owner, id, cost, renewal, notice, extra = {}) => ({ tool, owner, owner_slack_id: id, annual_cost: cost, currency: 'USD', renewal, cycle: 'annual', notice_days: notice, status: 'active', ...extra });
return [
  t('Canvasly', 'Maya Ortiz', 'U01MAYA', 4800, day(40), 30),
  t('Ledgerline', 'Theo Grant', 'U02THEO', 2400, day(33), 30),
  t('Quillform', 'Maya Ortiz', 'U01MAYA', 1200, day(60), 30),
  t('Beaconly', 'Ines Park', 'U03INES', 9600, day(20), 30),
  t('Tallyroom', '', '', 3000, day(50), 30),
  t('Driftmail', 'Theo Grant', 'U02THEO', 600, day(100), 30),
  t('Shelfwise', 'Ines Park', 'U03INES', 900, day(35), 30, { status: 'cancelled' }),
  t('Pingboard', 'Owen Blake', 'U04OWEN', 1440, day(-75), 7, { cycle: 'monthly' }),
].map(json => ({ json }));`),
    merge('Combine register sources'),
    code('Work out cancel-by stages', `
// Cancel-by = next renewal - notice days. The stage is the smallest STAGES value the
// days-left has crossed, so a missed run still catches up. Stages already posted for
// this renewal (kept in workflow static data) are not posted again.
const cfg = $('config').first().json;
const store = $getWorkflowStaticData('global');
const sent = store.sent_stages || {};
const stages = [...cfg.stages].sort((a, b) => a - b);
const today = new Date(new Date().toISOString().slice(0, 10));
const addMonths = (d, n) => { const x = new Date(d); x.setUTCMonth(x.getUTCMonth() + n); return x; };
const due = [], unowned = [], missed = [], skipped = [];
for (const { json: t } of $input.all()) {
  if (t.status !== 'active') { skipped.push({ tool: t.tool, reason: 'status ' + t.status }); continue; }
  if (t.annual_cost < cfg.min_annual_cost) { skipped.push({ tool: t.tool, reason: 'below MIN_ANNUAL_COST' }); continue; }
  let renewal = new Date(t.renewal);
  if (isNaN(renewal)) { skipped.push({ tool: t.tool, reason: 'no renewal date' }); continue; }
  const months = t.cycle.startsWith('month') ? 1 : t.cycle.startsWith('quarter') ? 3 : 12;
  while (renewal < today) renewal = addMonths(renewal, months);
  const notice = t.notice_days ?? cfg.default_notice_days;
  const cancelBy = new Date(renewal.getTime() - notice * 864e5);
  const daysLeft = Math.round((cancelBy - today) / 864e5);
  const key = t.tool + '|' + renewal.toISOString().slice(0, 10);
  const row = { ...t, renewal: renewal.toISOString().slice(0, 10), cancel_by: cancelBy.toISOString().slice(0, 10), days_left: daysLeft, key };
  if (!t.owner_slack_id) unowned.push(row);
  if (daysLeft < 0) { if (sent[key] !== 'missed') missed.push({ ...row, stage: 'missed' }); continue; }
  const stage = stages.find(s => daysLeft <= s);
  if (stage === undefined) continue;
  if (sent[key] !== undefined && sent[key] !== 'missed' && Number(sent[key]) <= stage) { skipped.push({ tool: t.tool, reason: 'stage ' + stage + ' already posted' }); continue; }
  due.push({ ...row, stage });
}
due.sort((a, b) => a.days_left - b.days_left);
return [{ json: { due, missed, unowned, skipped } }];`),
    code('Write the Slack digest', `
// One message, grouped by stage. In test mode owners are named, not tagged, so nobody is pinged.
const cfg = $('config').first().json;
const { due, missed, unowned } = $input.first().json;
const who = t => !t.owner_slack_id ? '_no owner_' : cfg.mode === 'live' ? '<@' + t.owner_slack_id + '>' : t.owner;
const money = t => t.currency + ' ' + t.annual_cost.toLocaleString('en-US') + '/yr';
const line = t => '- *' + t.tool + '* (' + money(t) + '), cancel by ' + t.cancel_by + ' (' + t.days_left + ' days), renews ' + t.renewal + ' - ' + who(t);
const sections = [];
for (const s of [...cfg.stages].sort((a, b) => a - b)) {
  const list = due.filter(t => t.stage === s);
  if (list.length) sections.push('*Cancel-by within ' + s + ' days*', ...list.map(line), '');
}
if (missed.length) sections.push('*Notice window already closed* (renews regardless)', ...missed.map(t => '- *' + t.tool + '* (' + money(t) + '), renews ' + t.renewal + ' - ' + who(t)), '');
if (unowned.length) sections.push('*No owner in the register*', ...unowned.map(t => '- ' + t.tool + ' (' + money(t) + ')'), '');
const atStake = [...due, ...missed].reduce((s, t) => s + t.annual_cost, 0);
const text = [(cfg.mode === 'test' ? '[TEST] ' : '') + '*SaaS renewals to decide on* - ' + (due.length + missed.length) + ' tools, ' + atStake.toLocaleString('en-US') + ' a year at stake', '', ...sections].join('\\n').trim();
const send_to = cfg.mode === 'test' ? cfg.test_slack_channel.trim() : cfg.slack_channel_id;
return [{ json: { text, send_to, post: due.length + missed.length + unowned.length > 0, keys: [...due.map(t => [t.key, t.stage]), ...missed.map(t => [t.key, 'missed'])] } }];`),
    ifTrue('Anything to post?', '$json.post'),
    stop('STOP: nothing due today'),
    ifTrue('Posting switched on?', `${cfg('sends_enabled')} && (${cfg('mode')} === 'test' || ${cfg('slack_enabled')})`),
    stop('STOP: preview - nothing posted'),
    ifTrue('Test channel set?', `${cfg('mode')} !== 'test' || ${cfg('test_slack_enabled')}`),
    stop('STOP: test - TEST_SLACK_CHANNEL blank'),
    slack.post('Post the renewal digest', '$json.send_to', "$('Write the Slack digest').first().json.text"),
    ifTrue('Live run?', cfg('live')),
    stop('STOP: test post - stages not remembered'),
    code('Remember posted stages', `
// After a live post only: each tool's stage is stored against its renewal date.
const store = $getWorkflowStaticData('global');
const sent = store.sent_stages || {};
for (const [k, s] of $('Write the Slack digest').first().json.keys) sent[k] = s;
store.sent_stages = sent;
return [{ json: { remembered: Object.keys(sent).length } }];`),
  ],
  edges: [
    ['Run manually', 'config'], ['Every weekday at 09:00', 'config'],
    ['config', 'Register connected?'],
    ['Register connected?', 0, 'Read the Register tab'], ['Register connected?', 1, 'Load sample tools'],
    ['Read the Register tab', 'Read register rows'],
    ['Read register rows', 'Combine register sources'], ['Load sample tools', 0, 'Combine register sources', 1],
    ['Combine register sources', 'Work out cancel-by stages'],
    ['Work out cancel-by stages', 'Write the Slack digest'],
    ['Write the Slack digest', 'Anything to post?'],
    ['Anything to post?', 0, 'Posting switched on?'], ['Anything to post?', 1, 'STOP: nothing due today'],
    ['Posting switched on?', 0, 'Test channel set?'], ['Posting switched on?', 1, 'STOP: preview - nothing posted'],
    ['Test channel set?', 0, 'Post the renewal digest'], ['Test channel set?', 1, 'STOP: test - TEST_SLACK_CHANNEL blank'],
    ['Post the renewal digest', 'Live run?'],
    ['Live run?', 0, 'Remember posted stages'], ['Live run?', 1, 'STOP: test post - stages not remembered'],
  ],
  groups: [
    { title: 'Start and settings', why: 'Weekday mornings, so a 3-day warning never lands on a Saturday. Column names and reminder stages live in `config`.', nodes: ['Run manually', 'Every weekday at 09:00', 'config'] },
    { title: 'Read the register', why: '`Read register rows` maps your headers through `COLUMNS`, so the sheet layout is yours. `Load sample tools` covers every case until `REGISTER_SHEET_ID` is set.', nodes: ['Register connected?', 'Read the Register tab', 'Read register rows', 'Load sample tools', 'Combine register sources'] },
    { title: 'Find what needs a decision', why: 'Stages are crossed, not matched exactly, so a skipped weekend still triggers the 3-day reminder. Unowned tools are listed every run until someone claims them.', nodes: ['Work out cancel-by stages', 'Write the Slack digest', 'Anything to post?', 'STOP: nothing due today'] },
    { title: 'Post and remember', why: 'A live post needs `SLACK_CHANNEL_ID`. A test post goes only to `TEST_SLACK_CHANNEL`, and stops at a STOP if that is blank. Only a live post records the stage in static data, so a test post never hides a real reminder.', nodes: ['Posting switched on?', 'STOP: preview - nothing posted', 'Test channel set?', 'STOP: test - TEST_SLACK_CHANNEL blank', 'Post the renewal digest', 'Live run?', 'STOP: test post - stages not remembered', 'Remember posted stages'] },
  ],
  scenarios: [
    {
      name: 'shipped config (preview)', start: 'Run manually',
      expect: { reached: ['Load sample tools', 'STOP: preview - nothing posted'], outward: 'none' },
      check: out => {
        const w = out['Work out cancel-by stages'][0];
        const stage = Object.fromEntries(w.due.map((t: any) => [t.tool, t.stage]));
        const f: string[] = [];
        const want = { Ledgerline: 3, Canvasly: 14, Pingboard: 14, Tallyroom: 30, Quillform: 30 };
        if (JSON.stringify(Object.keys(stage).sort()) !== JSON.stringify(Object.keys(want).sort())) f.push(`due tools wrong: ${JSON.stringify(stage)}`);
        for (const [k, v] of Object.entries(want)) if (stage[k] !== v) f.push(`${k} should be stage ${v}, got ${stage[k]}`);
        if (w.missed.map((t: any) => t.tool).join() !== 'Beaconly') f.push('Beaconly notice window should be missed');
        if (w.unowned.map((t: any) => t.tool).join() !== 'Tallyroom') f.push('Tallyroom should be unowned');
        if (!w.skipped.some((s: any) => s.tool === 'Shelfwise')) f.push('cancelled tool should be skipped');
        const text = out['Write the Slack digest'][0].text;
        if (text.includes('<@')) f.push('preview must not tag anyone');
        if (!text.includes('22,440 a year at stake')) f.push('at-stake total wrong');
        return f;
      },
    },
    {
      name: 'test mode with no test channel', start: 'Run manually',
      overrides: { TEST_EMAIL: 'you@example.com', SLACK_CHANNEL_ID: 'C0RENEW' },
      expect: { reached: ['STOP: test - TEST_SLACK_CHANNEL blank'], notReached: ['Post the renewal digest', 'STOP: preview - nothing posted'], outward: 'none' },
    },
    {
      name: 'test mode into the test channel', start: 'Run manually',
      overrides: { TEST_EMAIL: 'you@example.com', SLACK_CHANNEL_ID: 'C0RENEW', TEST_SLACK_CHANNEL: 'C0TESTCHAN' },
      mocks: { 'Post the renewal digest': (items: any[]) => items.map(j => ({ ok: true, channel: j.send_to })) },
      expect: { reached: ['Post the renewal digest', 'STOP: test post - stages not remembered'], notReached: ['Remember posted stages'], outward: 'some' },
      check: out => {
        const f: string[] = [];
        if (out['Post the renewal digest'][0]?.channel !== 'C0TESTCHAN') f.push(`test post must go to TEST_SLACK_CHANNEL, went to ${out['Post the renewal digest'][0]?.channel}`);
        const text = out['Write the Slack digest'][0].text;
        if (!text.startsWith('[TEST] ')) f.push('test digest needs the [TEST] prefix');
        if (text.includes('<@')) f.push('test digest must not tag anyone');
        return f;
      },
    },
    {
      name: 'live post from the register', start: 'Every weekday at 09:00',
      overrides: { REGISTER_SHEET_ID: '1RegAbc', SLACK_CHANNEL_ID: 'C0RENEW', TEST_RUN: false },
      mocks: {
        'Read the Register tab': [
          { row_number: 2, Tool: 'Sketchpad Pro', Owner: 'Lena Fox', 'Owner Slack ID': 'U09LENA', 'Annual cost': '$2,160', Currency: 'USD',
            'Renewal date': new Date(Date.now() + 16 * 864e5).toISOString().slice(0, 10), 'Billing cycle': 'Annual', 'Notice days': 14, Status: 'Active' },
          { row_number: 3, Tool: 'Old CRM', Owner: '', 'Owner Slack ID': '', 'Annual cost': '1200', Currency: 'USD',
            'Renewal date': new Date(Date.now() + 200 * 864e5).toISOString().slice(0, 10), 'Billing cycle': 'Annual', 'Notice days': '', Status: 'Active' },
        ],
        'Post the renewal digest': (items: any[]) => items.map(j => ({ ok: true, channel: j.send_to, ts: '1700000000.0001' })),
      },
      expect: { reached: ['Read register rows', 'Post the renewal digest', 'Remember posted stages'], outward: 'some' },
      check: out => {
        const f: string[] = [];
        const w = out['Work out cancel-by stages'][0];
        if (w.due[0]?.tool !== 'Sketchpad Pro' || w.due[0]?.stage !== 3) f.push('Sketchpad Pro should be at the 3-day stage');
        if (!out['Write the Slack digest'][0].text.includes('<@U09LENA>')) f.push('live digest should tag the owner');
        if (out['Remember posted stages'][0].remembered !== 1) f.push('one stage should be remembered');
        if (out['Post the renewal digest'][0]?.channel !== 'C0RENEW') f.push('live post must go to SLACK_CHANNEL_ID');
        return f;
      },
    },
  ],
});
