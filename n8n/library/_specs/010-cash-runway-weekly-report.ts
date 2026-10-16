import { defineSpec } from '../_kit/spec';
import { trigger, code, ifTrue, merge, stop, sheets, slack } from '../_kit/n';

const cfg = (k: string) => `$('config').first().json.${k}`;

export default defineSpec({
  slug: 'cash-runway-weekly-report',
  title: 'Report weekly cash runway from Google Sheets to Slack',
  summary: 'Every Monday, adds up account balances from a Google Sheet, averages net burn over the last 13 weeks, works out months of runway against last week, applies red, amber and green thresholds and posts the result to Slack.',
  category: 'Finance and billing',
  description: {
    who: 'Founders and finance leads at early-stage companies who track bank balances and weekly cash flow in Google Sheets. The Monday post answers one question, how many months of cash are left, and whether that number moved.',
    how: [
      'Every Monday at 08:30 it reads the Balances and Cashflow tabs, or sample data until a sheet is connected.',
      'Cash is the sum of balances in `BASE_CURRENCY`, with credit cards counted as negative. Accounts in other currencies are listed and left out.',
      'Weekly net burn is outflows minus inflows, averaged over the last 13 complete weeks and turned into a monthly figure. Weeks over twice the median burn are named as one-offs.',
      'Runway is cash divided by monthly burn, compared with the same figure a week earlier, and rated green from 12 months, amber from 6, red below that. One Slack message carries it all.',
    ],
    setup: [
      'Run it once as imported. It reports on sample numbers and stops at `STOP: preview - nothing posted`.',
      'Connect Google Sheets and put the spreadsheet id in `FINANCE_SHEET_ID`. Column names are set in `COLUMNS`.',
      'Connect Slack and set `SLACK_CHANNEL_ID`.',
      'For a test, set `TEST_EMAIL` to any address and `TEST_SLACK_CHANNEL` to a private channel, where the test report lands. Set `TEST_RUN = false` for the weekly post to `SLACK_CHANNEL_ID`.',
    ],
    requirements: ['A Google Sheet with Balances and Cashflow tabs', 'A Slack workspace'],
    customize: [
      '`GREEN_MONTHS` and `AMBER_MONTHS` set the colour thresholds.',
      '`BURN_WEEKS` changes the averaging window from 13 weeks.',
      'Set `EXCLUDE_ONE_OFFS = true` to leave unusual weeks out of the average.',
    ],
  },
  config: {
    intro: ['FINANCE_SHEET_ID blank -> SAMPLE balances and cash flow.', 'SLACK_CHANNEL_ID blank -> the report is built but not posted.', 'Test mode (TEST_RUN true + TEST_EMAIL set) posts to TEST_SLACK_CHANNEL, never to SLACK_CHANNEL_ID.'],
    consts: [
      { name: 'FINANCE_SHEET_ID', value: '', note: 'Google Sheets id with Balances and Cashflow tabs; blank uses sample data' },
      { name: 'COLUMNS', value: { account: 'Account', balance: 'Balance', currency: 'Currency', type: 'Type', week: 'Week starting', inflows: 'Inflows', outflows: 'Outflows' }, note: 'column headers on the two tabs' },
      { name: 'BASE_CURRENCY', value: 'USD', note: 'only balances in this currency count as cash' },
      { name: 'BURN_WEEKS', value: 13, note: 'complete weeks averaged for burn' },
      { name: 'GREEN_MONTHS', value: 12, note: 'runway at or above this is green' },
      { name: 'AMBER_MONTHS', value: 6, note: 'runway at or above this is amber; below is red' },
      { name: 'EXCLUDE_ONE_OFFS', value: false, note: 'true leaves weeks above 2x the median burn out of the average' },
      { name: 'SLACK_CHANNEL_ID', value: '', note: 'channel for the report; blank means nothing is posted' },
      { name: 'TEST_SLACK_CHANNEL', value: '', note: 'test mode posts here instead of the real channel; blank means test mode posts nothing' },
    ],
    flags: { sheets_enabled: "FINANCE_SHEET_ID.trim() !== ''", slack_enabled: "SLACK_CHANNEL_ID.trim() !== ''", test_slack_enabled: "TEST_SLACK_CHANNEL.trim() !== ''" },
    safety: 'test_run',
  },
  nodes: [
    trigger.manual(),
    trigger.schedule('Every Monday at 08:30', '30 8 * * 1'),
    ifTrue('Use sample figures?', '!' + cfg('sheets_enabled')),
    code('Load sample figures', `
// Used until FINANCE_SHEET_ID is set. Fourteen weeks of flows with one large one-off week.
const monday = new Date(); monday.setUTCHours(0, 0, 0, 0); monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
const wk = n => new Date(monday.getTime() - n * 7 * 864e5).toISOString().slice(0, 10);
const cashflow = [];
for (let n = 14; n >= 1; n--) cashflow.push({ 'Week starting': wk(n), Inflows: 8000, Outflows: n === 9 ? 70000 : 30000 });
return [{ json: {
  balances: [
    { Account: 'Operating account', Balance: '482,400', Currency: 'USD', Type: 'bank' },
    { Account: 'Reserve savings', Balance: 250000, Currency: 'USD', Type: 'bank' },
    { Account: 'Company card', Balance: 12600, Currency: 'USD', Type: 'card' },
    { Account: 'Berlin office', Balance: 5000, Currency: 'EUR', Type: 'bank' },
  ],
  cashflow,
} }];`),
    sheets.read('Read the Balances tab', cfg('finance_sheet_id'), 'Balances'),
    code('Collect balances', `
// Many rows -> one item, so the Cashflow tab is read once.
return [{ json: { balances: $input.all().map(i => i.json) } }];`),
    sheets.read('Read the Cashflow tab', cfg('finance_sheet_id'), 'Cashflow'),
    code('Collect cash flow', `
// Pairs both tabs in the sample shape.
return [{ json: { balances: $('Collect balances').first().json.balances, cashflow: $input.all().map(i => i.json) } }];`),
    merge('Combine figure sources'),
    code('Work out the runway', `
// Runway = cash / monthly burn. Monthly burn = average weekly net burn x 52 / 12.
// Last week's runway is rebuilt from the same data (cash before last week's flow,
// window shifted one week back), so the trend needs no stored history.
const cfg = $('config').first().json;
const col = cfg.columns;
const { balances, cashflow } = $input.first().json;
const num = v => typeof v === 'number' ? v : Number(String(v ?? '').replace(/[^0-9.-]/g, '')) || 0;
let cash = 0; const excluded = [];
for (const b of balances) {
  if (String(b[col.currency] || cfg.base_currency).toUpperCase() !== cfg.base_currency) { excluded.push(b[col.account] + ' (' + b[col.currency] + ')'); continue; }
  const v = Math.abs(num(b[col.balance]));
  cash += /card|credit|loan/i.test(String(b[col.type] || '')) ? -v : num(b[col.balance]);
}
const thisMonday = new Date(); thisMonday.setUTCHours(0, 0, 0, 0); thisMonday.setUTCDate(thisMonday.getUTCDate() - ((thisMonday.getUTCDay() + 6) % 7));
const weeks = cashflow.map(r => ({ week: String(r[col.week]).slice(0, 10), net: num(r[col.outflows]) - num(r[col.inflows]) }))
  .filter(w => w.week && new Date(w.week) < thisMonday).sort((a, b) => a.week.localeCompare(b.week));
const median = arr => { const s = [...arr].sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0; };
const med = median(weeks.map(w => w['net']));
const oneOffs = weeks.filter(w => med > 0 && w['net'] > 2 * med);
const runwayFor = (win, c) => {
  const used = cfg.exclude_one_offs ? win.filter(w => !oneOffs.includes(w)) : win;
  const weekly = used.length ? used.reduce((s, w) => s + w['net'], 0) / used.length : 0;
  const monthly = weekly * 52 / 12;
  return { weekly, monthly, months: monthly > 0 ? c / monthly : null };
};
const n = cfg.burn_weeks;
const now = runwayFor(weeks.slice(-n), cash);
const last = weeks.length ? weeks[weeks.length - 1] : { net: 0 };
const prev = runwayFor(weeks.slice(-n - 1, -1), cash + last['net']);
const rag = m => m === null ? 'GREEN' : m >= cfg.green_months ? 'GREEN' : m >= cfg.amber_months ? 'AMBER' : 'RED';
const r1 = x => x === null ? null : Math.round(x * 10) / 10;
return [{ json: {
  cash: Math.round(cash), weeks_used: Math.min(n, weeks.length), weekly_burn: Math.round(now.weekly), monthly_burn: Math.round(now.monthly),
  runway_months: r1(now.months), last_week_months: r1(prev.months), change: now.months !== null && prev.months !== null ? r1(now.months - prev.months) : null,
  status: rag(now.months), last_status: rag(prev.months), cash_out_date: now.months ? new Date(Date.now() + now.months * 30.44 * 864e5).toISOString().slice(0, 10) : null,
  one_offs: oneOffs.map(w => w.week + ' (' + Math.round(w['net']).toLocaleString('en-US') + ')'), excluded,
} }];`),
    code('Write the runway report', `
// Short enough to read in a Slack preview: status and months in the first line.
const cfg = $('config').first().json;
const r = $input.first().json;
const m = n => cfg.base_currency + ' ' + Math.round(n).toLocaleString('en-US');
const icon = { GREEN: ':large_green_circle:', AMBER: ':large_orange_circle:', RED: ':red_circle:' }[r.status];
const trend = r.change === null ? '' : r.change === 0 ? ' (no change on last week)' : ' (' + (r.change > 0 ? '+' : '') + r.change + ' on last week)';
const head = r.runway_months === null ? 'Cash-flow positive over the last ' + r.weeks_used + ' weeks' : r.runway_months + ' months of runway' + trend;
const text = [
  (cfg.mode === 'test' ? '[TEST] ' : '') + icon + ' *' + r.status + '*: ' + head,
  'Cash: ' + m(r.cash) + ' | Burn: ' + m(r.monthly_burn) + '/month (' + m(r.weekly_burn) + '/week, ' + r.weeks_used + '-week average)',
  r.cash_out_date ? 'At this burn, cash runs out around ' + r.cash_out_date + '.' : '',
  r.status !== r.last_status ? 'Status changed from ' + r.last_status + ' last week.' : '',
  r.one_offs.length ? 'One-off weeks ' + (cfg.exclude_one_offs ? 'left out' : 'included') + ': ' + r.one_offs.join(', ') : '',
  r.excluded.length ? 'Not counted (other currency): ' + r.excluded.join(', ') : '',
].filter(Boolean).join('\\n');
return [{ json: { text, send_to: cfg.mode === 'test' ? cfg.test_slack_channel.trim() : cfg.slack_channel_id } }];`),
    ifTrue('Posting switched on?', `${cfg('sends_enabled')} && (${cfg('mode')} === 'test' || ${cfg('slack_enabled')})`),
    stop('STOP: preview - nothing posted'),
    ifTrue('Test channel set?', `${cfg('mode')} !== 'test' || ${cfg('test_slack_enabled')}`),
    stop('STOP: test - TEST_SLACK_CHANNEL blank'),
    slack.post('Post the report to Slack', '$json.send_to', '$json.text'),
  ],
  edges: [
    ['Run manually', 'config'], ['Every Monday at 08:30', 'config'],
    ['config', 'Use sample figures?'],
    ['Use sample figures?', 0, 'Load sample figures'], ['Use sample figures?', 1, 'Read the Balances tab'],
    ['Read the Balances tab', 'Collect balances'],
    ['Collect balances', 'Read the Cashflow tab'],
    ['Read the Cashflow tab', 'Collect cash flow'],
    ['Load sample figures', 'Combine figure sources'], ['Collect cash flow', 0, 'Combine figure sources', 1],
    ['Combine figure sources', 'Work out the runway'],
    ['Work out the runway', 'Write the runway report'],
    ['Write the runway report', 'Posting switched on?'],
    ['Posting switched on?', 0, 'Test channel set?'], ['Posting switched on?', 1, 'STOP: preview - nothing posted'],
    ['Test channel set?', 0, 'Post the report to Slack'], ['Test channel set?', 1, 'STOP: test - TEST_SLACK_CHANNEL blank'],
  ],
  groups: [
    { title: 'Start and settings', why: 'Runs Monday at 08:30 so the week just closed is complete. Thresholds, the burn window and column names all sit in `config`.', nodes: ['Run manually', 'Every Monday at 08:30', 'config'] },
    { title: 'Read balances and cash flow', why: 'The Cashflow tab is read after balances are collected into one item, so each tab is read once. `Load sample figures` provides both tabs until `FINANCE_SHEET_ID` is set.', nodes: ['Use sample figures?', 'Load sample figures', 'Read the Balances tab', 'Collect balances', 'Read the Cashflow tab', 'Collect cash flow', 'Combine figure sources'] },
    { title: 'Compute runway and trend', why: 'The current week is never counted because it is incomplete. Last week\'s runway is rebuilt from the same rows, so the trend works from the first run with no stored history.', nodes: ['Work out the runway', 'Write the runway report'] },
    { title: 'Post to Slack', why: 'A live post needs `SLACK_CHANNEL_ID`. A test post goes only to `TEST_SLACK_CHANNEL`, and stops at a STOP if that is blank. In preview the full message is still on `Write the runway report` for checking.', nodes: ['Posting switched on?', 'STOP: preview - nothing posted', 'Test channel set?', 'STOP: test - TEST_SLACK_CHANNEL blank', 'Post the report to Slack'] },
  ],
  scenarios: [
    {
      name: 'shipped config (preview)', start: 'Run manually',
      expect: { reached: ['Load sample figures', 'STOP: preview - nothing posted'], outward: 'none' },
      check: out => {
        const r = out['Work out the runway'][0];
        const f: string[] = [];
        if (r.cash !== 719800) f.push(`cash should be 719800 (card negative, EUR excluded), got ${r.cash}`);
        if (r.weekly_burn !== 25077 || r.monthly_burn !== 108667) f.push(`burn wrong: ${r.weekly_burn}/${r.monthly_burn}`);
        if (r.runway_months !== 6.6 || r.status !== 'AMBER') f.push(`runway should be 6.6 AMBER, got ${r.runway_months} ${r.status}`);
        if (r.last_week_months !== 6.8 || r.change !== -0.2) f.push(`trend wrong: ${r.last_week_months} ${r.change}`);
        if (r.one_offs.length !== 1) f.push('one-off week not found');
        if (!out['Write the runway report'][0].text.includes('6.6 months of runway (-0.2 on last week)')) f.push('report headline wrong');
        return f;
      },
    },
    {
      name: 'test mode with no test channel', start: 'Run manually',
      overrides: { TEST_EMAIL: 'you@example.com', SLACK_CHANNEL_ID: 'C0FIN' },
      expect: { reached: ['STOP: test - TEST_SLACK_CHANNEL blank'], notReached: ['Post the report to Slack', 'STOP: preview - nothing posted'], outward: 'none' },
    },
    {
      name: 'test mode into the test channel', start: 'Run manually',
      overrides: { TEST_EMAIL: 'you@example.com', SLACK_CHANNEL_ID: 'C0FIN', TEST_SLACK_CHANNEL: 'C0TESTCHAN' },
      mocks: { 'Post the report to Slack': (items: any[]) => items.map(j => ({ ok: true, channel: j.send_to })) },
      expect: { reached: ['Post the report to Slack'], notReached: ['STOP: preview - nothing posted'], outward: 'some' },
      check: out => {
        const f: string[] = [];
        if (out['Post the report to Slack'][0]?.channel !== 'C0TESTCHAN') f.push(`test post must go to TEST_SLACK_CHANNEL, went to ${out['Post the report to Slack'][0]?.channel}`);
        if (!out['Write the runway report'][0].text.startsWith('[TEST] ')) f.push('test report needs the [TEST] prefix');
        return f;
      },
    },
    {
      name: 'live from the sheet', start: 'Every Monday at 08:30',
      overrides: { FINANCE_SHEET_ID: '1FinAbc', SLACK_CHANNEL_ID: 'C0FIN', TEST_RUN: false, EXCLUDE_ONE_OFFS: true },
      mocks: {
        'Read the Balances tab': [{ row_number: 2, Account: 'Main', Balance: '$90,000.00', Currency: 'usd', Type: 'Bank' }],
        'Read the Cashflow tab': () => {
          const monday = new Date(); monday.setUTCHours(0, 0, 0, 0); monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
          return [1, 2, 3, 4].map(n => ({ 'Week starting': new Date(monday.getTime() - n * 7 * 864e5).toISOString().slice(0, 10), Inflows: '12,000', Outflows: n === 2 ? '60,000' : '18,000' }));
        },
        'Post the report to Slack': (items: any[]) => items.map(j => ({ ok: true, channel: j.send_to })),
      },
      expect: { reached: ['Collect cash flow', 'Post the report to Slack'], notReached: ['Load sample figures'], outward: 'some' },
      check: out => {
        const r = out['Work out the runway'][0];
        const f: string[] = [];
        if (r.weekly_burn !== 6000) f.push(`one-off week should be excluded, weekly burn ${r.weekly_burn}`);
        if (r.status !== 'RED' || r.runway_months !== 3.5) f.push(`expected 3.5 months RED, got ${r.runway_months} ${r.status}`);
        if (out['Post the report to Slack'][0]?.channel !== 'C0FIN') f.push('live post must go to SLACK_CHANNEL_ID');
        return f;
      },
    },
  ],
});
