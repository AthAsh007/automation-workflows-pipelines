import { defineSpec } from '../_kit/spec';
import { trigger, code, ifTrue, merge, stop, sheets, gmail } from '../_kit/n';

const cfg = (k: string) => `$('config').first().json.${k}`;

export default defineSpec({
  slug: 'timesheet-invoices-from-sheets',
  title: 'Send monthly client invoices from Google Sheets timesheets with Gmail',
  summary: 'On the 1st of each month, totals last month\'s billable hours per client and rate from a Google Sheets timesheet, rounds each entry, applies minimum fees and tax, numbers the invoices, emails them as HTML through Gmail and logs each one to an Invoices tab.',
  category: 'Finance and billing',
  description: {
    who: 'Consultants and small agencies that log hours in a shared Google Sheet and build invoices from it by hand each month. The invoices go out at 08:00 on the 1st with the same numbering and rounding every time.',
    how: [
      'On the 1st at 08:00 it reads the Timesheet and Invoices tabs, or sample rows until a sheet is connected.',
      'Last month\'s billable entries are rounded up to 15 minutes each, then grouped by client, project and rate. A Rate column on a row overrides the rate set in `CLIENTS`.',
      'Each client gets its minimum fee, tax rate and payment terms from `CLIENTS`. Clients already invoiced for the month, and hours for unknown clients, are held back with a reason.',
      'Invoice numbers continue from the highest number on the Invoices tab. Each invoice is emailed as an HTML table and, on a live run, appended to the Invoices tab.',
    ],
    setup: [
      'Run it once as imported. It builds three sample invoices and stops at `STOP: preview - nothing sent`.',
      'Connect Google Sheets, put the spreadsheet id in `TIMESHEET_SHEET_ID`, and add your clients to `CLIENTS` with the exact names used on the Timesheet tab.',
      'Connect Gmail on `Email the invoice`.',
      'Put your address in `TEST_EMAIL` to receive every invoice yourself. Set `TEST_RUN = false` to send to clients and log the numbers.',
    ],
    requirements: ['A Google Sheet with Timesheet and Invoices tabs', 'A Gmail account'],
    customize: [
      '`ROUND_TO_MINUTES` and `ROUND_MODE` set the rounding of each entry.',
      '`CLIENTS` holds each rate, currency, minimum fee, tax rate and payment terms.',
      '`INVOICE_PREFIX` and `PAYMENT_DETAILS` change the numbering and the footer.',
    ],
  },
  config: {
    intro: ['TIMESHEET_SHEET_ID blank -> SAMPLE timesheet rows and invoice log.', 'Invoices are logged to the Invoices tab only on a live run, so test runs never use up numbers.'],
    consts: [
      { name: 'TIMESHEET_SHEET_ID', value: '', note: 'Google Sheets id with Timesheet (Date, Client, Project, Person, Hours, Billable, Rate) and Invoices tabs' },
      { name: 'CLIENTS', value: [
        { name: 'Harbour Dental', email: 'ap@harbour-dental.example', rate: 120, currency: 'USD', minimum_fee: 500, tax_rate: 0, terms_days: 14 },
        { name: 'Northfield Studio', email: 'billing@northfield.example', rate: 95, currency: 'GBP', minimum_fee: 0, tax_rate: 0.2, terms_days: 30 },
        { name: 'Lumen Physio', email: 'admin@lumenphysio.example', rate: 110, currency: 'USD', minimum_fee: 1000, tax_rate: 0, terms_days: 14 },
        { name: 'Orchard Lane Cafe', email: 'owner@orchardlane.example', rate: 90, currency: 'USD', minimum_fee: 0, tax_rate: 0, terms_days: 14 },
      ], note: 'one entry per client; name must match a Client column value exactly (case ignored)' },
      { name: 'ROUND_TO_MINUTES', value: 15, note: 'each entry is rounded to this many minutes' },
      { name: 'ROUND_MODE', value: 'up', note: "'up' or 'nearest'" },
      { name: 'INVOICE_PREFIX', value: 'INV', note: 'numbers look like INV-2026-0042' },
      { name: 'BUSINESS_NAME', value: 'Fieldnote Consulting', note: 'shown at the top of every invoice' },
      { name: 'PAYMENT_DETAILS', value: 'Bank transfer to account 00-11-22 / 12345678, reference the invoice number.', note: 'footer line on every invoice' },
    ],
    flags: { sheets_enabled: "TIMESHEET_SHEET_ID.trim() !== ''" },
    safety: 'test_run',
  },
  nodes: [
    trigger.manual(),
    trigger.schedule('On the 1st at 08:00', '0 8 1 * *'),
    ifTrue('Use sample timesheet?', '!' + cfg('sheets_enabled')),
    sheets.read('Read the Timesheet tab', cfg('timesheet_sheet_id'), 'Timesheet'),
    code('Collect timesheet rows', `
// Many sheet rows -> one item, so the Invoices tab is read once and not once per row.
return [{ json: { entries: $input.all().map(i => i.json) } }];`),
    sheets.read('Read the Invoices tab', cfg('timesheet_sheet_id'), 'Invoices'),
    code('Collect the invoice log', `
// Pairs the timesheet with the invoice log in the same shape the sample path uses.
return [{ json: { entries: $('Collect timesheet rows').first().json.entries, log: $input.all().map(i => i.json).filter(r => r.invoice_number) } }];`),
    code('Load sample timesheet', `
// Used until TIMESHEET_SHEET_ID is set. Dates fall in last month, plus one row from this month.
const now = new Date();
const d = n => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, n)).toISOString().slice(0, 10);
const thisMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
const p = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
const e = (date, client, project, person, hours, billable = 'yes', rate = '') => ({ Date: date, Client: client, Project: project, Person: person, Hours: hours, Billable: billable, Rate: rate });
return [{ json: {
  entries: [
    e(d(3), 'Harbour Dental', 'Website rebuild', 'Ana', 2.1), e(d(4), 'Harbour Dental', 'Website rebuild', 'Ana', 3),
    e(d(10), 'harbour dental', 'Website rebuild', 'Ben', '1.5'), e(d(11), 'Harbour Dental', 'Strategy session', 'Cara', 1.2, 'yes', 150),
    e(d(12), 'Harbour Dental', 'Internal review', 'Ana', 2, 'no'), e(thisMonth, 'Harbour Dental', 'Website rebuild', 'Ana', 4),
    e(d(5), 'Northfield Studio', 'Brand refresh', 'Ben', 4), e(d(18), 'Northfield Studio', 'Brand refresh', 'Ben', 2.4),
    e(d(7), 'Lumen Physio', 'Booking flow', 'Cara', 3.1),
    e(d(8), 'Orchard Lane Cafe', 'Menu site', 'Ana', 2),
    e(d(9), 'Pine and Co', 'Logo', 'Ben', 1),
  ],
  log: [
    { invoice_number: 'INV-' + p.slice(0, 4) + '-0040', client: 'Harbour Dental', period: '2000-01', total: 900 },
    { invoice_number: 'INV-' + p.slice(0, 4) + '-0041', client: 'Orchard Lane Cafe', period: p, total: 180 },
  ],
} }];`),
    merge('Combine timesheet sources'),
    code('Build invoices per client', `
// Last calendar month only. Each entry is rounded first (so rounding is visible per
// line), then grouped by client, project and rate. Minimum fee tops up the subtotal.
const cfg = $('config').first().json;
const { entries, log } = $input.first().json;
const now = new Date();
const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
const period = start.toISOString().slice(0, 7);
const step = cfg.round_to_minutes / 60;
const round = h => (cfg.round_mode === 'nearest' ? Math.round(h / step) : Math.ceil(h / step - 1e-9)) * step;
const r2 = n => Math.round(n * 100) / 100;
const clients = Object.fromEntries(cfg.clients.map(c => [c.name.toLowerCase(), c]));
const invoiced = new Set(log.filter(l => l.period === period).map(l => String(l.client).toLowerCase()));
const groups = {}, held = [];
let skippedRows = 0;
for (const e of entries) {
  const date = new Date(String(e.Date).slice(0, 10));
  const hours = Number(String(e.Hours).replace(',', '.'));
  const billable = !/^(no|n|false|0)$/i.test(String(e.Billable || 'yes').trim());
  if (!(date >= start && date < end) || !billable || !(hours > 0)) { skippedRows++; continue; }
  const key = String(e.Client || '').trim().toLowerCase();
  const c = clients[key];
  if (!c) { held.push({ client: e.Client, reason: 'not in CLIENTS, ' + hours + 'h not billed' }); continue; }
  if (invoiced.has(key)) { if (!held.some(h => h.client === c.name)) held.push({ client: c.name, reason: 'already invoiced for ' + period }); continue; }
  const rate = Number(e.Rate) > 0 ? Number(e.Rate) : c.rate;
  const g = (groups[c.name] ||= { client: c, lines: {} });
  const lk = e.Project + '|' + rate;
  const line = (g.lines[lk] ||= { description: e.Project, rate, hours: 0, entries: 0 });
  line.hours += round(hours); line.entries++;
}
const year = period.slice(0, 4);
let next = Math.max(0, ...log.map(l => Number(String(l.invoice_number).split('-').pop()) || 0)) + 1;
const issued = now.toISOString().slice(0, 10);
const invoices = Object.values(groups).sort((a, b) => a.client.name.localeCompare(b.client.name)).map(g => {
  const lines = Object.values(g.lines).map(l => ({ ...l, hours: r2(l.hours), amount: r2(l.hours * l.rate) }));
  let subtotal = r2(lines.reduce((s, l) => s + l.amount, 0));
  if (subtotal < g.client.minimum_fee) {
    lines.push({ description: 'Minimum monthly fee adjustment', rate: '', hours: '', entries: 0, amount: r2(g.client.minimum_fee - subtotal) });
    subtotal = g.client.minimum_fee;
  }
  const tax = r2(subtotal * g.client.tax_rate);
  const due = new Date(now.getTime() + g.client.terms_days * 864e5).toISOString().slice(0, 10);
  return { invoice_number: cfg.invoice_prefix + '-' + year + '-' + String(next++).padStart(4, '0'), client: g.client.name, email: g.client.email,
    currency: g.client.currency, period, issued, due, lines, hours: r2(lines.reduce((s, l) => s + (Number(l.hours) || 0), 0)),
    subtotal, tax, tax_rate: g.client.tax_rate, total: r2(subtotal + tax) };
});
return [{ json: { period, invoices, held, skipped_rows: skippedRows } }];`),
    code('Write each invoice email', `
// Plain HTML table; inline styles only because most mail clients drop <style> blocks.
const cfg = $('config').first().json;
const { invoices } = $input.first().json;
const td = 'style="padding:6px 10px;border-bottom:1px solid #ddd"';
return invoices.map(inv => {
  const m = n => new Intl.NumberFormat('en-US', { style: 'currency', currency: inv.currency }).format(n);
  const rows = inv.lines.map(l => '<tr><td ' + td + '>' + l.description + '</td><td ' + td + '>' + (l.hours === '' ? '' : l.hours + ' h') + '</td><td ' + td + '>' + (l.rate === '' ? '' : m(l.rate)) + '</td><td ' + td + ' align="right">' + m(l.amount) + '</td></tr>').join('');
  const html = '<div style="font-family:Arial,sans-serif;font-size:14px">'
    + '<h2>' + cfg.business_name + '</h2><p>Invoice <b>' + inv.invoice_number + '</b><br>Period: ' + inv.period + '<br>Issued: ' + inv.issued + '<br>Due: ' + inv.due + '</p>'
    + '<p>Bill to: ' + inv.client + '</p><table style="border-collapse:collapse"><tr><th align="left">Item</th><th align="left">Hours</th><th align="left">Rate</th><th align="right">Amount</th></tr>' + rows
    + '<tr><td colspan="3" align="right">Subtotal</td><td align="right">' + m(inv.subtotal) + '</td></tr>'
    + (inv.tax ? '<tr><td colspan="3" align="right">Tax ' + Math.round(inv.tax_rate * 100) + '%</td><td align="right">' + m(inv.tax) + '</td></tr>' : '')
    + '<tr><td colspan="3" align="right"><b>Total</b></td><td align="right"><b>' + m(inv.total) + '</b></td></tr></table>'
    + '<p>' + cfg.payment_details + '</p></div>';
  return { json: { ...inv, html, subject: 'Invoice ' + inv.invoice_number + ' from ' + cfg.business_name + ' (' + inv.period + ')',
    send_to: cfg.mode === 'test' ? cfg.test_email : inv.email } };
});`),
    ifTrue('Sending switched on?', cfg('sends_enabled')),
    stop('STOP: preview - nothing sent'),
    gmail.send('Email the invoice', { to: '$json.send_to', subject: "($('config').first().json.mode === 'test' ? '[TEST to ' + $json.email + '] ' : '') + $json.subject", message: '$json.html', html: true }),
    ifTrue('Live run?', cfg('live')),
    stop('STOP: test send - invoice log untouched'),
    code('Shape the invoice log row', `
// One flat row per sent invoice for the Invoices tab; the next run numbers from these.
const inv = $('Write each invoice email').item.json;
return { json: { invoice_number: inv.invoice_number, client: inv.client, period: inv.period, issued: inv.issued, due: inv.due,
  hours: inv.hours, subtotal: inv.subtotal, tax: inv.tax, total: inv.total, currency: inv.currency, sent_to: inv.email, status: 'sent' } };`, { perItem: true }),
    sheets.append('Log to the Invoices tab', cfg('timesheet_sheet_id'), 'Invoices'),
  ],
  edges: [
    ['Run manually', 'config'], ['On the 1st at 08:00', 'config'],
    ['config', 'Use sample timesheet?'],
    ['Use sample timesheet?', 0, 'Load sample timesheet'], ['Use sample timesheet?', 1, 'Read the Timesheet tab'],
    ['Read the Timesheet tab', 'Collect timesheet rows'],
    ['Collect timesheet rows', 'Read the Invoices tab'],
    ['Read the Invoices tab', 'Collect the invoice log'],
    ['Load sample timesheet', 'Combine timesheet sources'], ['Collect the invoice log', 0, 'Combine timesheet sources', 1],
    ['Combine timesheet sources', 'Build invoices per client'],
    ['Build invoices per client', 'Write each invoice email'],
    ['Write each invoice email', 'Sending switched on?'],
    ['Sending switched on?', 0, 'Email the invoice'], ['Sending switched on?', 1, 'STOP: preview - nothing sent'],
    ['Email the invoice', 'Live run?'],
    ['Live run?', 0, 'Shape the invoice log row'], ['Live run?', 1, 'STOP: test send - invoice log untouched'],
    ['Shape the invoice log row', 'Log to the Invoices tab'],
  ],
  groups: [
    { title: 'Start and settings', why: 'Runs at 08:00 on the 1st, so the whole previous month is closed. Client rates, minimum fees, tax and terms live in `CLIENTS` inside `config`.', nodes: ['Run manually', 'On the 1st at 08:00', 'config'] },
    { title: 'Read hours and past invoices', why: 'The Invoices tab is read after the timesheet is collected into one item, so it is fetched once. `Load sample timesheet` returns the same pair until `TIMESHEET_SHEET_ID` is set.', nodes: ['Use sample timesheet?', 'Load sample timesheet', 'Read the Timesheet tab', 'Collect timesheet rows', 'Read the Invoices tab', 'Collect the invoice log', 'Combine timesheet sources'] },
    { title: 'Price and write invoices', why: '`Build invoices per client` rounds each entry before grouping, tops up to the minimum fee, and skips clients already on the log for the month, so a second run in the same month sends nothing new.', nodes: ['Build invoices per client', 'Write each invoice email'] },
    { title: 'Send and log', why: 'A test send goes to `TEST_EMAIL` and leaves the Invoices tab alone, so numbers are only used by invoices that really went to clients.', nodes: ['Sending switched on?', 'STOP: preview - nothing sent', 'Email the invoice', 'Live run?', 'STOP: test send - invoice log untouched', 'Shape the invoice log row', 'Log to the Invoices tab'] },
  ],
  scenarios: [
    {
      name: 'shipped config (preview)', start: 'Run manually',
      expect: { reached: ['Load sample timesheet', 'STOP: preview - nothing sent'], outward: 'none' },
      check: out => {
        const b = out['Build invoices per client'][0];
        const by = (c: string) => b.invoices.find((i: any) => i.client === c);
        const f: string[] = [];
        if (b.invoices.length !== 3) f.push(`expected 3 invoices, got ${b.invoices.length}`);
        const h = by('Harbour Dental');
        if (h?.total !== 997.5 || h?.hours !== 8 || h?.invoice_number.slice(-4) !== '0042') f.push(`Harbour wrong: ${h?.total} ${h?.hours} ${h?.invoice_number}`);
        const l = by('Lumen Physio');
        if (l?.total !== 1000 || l?.lines.at(-1).amount !== 642.5 || l?.invoice_number.slice(-4) !== '0043') f.push(`Lumen minimum fee wrong: ${JSON.stringify(l?.lines)}`);
        const n = by('Northfield Studio');
        if (n?.subtotal !== 617.5 || n?.tax !== 123.5 || n?.total !== 741) f.push(`Northfield tax wrong: ${n?.subtotal} ${n?.tax} ${n?.total}`);
        if (!b.held.some((x: any) => x.reason.startsWith('already invoiced'))) f.push('Orchard Lane should be held as already invoiced');
        if (!b.held.some((x: any) => x.client === 'Pine and Co')) f.push('unknown client should be held');
        if (b.skipped_rows !== 2) f.push(`non-billable and this-month rows should be skipped, got ${b.skipped_rows}`);
        return f;
      },
    },
    {
      name: 'test send to TEST_EMAIL', start: 'Run manually', overrides: { TEST_EMAIL: 'you@example.com' },
      mocks: { 'Email the invoice': (items: any[]) => items.map(() => ({ id: 'msg_1', labelIds: ['SENT'] })) },
      expect: { reached: ['Email the invoice', 'STOP: test send - invoice log untouched'], notReached: ['Log to the Invoices tab'], outward: 'some' },
      check: out => out['Write each invoice email'].every((r: any) => r.send_to === 'you@example.com' && r.html.includes('<table')) ? [] : ['test send not redirected or html missing'],
    },
    {
      name: 'live from the sheet', start: 'On the 1st at 08:00',
      overrides: { TIMESHEET_SHEET_ID: '1TsAbCdEf', TEST_RUN: false },
      mocks: {
        'Read the Timesheet tab': () => {
          const now = new Date();
          const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 15)).toISOString().slice(0, 10);
          return [{ row_number: 2, Date: d, Client: 'Northfield Studio', Project: 'Brand refresh', Person: 'Ben', Hours: '1,1', Billable: 'TRUE', Rate: '' }];
        },
        'Read the Invoices tab': [{ row_number: 2, invoice_number: 'INV-2026-0107', client: 'Harbour Dental', period: '2026-01', total: 400 }],
        'Email the invoice': [{ id: 'msg_9', labelIds: ['SENT'] }],
        'Log to the Invoices tab': (items: any[]) => items,
      },
      expect: { reached: ['Collect the invoice log', 'Email the invoice', 'Log to the Invoices tab'], notReached: ['Load sample timesheet'], outward: 'some' },
      check: out => {
        const row = out['Shape the invoice log row'][0];
        const f: string[] = [];
        if (!row?.invoice_number.endsWith('-0108')) f.push(`numbering should continue at 0108, got ${row?.invoice_number}`);
        if (row?.hours !== 1.25 || row?.total !== 142.5) f.push(`1.1h should round up to 1.25h and total 142.5 incl. tax, got ${row?.hours} ${row?.total}`);
        return f;
      },
    },
  ],
});
