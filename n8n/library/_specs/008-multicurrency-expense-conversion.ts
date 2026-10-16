import { defineSpec } from '../_kit/spec';
import { trigger, code, ifTrue, ifWhen, merge, stop, http, sheets } from '../_kit/n';

const cfg = (k: string) => `$('config').first().json.${k}`;

const ratesMock = (ageHours = 3) => [{
  result: 'success', provider: 'https://www.exchangerate-api.com', base_code: 'USD',
  time_last_update_unix: Math.floor(Date.now() / 1000) - ageHours * 3600,
  time_last_update_utc: new Date(Date.now() - ageHours * 3600e3).toUTCString(),
  rates: { USD: 1, EUR: 0.8, GBP: 0.75, JPY: 150, CAD: 1.25, INR: 80, AUD: 1.6 },
}];

export default defineSpec({
  slug: 'multicurrency-expense-conversion',
  title: 'Convert multi-currency expenses in Google Sheets with daily exchange rates',
  summary: 'Fetches the day\'s exchange rates from the free open.er-api.com feed, converts every expense row in a Google Sheet to your base currency, and flags unknown currencies, stale rates and old expenses converted at today\'s rate.',
  category: 'Finance and billing',
  description: {
    who: 'Teams that log travel and supplier expenses in several currencies in one Google Sheet and need a single base-currency total for budgets or reimbursement. It fills the converted columns every morning so nobody looks rates up by hand.',
    how: [
      'Every day at 06:30 it fetches the latest rates for `BASE_CURRENCY` from open.er-api.com, which needs no API key.',
      'If the feed fails, or its rates are more than 36 hours old, the run stops before touching the sheet.',
      'Each expense row is converted to the base currency. Symbols such as € and £ are mapped to ISO codes, and rows already converted at the same rate are skipped.',
      'Unknown currencies, missing amounts and expenses more than 7 days older than the rate are flagged in an FX status column, then the rows are updated by ID.',
    ],
    setup: [
      'Run it once as imported. It fetches live rates, converts sample rows and stops at `STOP: dry run - sheet untouched`.',
      'Connect Google Sheets and put the spreadsheet id in `EXPENSE_SHEET_ID`. The Expenses tab needs ID, Date, Amount and Currency columns.',
      'Set `BASE_CURRENCY` to the currency your books are kept in.',
      'Check the output of `Convert each expense`, then set `DRY_RUN = false` to write the converted columns.',
    ],
    requirements: ['A Google Sheet with an Expenses tab', 'No exchange-rate account; the open.er-api.com feed is free'],
    customize: [
      '`SYMBOL_MAP` decides what a bare symbol such as $ means in your sheet.',
      '`MAX_RATE_AGE_HOURS` and `DATE_GAP_DAYS` control the stale-rate flags.',
      '`DECIMALS` sets rounding of the converted amount.',
    ],
  },
  config: {
    intro: ['EXPENSE_SHEET_ID blank -> SAMPLE expense rows. Rates are always fetched live (public, no key).', 'DRY_RUN true -> conversions are computed and shown, nothing is written.'],
    consts: [
      { name: 'EXPENSE_SHEET_ID', value: '', note: 'Google Sheets id with an Expenses tab; blank uses sample rows' },
      { name: 'BASE_CURRENCY', value: 'USD', note: 'ISO code every expense is converted into' },
      { name: 'SYMBOL_MAP', value: { '$': 'USD', '€': 'EUR', '£': 'GBP', '¥': 'JPY', '₹': 'INR', 'C$': 'CAD', 'A$': 'AUD' }, note: 'symbols found in the Currency column and the code they mean' },
      { name: 'MAX_RATE_AGE_HOURS', value: 36, note: 'rates older than this stop the run' },
      { name: 'DATE_GAP_DAYS', value: 7, note: 'expenses older than this, converted at today\'s rate, are marked approximate' },
      { name: 'DECIMALS', value: 2, note: 'rounding of the converted amount' },
    ],
    flags: { sheets_enabled: "EXPENSE_SHEET_ID.trim() !== ''" },
    safety: 'dry_run',
  },
  nodes: [
    trigger.manual(),
    trigger.schedule('Every day at 06:30', '30 6 * * *'),
    http('Fetch exchange rates', { url: `={{ 'https://open.er-api.com/v6/latest/' + ${cfg('base_currency')} }}`, auth: 'none' }),
    code('Check the rates', `
// The feed updates once a day. A failed call or a stale timestamp stops the run,
// because writing yesterday's numbers as today's is worse than writing nothing.
const cfg = $('config').first().json;
const r = $input.first().json;
const ok = r.result === 'success' && r.rates && r.base_code === cfg.base_currency;
const ageHours = ok ? (Date.now() / 1000 - r.time_last_update_unix) / 3600 : null;
const fresh = ok && ageHours <= cfg.max_rate_age_hours;
return [{ json: { usable: Boolean(fresh), rates: ok ? r.rates : {}, rate_date: ok ? new Date(r.time_last_update_unix * 1000).toISOString().slice(0, 10) : '',
  age_hours: ageHours === null ? null : Math.round(ageHours), problem: !ok ? 'feed error: ' + (r['error-type'] || r.result || 'no response') : !fresh ? 'rates are ' + Math.round(ageHours) + 'h old' : '' } }];`),
    ifTrue('Rates usable?', '$json.usable'),
    stop('STOP: rates unavailable - nothing converted'),
    ifTrue('Expense sheet set?', cfg('sheets_enabled')),
    sheets.read('Read the Expenses tab', cfg('expense_sheet_id'), 'Expenses'),
    code('Collect expense rows', `
// Sheet rows -> one item, matching the sample shape.
return [{ json: { rows: $input.all().map(i => i.json) } }];`),
    code('Load sample expenses', `
// Used until EXPENSE_SHEET_ID is set. Symbols, codes, a typo and an old receipt.
const day = n => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
return [{ json: { rows: [
  { ID: 'EXP-101', Date: day(1), Description: 'Hotel, Lisbon', Amount: '412.00', Currency: '€' },
  { ID: 'EXP-102', Date: day(2), Description: 'Train, London', Amount: '86.40', Currency: 'GBP' },
  { ID: 'EXP-103', Date: day(3), Description: 'Client dinner, Tokyo', Amount: '18,600', Currency: 'JPY' },
  { ID: 'EXP-104', Date: day(20), Description: 'Conference ticket', Amount: '799', Currency: 'C$' },
  { ID: 'EXP-105', Date: day(2), Description: 'Taxi, Pune', Amount: '1450', Currency: 'IRN' },
  { ID: 'EXP-106', Date: day(1), Description: 'Office snacks', Amount: '42.10', Currency: 'USD' },
  { ID: 'EXP-107', Date: day(4), Description: 'Parking', Amount: '', Currency: 'EUR' },
  { ID: 'EXP-108', Date: day(5), Description: 'Software licence', Amount: '120', Currency: 'EUR', 'Base amount': 150, Rate: 0.8 },
] } }];`),
    merge('Combine expense sources'),
    code('Convert each expense', `
// amount_in_base = amount / rate, where rate is units of that currency per 1 base.
// A row already holding the same rate is left alone so re-runs write nothing new.
const cfg = $('config').first().json;
const { rates, rate_date } = $('Check the rates').first().json;
const base = cfg.base_currency;
const f = 10 ** cfg.decimals;
// "1.200,50" and "1,200.50" both mean 1200.5: the last separator is the decimal one.
const toNum = v => {
  let s = String(v ?? '').replace(/[^0-9.,-]/g, '');
  if (!s) return null;
  const lc = s.lastIndexOf(','), ld = s.lastIndexOf('.');
  if (lc > -1 && ld > -1) s = lc > ld ? s.replace(/\\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (lc > -1) s = /,\\d{3}$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
  const n = Number(s); return Number.isFinite(n) ? n : null;
};
const out = [], tally = {};
for (const r of $input.first().json.rows) {
  const raw = String(r.Currency || '').trim();
  const code = (cfg.symbol_map[raw] || raw).toUpperCase();
  const amount = toNum(r.Amount);
  const rate = rates[code];
  let status, converted = '';
  if (amount === null) status = 'missing amount';
  else if (!rate) status = 'unknown currency "' + raw + '"';
  else {
    if (Number(r.Rate) === rate && r['Base amount'] !== '' && r['Base amount'] !== undefined) { tally['already converted'] = (tally['already converted'] || 0) + 1; continue; }
    converted = Math.round(amount / rate * f) / f;
    const gap = Math.round((new Date(rate_date) - new Date(String(r.Date).slice(0, 10))) / 864e5);
    status = code === base ? 'base currency' : gap > cfg.date_gap_days ? 'approximate: rate is ' + gap + ' days newer than expense' : 'converted';
  }
  const key = status.split(':')[0].split(' "')[0];
  tally[key] = (tally[key] || 0) + 1;
  out.push({ json: { ID: r.ID, Currency: code || raw, 'Base amount': converted, 'Base currency': base, Rate: rate || '', 'Rate date': rate_date, 'FX status': status } });
}
if (out.length) out[0].json._tally = tally;
return out;`),
    ifWhen('Write to the sheet?', [[cfg('live'), 'true'], [cfg('sheets_enabled'), 'true']]),
    stop('STOP: dry run - sheet untouched'),
    code('Drop helper fields', `
// Only the columns that belong on the sheet go to the update.
return $input.all().map(({ json }) => { const { _tally, ...row } = json; return { json: row }; });`),
    sheets.update('Update the Expenses tab', cfg('expense_sheet_id'), 'Expenses', 'ID'),
  ],
  edges: [
    ['Run manually', 'config'], ['Every day at 06:30', 'config'],
    ['config', 'Fetch exchange rates'],
    ['Fetch exchange rates', 'Check the rates'],
    ['Check the rates', 'Rates usable?'],
    ['Rates usable?', 0, 'Expense sheet set?'], ['Rates usable?', 1, 'STOP: rates unavailable - nothing converted'],
    ['Expense sheet set?', 0, 'Read the Expenses tab'], ['Expense sheet set?', 1, 'Load sample expenses'],
    ['Read the Expenses tab', 'Collect expense rows'],
    ['Collect expense rows', 'Combine expense sources'], ['Load sample expenses', 0, 'Combine expense sources', 1],
    ['Combine expense sources', 'Convert each expense'],
    ['Convert each expense', 'Write to the sheet?'],
    ['Write to the sheet?', 0, 'Drop helper fields'], ['Write to the sheet?', 1, 'STOP: dry run - sheet untouched'],
    ['Drop helper fields', 'Update the Expenses tab'],
  ],
  groups: [
    { title: 'Start and settings', why: 'Runs at 06:30, after the free feed has published the day\'s rates. Base currency, symbol meanings and staleness limits live in `config`.', nodes: ['Run manually', 'Every day at 06:30', 'config'] },
    { title: 'Get rates and stop if stale', why: '`Fetch exchange rates` is a public call with no key. `Check the rates` fails closed: a feed error or a timestamp past `MAX_RATE_AGE_HOURS` ends the run before any row is read.', nodes: ['Fetch exchange rates', 'Check the rates', 'Rates usable?', 'STOP: rates unavailable - nothing converted'] },
    { title: 'Read expense rows', why: 'The sheet is read once, after the rates pass, and collected into one item. `Load sample expenses` stands in until `EXPENSE_SHEET_ID` is set.', nodes: ['Expense sheet set?', 'Read the Expenses tab', 'Collect expense rows', 'Load sample expenses', 'Combine expense sources'] },
    { title: 'Convert and write', why: 'Rows already holding today\'s rate are skipped, so re-runs make no changes. Bad rows are still written with a reason in FX status, so they show up on the sheet rather than vanishing.', nodes: ['Convert each expense', 'Write to the sheet?', 'STOP: dry run - sheet untouched', 'Drop helper fields', 'Update the Expenses tab'] },
  ],
  scenarios: [
    {
      name: 'shipped config (dry run)', start: 'Run manually',
      mocks: { 'Fetch exchange rates': ratesMock(3) },
      expect: { reached: ['Load sample expenses', 'STOP: dry run - sheet untouched'], outward: 'none' },
      check: out => {
        const rows = out['Convert each expense'];
        const by = (id: string) => rows.find((r: any) => r.ID === id);
        const f: string[] = [];
        if (rows.length !== 7) f.push(`already-converted row should be skipped, got ${rows.length} rows`);
        if (by('EXP-101')?.['Base amount'] !== 515 || by('EXP-101')?.Currency !== 'EUR') f.push(`EUR symbol conversion wrong: ${JSON.stringify(by('EXP-101'))}`);
        if (by('EXP-102')?.['Base amount'] !== 115.2) f.push('GBP conversion wrong');
        if (by('EXP-103')?.['Base amount'] !== 124) f.push(`JPY with thousands comma wrong: ${by('EXP-103')?.['Base amount']}`);
        if (!String(by('EXP-104')?.['FX status']).startsWith('approximate')) f.push('20-day-old expense should be approximate');
        if (!String(by('EXP-105')?.['FX status']).startsWith('unknown currency')) f.push('IRN typo should be unknown currency');
        if (by('EXP-106')?.['FX status'] !== 'base currency') f.push('USD row should be base currency');
        if (by('EXP-107')?.['FX status'] !== 'missing amount') f.push('blank amount should be flagged');
        return f;
      },
    },
    {
      name: 'stale feed stops the run', start: 'Every day at 06:30',
      mocks: { 'Fetch exchange rates': ratesMock(50) },
      expect: { reached: ['STOP: rates unavailable - nothing converted'], notReached: ['Expense sheet set?'], outward: 'none' },
      check: out => out['Check the rates'][0].problem === 'rates are 50h old' ? [] : [`problem should name the age, got ${out['Check the rates'][0].problem}`],
    },
    {
      name: 'live write to the sheet', start: 'Every day at 06:30',
      overrides: { EXPENSE_SHEET_ID: '1FxSheet', DRY_RUN: false },
      mocks: {
        'Fetch exchange rates': ratesMock(1),
        'Read the Expenses tab': [{ row_number: 2, ID: 'E-1', Date: new Date().toISOString().slice(0, 10), Description: 'Flight', Amount: '1.200,50', Currency: 'eur' }],
        'Update the Expenses tab': (items: any[]) => items,
      },
      expect: { reached: ['Collect expense rows', 'Update the Expenses tab'], notReached: ['Load sample expenses'], outward: 'some' },
      check: out => {
        const r = out['Drop helper fields'][0];
        const f: string[] = [];
        if (r?.['Base amount'] !== 1500.63) f.push(`1.200,50 EUR should be 1500.63 USD, got ${r?.['Base amount']}`);
        if ('_tally' in (r || {})) f.push('helper field leaked into the sheet');
        return f;
      },
    },
  ],
});
