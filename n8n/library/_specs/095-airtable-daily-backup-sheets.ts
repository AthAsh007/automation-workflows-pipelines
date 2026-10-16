import { defineSpec } from '../_kit/spec';
import { trigger, code, ifTrue, ifWhen, merge, stop, http, sheets, slack } from '../_kit/n';

const cfg = (k: string) => `$('config').first().json.${k}`;

export default defineSpec({
  slug: 'airtable-daily-backup-sheets',
  title: 'Back up Airtable tables to Google Sheets every night',
  summary: 'Each night reads every listed Airtable table, flattens attachments, linked records, collaborators and multi-selects into plain text, upserts one row per record into a Google Sheets tab per table, logs row counts and alerts Slack when a table shrinks sharply or hits the page limit.',
  category: 'Productivity and operations',
  description: {
    who: 'Teams that run a CRM, content calendar or inventory in Airtable and have no copy outside it. A bulk delete or a broken automation shows up in the morning as a Slack alert, and the rows are still in the sheet.',
    how: [
      'Every night at 02:00 it reads each table in `TABLES` from Airtable, 100 records per table, or sample tables until Airtable is connected.',
      'Fields are flattened for a spreadsheet: attachments become file name and URL, linked records and multi-selects become a ; list, collaborators become their name, checkboxes become TRUE or FALSE.',
      'Row counts are compared with last night\'s line on the Backup log tab. A drop of more than `DROP_ALERT_PCT` percent (and at least `MIN_DROP_ROWS` rows) is flagged, and so is a table with more than 100 records, because the rest was not copied.',
      'Rows are upserted by Airtable record id into a tab named `Backup <table>`, so a deleted record stays in the sheet. Tonight\'s counts are appended to the Backup log.',
    ],
    setup: [
      'Run it once as imported. It flattens sample tables and stops at `STOP: dry run - sheet untouched`.',
      'Add an Airtable personal access token credential to `Fetch records from Airtable`, set `AIRTABLE_BASE_ID` and `TABLES`, then set `USE_AIRTABLE = true`.',
      'Create a sheet with a Backup log tab and one `Backup <table>` tab per table, each with a Record ID column. Connect Google Sheets and set `BACKUP_SHEET_ID`.',
      'Optionally set `SLACK_CHANNEL_ID`, then set `DRY_RUN = false`.',
    ],
    requirements: ['An Airtable base and a personal access token', 'A Google Sheet for the copies', 'Optional: a Slack workspace'],
    customize: [
      '`TABLES` lists table names or ids to copy.',
      '`DROP_ALERT_PCT` and `MIN_DROP_ROWS` decide when a smaller table is worth an alert.',
      '`MAX_CELL_CHARS` trims long text so a cell stays under the Google Sheets limit.',
    ],
  },
  config: {
    intro: ['USE_AIRTABLE false -> SAMPLE tables. BACKUP_SHEET_ID blank -> SAMPLE backup log.', 'DRY_RUN true -> rows and counts are computed and shown, nothing is written or posted.'],
    consts: [
      { name: 'USE_AIRTABLE', value: false, note: 'set true after adding the Airtable credential' },
      { name: 'AIRTABLE_BASE_ID', value: '', note: 'base id, starts with app, from the base URL' },
      { name: 'TABLES', value: ['Clients', 'Projects', 'Invoices'], note: 'table names or ids to back up' },
      { name: 'BACKUP_SHEET_ID', value: '', note: 'Google Sheets id with a Backup log tab and Backup <table> tabs' },
      { name: 'DROP_ALERT_PCT', value: 20, note: 'alert when a table has this percent fewer rows than last night' },
      { name: 'MIN_DROP_ROWS', value: 3, note: 'and at least this many rows fewer' },
      { name: 'MAX_CELL_CHARS', value: 45000, note: 'longer text is cut to fit in one Sheets cell' },
      { name: 'SLACK_CHANNEL_ID', value: '', note: 'channel for drop and truncation alerts; blank skips Slack' },
    ],
    flags: { sheets_enabled: "BACKUP_SHEET_ID.trim() !== ''", slack_enabled: "SLACK_CHANNEL_ID.trim() !== ''" },
    safety: 'dry_run',
  },
  nodes: [
    trigger.manual(),
    trigger.schedule('Every night at 02:00', '0 2 * * *'),
    code('List the tables to back up', `
// One item per table, so each Airtable request is its own call.
return $('config').first().json.tables.map(table => ({ json: { table } }));`),
    ifTrue('Airtable connected?', cfg('use_airtable')),
    http('Fetch records from Airtable', {
      url: `={{ 'https://api.airtable.com/v0/' + ${cfg('airtable_base_id')} + '/' + encodeURIComponent($json.table) }}`, auth: 'airtableTokenApi',
      query: { pageSize: '100' },
    }),
    code('Load sample Airtable records', `
// Used until USE_AIRTABLE is true. One list response per table. Invoices returns an
// offset, the API's sign that more than 100 records exist.
const ago = n => new Date(Date.now() - n * 864e5).toISOString();
const rec = (id, days, fields) => ({ id, createdTime: ago(days), fields });
const owner = { id: 'usrA', email: 'ana@northwind.example', name: 'Ana Ruiz' };
const data = {
  Clients: { records: [
    rec('recC1', 400, { Name: 'Harbour Dental', Email: 'ap@harbour-dental.example', Status: 'Active', Owner: owner, Tags: ['dental', 'retainer'],
      Logo: [{ id: 'att1', url: 'https://dl.airtable.example/harbour.png', filename: 'harbour.png', size: 20412, type: 'image/png' }] }),
    rec('recC2', 300, { Name: 'Northfield Studio', Email: 'billing@northfield.example', Status: 'Active', Owner: owner, Tags: ['design'] }),
    rec('recC3', 200, { Name: 'Orchard Lane Cafe', Status: 'Paused', Tags: [] }),
    rec('recC4', 90, { Name: 'Pine & Co', Email: 'accounts@pineco.example', Status: 'Lead', Notes: 'Met at the October expo.\\nWants a quote for Q1.' }),
    rec('recC5', 10, { Name: 'Lumen Physio', Email: 'admin@lumenphysio.example', Status: 'Active', VIP: true }),
  ] },
  Projects: { records: [
    rec('recP1', 60, { Project: 'Website rebuild', Client: ['recC1'], Budget: 18000, Active: true }),
    rec('recP2', 45, { Project: 'Brand refresh', Client: ['recC2'], Budget: 9500, Active: true }),
    rec('recP3', 30, { Project: 'Menu photography', Client: ['recC3'], Budget: 1200, Active: false }),
    rec('recP4', 5, { Project: 'Booking funnel', Client: ['recC5', 'recC1'], Budget: 6400, Active: true }),
  ] },
  Invoices: { offset: 'itrSAMPLE/recI3', records: [
    rec('recI1', 40, { Number: 'INV-1041', Amount: 1200, Paid: false }),
    rec('recI2', 20, { Number: 'INV-1044', Amount: 20, Paid: true }),
    rec('recI3', 3, { Number: 'INV-1046', Amount: 980, Paid: false }),
  ] },
};
return $input.all().map(i => ({ json: { _table: i.json.table, ...(data[i.json.table] || { records: [] }) } }));`),
    merge('Combine record sources'),
    code('Flatten records into rows', `
// Airtable cell types -> plain text a sheet can hold. Responses line up with the table
// list by position (the HTTP node returns one response per table item).
const cfg = $('config').first().json;
const tables = $('List the tables to back up').all().map(i => i.json.table);
const stamp = new Date().toISOString();
const cell = v => {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (typeof v === 'number') return v;
  if (Array.isArray(v)) return v.map(x => x && typeof x === 'object' ? (x.filename ? x.filename + ' (' + x.url + ')' : x.name || x.email || x.id || JSON.stringify(x)) : String(x)).join('; ');
  if (typeof v === 'object') return v.name || v.email || (v.label ?? '') || JSON.stringify(v);
  return String(v).slice(0, cfg.max_cell_chars);
};
const rows = [], counts = [];
$input.all().forEach((item, i) => {
  const table = item.json._table || tables[i];
  const records = item.json.records || [];
  counts.push({ table, rows: records.length, truncated: Boolean(item.json.offset) });
  for (const r of records) {
    const row = { 'Record ID': r.id, Table: table, Created: r.createdTime, 'Backed up at': stamp };
    for (const [k, v] of Object.entries(r.fields || {})) row[k] = cell(v);
    rows.push(row);
  }
});
return [{ json: { rows, counts, stamp } }];`),
    ifTrue('Backup sheet set?', cfg('sheets_enabled')),
    sheets.read('Read the Backup log tab', cfg('backup_sheet_id'), 'Backup log'),
    code('Load sample backup log', `
// Used until BACKUP_SHEET_ID is set: last night's counts. Projects had 9 rows, so
// tonight's 4 reads as a drop.
const yesterday = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
return [
  { Date: yesterday, Table: 'Clients', Rows: 5, Truncated: 'FALSE' },
  { Date: yesterday, Table: 'Projects', Rows: 9, Truncated: 'FALSE' },
  { Date: yesterday, Table: 'Invoices', Rows: 100, Truncated: 'TRUE' },
].map(json => ({ json }));`),
    merge('Combine log sources'),
    code('Compare counts with last night', `
// Latest earlier log line per table vs tonight. A drop alerts only when it is both
// DROP_ALERT_PCT percent and MIN_DROP_ROWS rows, so a single deletion stays quiet.
const cfg = $('config').first().json;
const flat = $('Flatten records into rows').first().json;
const today = flat.stamp.slice(0, 10);
const log = $input.all().map(i => i.json).filter(r => r.Table && String(r.Date || '').slice(0, 10) < today)
  .sort((a, b) => String(b.Date).localeCompare(String(a.Date)));
const alerts = [];
const tables = flat.counts.map(c => {
  const prev = log.find(l => l.Table === c.table);
  const before = prev ? Number(prev.Rows) : null;
  const diff = before === null ? null : c.rows - before;
  const pct = before ? Math.round(-diff / before * 100) : 0;
  // A truncated count is only a lower bound, so it never raises a drop alert.
  if (!c.truncated && before !== null && diff < 0 && pct >= cfg.drop_alert_pct && -diff >= cfg.min_drop_rows) alerts.push(c.table + ': ' + before + ' -> ' + c.rows + ' rows (' + pct + '% fewer than ' + String(prev.Date).slice(0, 10) + ')');
  if (c.truncated) alerts.push(c.table + ': more than 100 records, only the first 100 were copied');
  return { ...c, before, diff };
});
return [{ json: { tables, alerts, rows: flat.rows.length, log_rows: flat.counts.map(c => ({ Date: today, Table: c.table, Rows: c.rows, Truncated: c.truncated ? 'TRUE' : 'FALSE' })) } }];`),
    code('Split into sheet rows', `
// One item per record; the Table column picks the tab.
return $('Flatten records into rows').first().json.rows.map(json => ({ json }));`),
    ifWhen('Write the backup?', [[cfg('live'), 'true'], [cfg('sheets_enabled'), 'true']]),
    stop('STOP: dry run - sheet untouched'),
    sheets.upsert('Upsert rows into the table tab', cfg('backup_sheet_id'), "={{ 'Backup ' + $json.Table }}", 'Record ID'),
    code('Shape the log rows', `
// Tonight's counts, written once after the copies, for tomorrow's comparison.
return $('Compare counts with last night').first().json.log_rows.map(json => ({ json }));`),
    sheets.append('Append to the Backup log', cfg('backup_sheet_id'), 'Backup log'),
    code('Write the alert', `
// Only problems are posted; a clean night says nothing.
const cfg = $('config').first().json;
const c = $input.first().json;
const text = ['*Airtable backup* (' + cfg.mode + '): ' + c.rows + ' records from ' + c.tables.length + ' tables.', ...c.alerts.map(a => '- ' + a)].join('\\n');
return [{ json: { text, alerts: c.alerts.length } }];`),
    ifWhen('Post the alert?', [[cfg('live'), 'true'], [cfg('slack_enabled'), 'true'], ['$json.alerts', 'gt', 0]]),
    stop('STOP: no alert posted'),
    slack.post('Post the alert to Slack', cfg('slack_channel_id'), '$json.text'),
  ],
  edges: [
    ['Run manually', 'config'], ['Every night at 02:00', 'config'],
    ['config', 'List the tables to back up'],
    ['List the tables to back up', 'Airtable connected?'],
    ['Airtable connected?', 0, 'Fetch records from Airtable'], ['Airtable connected?', 1, 'Load sample Airtable records'],
    ['Fetch records from Airtable', 'Combine record sources'], ['Load sample Airtable records', 0, 'Combine record sources', 1],
    ['Combine record sources', 'Flatten records into rows'],
    ['Flatten records into rows', 'Backup sheet set?'],
    ['Backup sheet set?', 0, 'Read the Backup log tab'], ['Backup sheet set?', 1, 'Load sample backup log'],
    ['Read the Backup log tab', 'Combine log sources'], ['Load sample backup log', 0, 'Combine log sources', 1],
    ['Combine log sources', 'Compare counts with last night'],
    ['Compare counts with last night', 'Split into sheet rows'],
    ['Compare counts with last night', 'Write the alert'],
    ['Write the alert', 'Post the alert?'],
    ['Post the alert?', 0, 'Post the alert to Slack'], ['Post the alert?', 1, 'STOP: no alert posted'],
    ['Split into sheet rows', 'Write the backup?'],
    ['Write the backup?', 0, 'Upsert rows into the table tab'], ['Write the backup?', 1, 'STOP: dry run - sheet untouched'],
    ['Upsert rows into the table tab', 'Shape the log rows'],
    ['Shape the log rows', 'Append to the Backup log'],
  ],
  groups: [
    { title: 'Start and settings', why: 'Runs every night at 02:00, when nobody is editing. Base id, the table list and the alert thresholds all live in `config`.', nodes: ['Run manually', 'Every night at 02:00', 'config'] },
    { title: 'Read and flatten Airtable', why: 'One request per table with pageSize 100 and no paging loop; a returned offset is reported instead of followed. `Flatten records into rows` turns every Airtable cell type into text a sheet can hold.', nodes: ['List the tables to back up', 'Airtable connected?', 'Fetch records from Airtable', 'Load sample Airtable records', 'Combine record sources', 'Flatten records into rows'] },
    { title: 'Read last night\'s counts', why: 'Counts live on a Backup log tab rather than in workflow memory, so they survive a re-import and anyone can read the history. `Load sample backup log` makes the Projects drop visible in a preview.', nodes: ['Backup sheet set?', 'Read the Backup log tab', 'Load sample backup log', 'Combine log sources'] },
    { title: 'Compare, alert and write', why: 'The comparison runs before anything is written, so tonight\'s log line can never be compared with itself. Copies are upserted by record id, so a record deleted in Airtable keeps its last row in the sheet.', nodes: ['Compare counts with last night', 'Split into sheet rows', 'Write the alert', 'Write the backup?', 'Post the alert?', 'STOP: dry run - sheet untouched', 'Upsert rows into the table tab', 'STOP: no alert posted', 'Post the alert to Slack', 'Shape the log rows', 'Append to the Backup log'] },
  ],
  scenarios: [
    {
      name: 'shipped config (dry run)', start: 'Run manually',
      expect: { reached: ['Load sample Airtable records', 'Load sample backup log', 'STOP: dry run - sheet untouched', 'STOP: no alert posted'], outward: 'none' },
      check: out => {
        const flat = out['Flatten records into rows'][0];
        const cmp = out['Compare counts with last night'][0];
        const f: string[] = [];
        if (flat.rows.length !== 12) f.push(`expected 12 rows, got ${flat.rows.length}`);
        const c1 = flat.rows.find((r: any) => r['Record ID'] === 'recC1');
        if (c1?.Logo !== 'harbour.png (https://dl.airtable.example/harbour.png)') f.push(`attachment should flatten to name (url), got ${c1?.Logo}`);
        if (c1?.Owner !== 'Ana Ruiz' || c1?.Tags !== 'dental; retainer') f.push('collaborator and multi-select should flatten');
        if (flat.rows.find((r: any) => r['Record ID'] === 'recP4')?.Client !== 'recC5; recC1') f.push('linked records should join with ;');
        if (flat.rows.find((r: any) => r['Record ID'] === 'recC5')?.VIP !== 'TRUE') f.push('checkbox should be TRUE');
        if (cmp.alerts.length !== 2) f.push(`expected 2 alerts (Projects drop, Invoices truncated), got ${cmp.alerts.join(' | ')}`);
        if (!cmp.alerts[0]?.startsWith('Projects: 9 -> 4 rows (56%')) f.push(`Projects drop alert wrong: ${cmp.alerts[0]}`);
        if (cmp.tables.find((t: any) => t.table === 'Invoices')?.diff !== -97) f.push('Invoices fell from 100 to 3 but stays one truncation alert, not a drop');
        return f;
      },
    },
    {
      name: 'live backup with Slack alert', start: 'Every night at 02:00',
      overrides: { USE_AIRTABLE: true, AIRTABLE_BASE_ID: 'appEXAMPLE123', BACKUP_SHEET_ID: '1BackupSheetExample', DRY_RUN: false, SLACK_CHANNEL_ID: 'C0OPS', TABLES: ['Contacts'] },
      mocks: {
        'Fetch records from Airtable': [{ records: [{ id: 'recX1', createdTime: '2026-01-01T00:00:00.000Z', fields: { Name: 'Ivy Moss', Score: 7 } }] }],
        'Read the Backup log tab': [{ row_number: 2, Date: '2026-01-01', Table: 'Contacts', Rows: 40, Truncated: 'FALSE' }],
        'Upsert rows into the table tab': (items: any[]) => items,
        'Append to the Backup log': (items: any[]) => items,
        'Post the alert to Slack': [{ ok: true }],
      },
      expect: { reached: ['Upsert rows into the table tab', 'Append to the Backup log', 'Post the alert to Slack'], notReached: ['Load sample Airtable records'], outward: 'some' },
      check: out => {
        const f: string[] = [];
        if (out['Flatten records into rows'][0].rows[0]?.Table !== 'Contacts') f.push('table name should come from the table list by position');
        if (!out['Compare counts with last night'][0].alerts[0]?.startsWith('Contacts: 40 -> 1')) f.push('40 to 1 should alert');
        if (out['Shape the log rows'][0]?.Rows !== 1) f.push('log row should record 1');
        return f;
      },
    },
  ],
});
