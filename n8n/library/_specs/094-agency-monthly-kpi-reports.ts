import { defineSpec } from '../_kit/spec';
import { trigger, code, ifTrue, merge, stop, sheets, gmail } from '../_kit/n';

const cfg = (k: string) => `$('config').first().json.${k}`;

export default defineSpec({
  slug: 'agency-monthly-kpi-reports',
  title: 'Email monthly client KPI reports from Google Sheets with month-over-month change',
  summary: 'On the 2nd of each month reads KPI rows per client from Google Sheets, compares last month with the month before and with targets, flags each metric green, amber or red, emails every client contact an HTML table and sends the agency an internal summary.',
  category: 'Marketing and content',
  description: {
    who: 'Marketing and SEO agencies that keep client numbers in one spreadsheet and spend the first week of every month pasting them into report emails. Clients get a one-table report on the 2nd and the team sees which accounts need a call.',
    how: [
      'On the 2nd of each month at 08:00 it reads the KPIs tab (Client, Month, Metric, Value, Target) and the Clients tab, or sample data until a sheet is set.',
      'For each client it takes last month and the month before, and works out the change for every metric.',
      'Each metric gets a flag. With a target: green when met, amber when within `RED_MARGIN_PCT`, red beyond it. Without one: red when it moved the wrong way by more than `RED_DROP_PCT`. `METRICS` says which way is good, so a lower cost per lead counts as better.',
      'Each client contact gets an HTML table with this month, last month, change, target and flag. Clients with no data for the month or no contact email are held back.',
      'The agency gets one internal email listing every client with its red and amber counts, worst first.',
    ],
    setup: [
      'Run it once as imported. It builds reports from sample data and stops at `STOP: preview - nothing sent` and `STOP: internal summary not sent`.',
      'Create KPIs and Clients (Client, Contact name, Contact email, Account manager) tabs, connect Google Sheets and set `KPI_SHEET_ID`.',
      'Connect Gmail and set `AGENCY_NAME` and `INTERNAL_EMAIL`. Check `METRICS` lists your metric names and formats.',
      'Put your address in `TEST_EMAIL` to receive every report yourself, then set `TEST_RUN = false`.',
    ],
    requirements: ['A Google Sheet with KPIs and Clients tabs', 'A Gmail account'],
    customize: [
      '`METRICS` sets the direction (up, down or neutral) and format of each metric.',
      '`RED_MARGIN_PCT` and `RED_DROP_PCT` set how strict the flags are.',
      '`CURRENCY` formats money metrics.',
    ],
  },
  config: {
    intro: ['KPI_SHEET_ID blank -> SAMPLE KPIs and clients so the run works before any credential exists.', 'Nothing is written anywhere; the only actions are the emails.'],
    consts: [
      { name: 'KPI_SHEET_ID', value: '', note: 'Google Sheets id with KPIs and Clients tabs; blank uses sample data' },
      { name: 'AGENCY_NAME', value: 'Northwind Growth', note: 'sign-off and report header' },
      { name: 'INTERNAL_EMAIL', value: 'team@northwind-growth.example', note: 'gets the internal summary' },
      { name: 'METRICS', value: {
        Sessions: { direction: 'up', format: 'number' }, Leads: { direction: 'up', format: 'number' },
        'Conversion rate': { direction: 'up', format: 'percent' }, 'Cost per lead': { direction: 'down', format: 'money' },
        'Ad spend': { direction: 'neutral', format: 'money' },
      }, note: 'metric name -> which direction is good and how to format it; others default to up/number' },
      { name: 'RED_MARGIN_PCT', value: 10, note: 'a missed target by more than this percent is red, less is amber' },
      { name: 'RED_DROP_PCT', value: 15, note: 'without a target, a move the wrong way by more than this percent is red' },
      { name: 'CURRENCY', value: 'USD', note: 'currency for money metrics' },
    ],
    flags: { sheets_enabled: "KPI_SHEET_ID.trim() !== ''" },
    safety: 'test_run',
  },
  nodes: [
    trigger.manual(),
    trigger.schedule('On the 2nd of each month at 08:00', '0 8 2 * *'),
    ifTrue('KPI sheet set?', cfg('sheets_enabled')),
    sheets.read('Read the KPIs tab', cfg('kpi_sheet_id'), 'KPIs'),
    sheets.read('Read the Clients tab', cfg('kpi_sheet_id'), 'Clients'),
    code('Load sample KPIs and clients', `
// Used until KPI_SHEET_ID is set. Months are last month and the one before, so the
// sample always matches the report month.
const now = new Date();
const ym = back => { const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1)); return d.toISOString().slice(0, 7); };
const cur = ym(1), prev = ym(2);
const K = (Client, Month, Metric, Value, Target = '') => ({ Client, Month, Metric, Value, Target });
const C = (Client, name, email, am) => ({ Client, 'Contact name': name, 'Contact email': email, 'Account manager': am });
return [
  K('Harbour Dental', prev, 'Sessions', 8200), K('Harbour Dental', cur, 'Sessions', 9100, 9000),
  K('Harbour Dental', prev, 'Leads', 61), K('Harbour Dental', cur, 'Leads', 74, 70),
  K('Harbour Dental', prev, 'Cost per lead', 42.5), K('Harbour Dental', cur, 'Cost per lead', 38.2, 40),
  K('Northfield Studio', prev, 'Sessions', 15400), K('Northfield Studio', cur, 'Sessions', 12100),
  K('Northfield Studio', prev, 'Leads', 120), K('Northfield Studio', cur, 'Leads', 102, 125),
  K('Northfield Studio', prev, 'Cost per lead', 31), K('Northfield Studio', cur, 'Cost per lead', 33.5, 32),
  K('Northfield Studio', prev, 'Conversion rate', 0.78), K('Northfield Studio', cur, 'Conversion rate', 0.84),
  K('Northfield Studio', prev, 'Ad spend', 3720), K('Northfield Studio', cur, 'Ad spend', 3417),
  K('Lumen Physio', cur, 'Sessions', 2300), K('Lumen Physio', cur, 'Leads', 19, 15),
  K('Orchard Lane Cafe', prev, 'Sessions', 4100),
  K('Pine & Co', cur, 'Sessions', 5000),
  C('Harbour Dental', 'Priya Natarajan', 'priya@harbour-dental.example', 'Ana'),
  C('Northfield Studio', 'Marco Lindqvist', 'marco@northfield.example', 'Tom'),
  C('Lumen Physio', 'Dana Okafor', 'dana@lumenphysio.example', 'Ana'),
  C('Orchard Lane Cafe', 'Lee Chen', 'lee@orchardlane.example', 'Tom'),
  C('Pine & Co', 'Sam Patel', '', 'Ana'),
].map(json => ({ json }));`),
    merge('Combine KPI sources', 3),
    code('Compare months per client', `
// Report month = last calendar month. Flags:
//   target set:   met -> green, missed by <= RED_MARGIN_PCT -> amber, else red
//   no target:    wrong way by > RED_DROP_PCT -> red, better -> green, else amber
//   neutral metrics (spend) are shown without a flag; a first month shows 'new'.
const cfg = $('config').first().json;
const rows = $input.all().map(i => i.json);
const kpis = rows.filter(r => r.Metric && r.Month);
const clients = rows.filter(r => 'Contact email' in r);
const now = new Date();
const ym = back => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1)).toISOString().slice(0, 7);
const cur = ym(1), prev = ym(2);
const num = v => v === '' || v === null || v === undefined ? null : Number(String(v).replace(/[^\\d.-]/g, ''));
const reports = [], held = [];
for (const c of clients) {
  const mine = kpis.filter(k => String(k.Client).trim() === String(c.Client).trim());
  const now_ = mine.filter(k => String(k.Month).slice(0, 7) === cur);
  if (!now_.length) { held.push({ client: c.Client, reason: 'no data for ' + cur }); continue; }
  if (!String(c['Contact email'] || '').includes('@')) { held.push({ client: c.Client, reason: 'no contact email' }); continue; }
  const metrics = now_.map(k => {
    const m = cfg.metrics[k.Metric] || { direction: 'up', format: 'number' };
    const value = num(k.Value), target = num(k.Target);
    const before = mine.find(p => String(p.Month).slice(0, 7) === prev && p.Metric === k.Metric);
    const last = before ? num(before.Value) : null;
    const change = last ? (value - last) / Math.abs(last) * 100 : null;
    let flag;
    if (m.direction === 'neutral') flag = 'info';
    else if (target !== null && !Number.isNaN(target)) {
      const met = m.direction === 'down' ? value <= target : value >= target;
      flag = met ? 'green' : Math.abs(value - target) / Math.abs(target) * 100 <= cfg.red_margin_pct ? 'amber' : 'red';
    } else if (change === null) flag = 'new';
    else {
      const signed = m.direction === 'down' ? -change : change;
      flag = signed < -cfg.red_drop_pct ? 'red' : signed >= 0 ? 'green' : 'amber';
    }
    return { metric: k.Metric, value, last, change: change === null ? null : Math.round(change * 10) / 10, target, flag, format: m.format };
  });
  const order = Object.keys(cfg.metrics);
  metrics.sort((a, b) => (order.indexOf(a.metric) + 1 || 99) - (order.indexOf(b.metric) + 1 || 99));
  reports.push({ client: c.Client, contact: c['Contact name'] || '', email: String(c['Contact email']).trim(), manager: c['Account manager'] || '',
    month: cur, metrics, red: metrics.filter(m => m.flag === 'red').length, amber: metrics.filter(m => m.flag === 'amber').length });
}
return [{ json: { month: cur, reports, held } }];`),
    code('Write each client report', `
// HTML table per client. Colours are inline because most mail clients drop <style>.
const cfg = $('config').first().json;
const { month, reports } = $input.first().json;
const label = new Date(month + '-01T12:00:00Z').toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const fmt = (v, f) => v === null || Number.isNaN(v) ? '-' : f === 'money' ? new Intl.NumberFormat('en-US', { style: 'currency', currency: cfg.currency }).format(v)
  : f === 'percent' ? v.toFixed(2) + '%' : Math.round(v).toLocaleString('en-US');
const colour = { green: '#1e7b34', amber: '#a86400', red: '#b3261e', info: '#555555', new: '#555555' };
const word = { green: 'On track', amber: 'Watch', red: 'Needs attention', info: '', new: 'First month' };
const td = s => '<td style="padding:6px 10px;border-bottom:1px solid #ddd">' + s + '</td>';
return reports.map(r => {
  const rows = r.metrics.map(m => '<tr>' + td(m.metric) + td(fmt(m.value, m.format)) + td(fmt(m.last, m.format)) +
    td(m.change === null ? '-' : (m.change > 0 ? '+' : '') + m.change + '%') + td(fmt(m.target, m.format)) +
    td('<span style="color:' + colour[m.flag] + ';font-weight:bold">' + word[m.flag] + '</span>') + '</tr>').join('');
  const html = '<p>Hi ' + (r.contact.split(' ')[0] || 'there') + ',</p><p>Here are your numbers for ' + label + ', compared with the month before.</p>' +
    '<table style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px"><tr style="background:#f3f3f3">' +
    ['Metric', 'This month', 'Last month', 'Change', 'Target', 'Status'].map(h => '<th style="padding:6px 10px;text-align:left">' + h + '</th>').join('') + '</tr>' + rows + '</table>' +
    (r.red ? '<p>We will be in touch this week about the items marked Needs attention.</p>' : '<p>Everything is on track. Reply if you want to go through any of it.</p>') +
    '<p>' + cfg.agency_name + '</p>';
  return { json: { client: r.client, email: r.email, red: r.red, subject: r.client + ': ' + label + ' report', html, send_to: cfg.mode === 'test' ? cfg.test_email : r.email } };
});`),
    code('Write the internal summary', `
// One email for the team, worst accounts first, with everything held back.
const cfg = $('config').first().json;
const { month, reports, held } = $input.first().json;
const sorted = [...reports].sort((a, b) => b.red - a.red || b.amber - a.amber);
const lines = [
  'KPI reports for ' + month + ' (' + cfg.mode + '): ' + reports.length + ' client reports.', '',
  ...sorted.map(r => '- ' + r.client + ' (' + (r.manager || 'no AM') + '): ' + r.red + ' red, ' + r.amber + ' amber' +
    (r.red ? ': ' + r.metrics.filter(m => m.flag === 'red').map(m => m.metric).join(', ') : '')),
  ...(held.length ? ['', 'Not sent:', ...held.map(h => '- ' + h.client + ': ' + h.reason)] : []),
];
return [{ json: { subject: 'Client KPI reports ' + month + ': ' + sorted.filter(r => r.red).length + ' need attention', body: lines.join('\\n'),
  send_to: cfg.mode === 'test' ? cfg.test_email : cfg.internal_email } }];`),
    ifTrue('Send the internal summary?', cfg('sends_enabled')),
    stop('STOP: internal summary not sent'),
    gmail.send('Email the internal summary', { to: '$json.send_to', subject: "($('config').first().json.mode === 'test' ? '[TEST] ' : '') + $json.subject", message: '$json.body' }),
    ifTrue('Sending switched on?', cfg('sends_enabled')),
    stop('STOP: preview - nothing sent'),
    gmail.send('Email each client report', { to: '$json.send_to', subject: "($('config').first().json.mode === 'test' ? '[TEST to ' + $json.email + '] ' : '') + $json.subject", message: '$json.html', html: true }),
  ],
  edges: [
    ['Run manually', 'config'], ['On the 2nd of each month at 08:00', 'config'],
    ['config', 'KPI sheet set?'],
    ['KPI sheet set?', 0, 'Read the KPIs tab'], ['KPI sheet set?', 0, 'Read the Clients tab'], ['KPI sheet set?', 1, 'Load sample KPIs and clients'],
    ['Read the KPIs tab', 'Combine KPI sources'], ['Read the Clients tab', 0, 'Combine KPI sources', 1], ['Load sample KPIs and clients', 0, 'Combine KPI sources', 2],
    ['Combine KPI sources', 'Compare months per client'],
    ['Compare months per client', 'Write each client report'],
    ['Compare months per client', 'Write the internal summary'],
    ['Write the internal summary', 'Send the internal summary?'],
    ['Send the internal summary?', 0, 'Email the internal summary'], ['Send the internal summary?', 1, 'STOP: internal summary not sent'],
    ['Write each client report', 'Sending switched on?'],
    ['Sending switched on?', 0, 'Email each client report'], ['Sending switched on?', 1, 'STOP: preview - nothing sent'],
  ],
  groups: [
    { title: 'Start and settings', why: 'Runs on the 2nd of each month at 08:00, giving ad platforms a day to settle last month. Metric directions, flag thresholds and the currency live in `config`.', nodes: ['Run manually', 'On the 2nd of each month at 08:00', 'config'] },
    { title: 'Read KPIs and clients', why: 'KPIs and contacts are read in parallel and told apart by their columns. `Load sample KPIs and clients` dates its rows to last month, so a preview always has a report month.', nodes: ['KPI sheet set?', 'Read the KPIs tab', 'Read the Clients tab', 'Load sample KPIs and clients', 'Combine KPI sources'] },
    { title: 'Compare, flag and summarise', why: 'Flags read the target first and fall back to the change, and `METRICS` says which way is good, so a falling cost per lead is green. The internal summary sorts accounts by red count so the worst is read first.', nodes: ['Compare months per client', 'Write each client report', 'Write the internal summary', 'Send the internal summary?', 'STOP: internal summary not sent', 'Email the internal summary'] },
    { title: 'Email the clients', why: 'Nothing is sent while `TEST_RUN` is true and `TEST_EMAIL` is blank. In test mode every report goes to you, with the real recipient in the subject, so the table can be checked in a real inbox.', nodes: ['Sending switched on?', 'STOP: preview - nothing sent', 'Email each client report'] },
  ],
  scenarios: [
    {
      name: 'shipped config (preview)', start: 'Run manually',
      expect: { reached: ['Load sample KPIs and clients', 'STOP: preview - nothing sent', 'STOP: internal summary not sent'], outward: 'none' },
      check: out => {
        const c = out['Compare months per client'][0];
        const f: string[] = [];
        const rep = (n: string) => c.reports.find((r: any) => r.client === n);
        const flag = (n: string, m: string) => rep(n)?.metrics.find((x: any) => x.metric === m)?.flag;
        if (c.reports.length !== 3) f.push(`expected 3 reports, got ${c.reports.length}`);
        if (rep('Harbour Dental')?.red !== 0 || flag('Harbour Dental', 'Cost per lead') !== 'green') f.push('Harbour Dental beat every target');
        if (flag('Northfield Studio', 'Sessions') !== 'red') f.push('Northfield sessions fell 21% with no target: red');
        if (flag('Northfield Studio', 'Leads') !== 'red') f.push('Northfield leads 102 vs 125 target is red');
        if (flag('Northfield Studio', 'Cost per lead') !== 'amber') f.push('Northfield CPL 33.5 vs 32 is within 10%: amber');
        if (flag('Northfield Studio', 'Ad spend') !== 'info') f.push('Ad spend is neutral');
        if (flag('Lumen Physio', 'Sessions') !== 'new') f.push('Lumen sessions have no prior month');
        if (rep('Northfield Studio')?.metrics.find((x: any) => x.metric === 'Sessions')?.change !== -21.4) f.push('Northfield sessions change should be -21.4%');
        const held = c.held.map((h: any) => h.client + ':' + h.reason).join('|');
        if (!held.includes('Orchard Lane Cafe:no data') || !held.includes('Pine & Co:no contact email')) f.push(`held wrong: ${held}`);
        if (!out['Write the internal summary'][0].body.split('\n')[2].startsWith('- Northfield Studio')) f.push('worst account first in the summary');
        return f;
      },
    },
    {
      name: 'live send from the sheet', start: 'On the 2nd of each month at 08:00',
      overrides: { KPI_SHEET_ID: '1KpiSheetExample', TEST_RUN: false },
      mocks: {
        'Read the KPIs tab': () => {
          const now = new Date();
          const ym = (b: number) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - b, 1)).toISOString().slice(0, 7);
          return [{ row_number: 2, Client: 'Acme Bikes', Month: ym(2), Metric: 'Leads', Value: '40', Target: '' }, { row_number: 3, Client: 'Acme Bikes', Month: ym(1), Metric: 'Leads', Value: '44', Target: '' }];
        },
        'Read the Clients tab': [{ row_number: 2, Client: 'Acme Bikes', 'Contact name': 'Ivy Moss', 'Contact email': 'ivy@acmebikes.example', 'Account manager': 'Ana' }],
        'Email each client report': [{ id: 'msg-1' }],
        'Email the internal summary': [{ id: 'msg-2' }],
      },
      expect: { reached: ['Email each client report', 'Email the internal summary'], notReached: ['Load sample KPIs and clients'], outward: 'some' },
      check: out => {
        const r = out['Write each client report'][0];
        const f: string[] = [];
        if (r.send_to !== 'ivy@acmebikes.example') f.push('live report goes to the contact');
        if (!r.html.includes('+10%')) f.push('44 vs 40 should show +10%');
        return f;
      },
    },
  ],
});
