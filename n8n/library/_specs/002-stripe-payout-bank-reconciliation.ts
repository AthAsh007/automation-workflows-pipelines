import { defineSpec } from '../_kit/spec';
import { trigger, code, ifTrue, ifWhen, merge, stop, http, sheets } from '../_kit/n';

const cfg = (k: string) => `$('config').first().json.${k}`;

export default defineSpec({
  slug: 'stripe-payout-bank-reconciliation',
  title: 'Reconcile Stripe payouts against bank transactions in Google Sheets',
  summary: 'Matches every Stripe payout from the last 35 days to a bank credit by amount and arrival window, flags missing, partial and duplicate matches, and writes one reconciliation row per payout to a Google Sheets tab.',
  category: 'Finance and billing',
  description: {
    who: 'Bookkeepers and founders who export bank transactions into Google Sheets and tick off Stripe payouts by hand at month end. It does the matching every Monday so the gaps show up within a week, not at close.',
    how: [
      'Every Monday at 07:00 it reads Stripe payouts that arrived in the last 35 days and the bank credits on your Bank tab, or sample data until both are connected.',
      'Each payout is matched to a bank line with the same amount (within 0.01) dated 0 to 3 days after the payout arrival date.',
      'A payout with two possible bank lines is marked duplicate, one with only a close amount is marked partial, and one with nothing after 5 days is marked missing.',
      'Bank lines that mention Stripe but match no payout are listed too, then every row is written to the Reconciliation tab, keyed by payout id.',
    ],
    setup: [
      'Run it once as imported. It reconciles sample data and stops at `STOP: dry run - sheet untouched`.',
      'Add a Stripe credential to `Fetch payouts from Stripe` and set `USE_STRIPE = true` in `config`.',
      'Connect Google Sheets, put the spreadsheet id in `BANK_SHEET_ID`, and check the column names in `BANK_COLUMNS` match your Bank tab.',
      'Read the preview in `Match payouts to bank lines`, then set `DRY_RUN = false` to write the Reconciliation tab.',
    ],
    requirements: ['A Stripe account that pays out to a bank account', 'A Google Sheet with your bank transactions', 'A Reconciliation tab with a payout_id column'],
    customize: [
      '`DATE_WINDOW_DAYS` and `AMOUNT_TOLERANCE` set how strict a match is.',
      '`PARTIAL_PCT` decides how close an amount must be to count as a partial match rather than missing.',
      '`BANK_DATE_FORMAT` handles bank exports that use DD/MM/YYYY or MM/DD/YYYY.',
    ],
  },
  config: {
    intro: ['USE_STRIPE false -> SAMPLE payouts. BANK_SHEET_ID blank -> SAMPLE bank lines.', 'DRY_RUN true -> the reconciliation is computed and shown, nothing is written.'],
    consts: [
      { name: 'USE_STRIPE', value: false, note: 'set true after adding the Stripe credential to the payouts node' },
      { name: 'BANK_SHEET_ID', value: '', note: 'Google Sheets id holding the Bank and Reconciliation tabs; blank uses sample bank lines' },
      { name: 'BANK_COLUMNS', value: { date: 'Date', description: 'Description', amount: 'Amount', reference: 'Reference' }, note: 'column headers on your Bank tab' },
      { name: 'BANK_DATE_FORMAT', value: 'YYYY-MM-DD', note: "how dates are written on the Bank tab: 'YYYY-MM-DD', 'DD/MM/YYYY' or 'MM/DD/YYYY'" },
      { name: 'LOOKBACK_DAYS', value: 35, note: 'payouts that arrived in this many days are checked' },
      { name: 'DATE_WINDOW_DAYS', value: 3, note: 'a bank line may land this many days after the payout arrival date' },
      { name: 'AMOUNT_TOLERANCE', value: 0.01, note: 'largest difference that still counts as the same amount (major units)' },
      { name: 'PARTIAL_PCT', value: 5, note: 'a bank line within this percent of the payout is a partial match' },
      { name: 'GRACE_DAYS', value: 5, note: 'an unmatched payout younger than this is pending, not missing' },
      { name: 'STRIPE_WORDS', value: ['stripe', 'strp'], note: 'words that mark a bank line as a Stripe deposit' },
    ],
    flags: { sheets_enabled: "BANK_SHEET_ID.trim() !== ''" },
    safety: 'dry_run',
  },
  nodes: [
    trigger.manual(),
    trigger.schedule('Every Monday at 07:00', '0 7 * * 1'),
    ifTrue('Stripe connected?', cfg('use_stripe')),
    http('Fetch payouts from Stripe', { url: 'https://api.stripe.com/v1/payouts', auth: 'stripeApi', query: { limit: '100', 'arrival_date[gte]': `={{ Math.floor(Date.now() / 1000) - ${cfg('lookback_days')} * 86400 }}` } }),
    code('Read Stripe payouts', `
// Stripe list response -> one item holding every payout in major units.
// Failed and canceled payouts never reach the bank, so they are kept but marked.
const payouts = [];
for (const page of $input.all()) {
  for (const p of page.json.data || []) {
    payouts.push({
      id: p.id, amount: (p.amount || 0) / 100, currency: (p.currency || 'usd').toUpperCase(),
      arrival_date: new Date(p.arrival_date * 1000).toISOString().slice(0, 10),
      status: p.status, descriptor: p.statement_descriptor || '',
    });
  }
}
return [{ json: { payouts } }];`),
    code('Load sample payouts', `
// Used until USE_STRIPE is true. Six payouts that cover every outcome the matcher has.
const day = n => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
return [{ json: { payouts: [
  { id: 'po_sample_1', amount: 4210.55, currency: 'USD', arrival_date: day(20), status: 'paid', descriptor: 'STRIPE' },
  { id: 'po_sample_2', amount: 1875.00, currency: 'USD', arrival_date: day(13), status: 'paid', descriptor: 'STRIPE' },
  { id: 'po_sample_3', amount: 960.40,  currency: 'USD', arrival_date: day(9),  status: 'paid', descriptor: 'STRIPE' },
  { id: 'po_sample_4', amount: 2300.00, currency: 'USD', arrival_date: day(8),  status: 'paid', descriptor: 'STRIPE' },
  { id: 'po_sample_5', amount: 512.75,  currency: 'USD', arrival_date: day(2),  status: 'in_transit', descriptor: 'STRIPE' },
  { id: 'po_sample_6', amount: 330.00,  currency: 'USD', arrival_date: day(11), status: 'failed', descriptor: 'STRIPE' },
] } }];`),
    merge('Combine payout sources'),
    ifTrue('Bank sheet set?', cfg('sheets_enabled')),
    sheets.read('Read bank transactions', cfg('bank_sheet_id'), 'Bank'),
    code('Read bank rows', `
// Sheet rows -> one item of normalised bank lines. Amounts like "$1,875.00" or
// "(42.10)" are parsed; the date is read in BANK_DATE_FORMAT.
const cfg = $('config').first().json;
const col = cfg.bank_columns;
const toNum = v => {
  if (typeof v === 'number') return v;
  const s = String(v || '').trim();
  const neg = /^\\(.*\\)$/.test(s) || s.startsWith('-');
  const n = Number(s.replace(/[^0-9.]/g, ''));
  return neg ? -n : n;
};
const toDate = v => {
  const s = String(v || '').trim();
  const m = s.match(/^(\\d{1,4})[\\/.-](\\d{1,2})[\\/.-](\\d{1,4})$/);
  if (!m) return null;
  const [a, b, c] = m.slice(1).map(Number);
  const [y, mo, d] = cfg.bank_date_format === 'DD/MM/YYYY' ? [c, b, a] : cfg.bank_date_format === 'MM/DD/YYYY' ? [c, a, b] : [a, b, c];
  return new Date(Date.UTC(y, mo - 1, d)).toISOString().slice(0, 10);
};
const bank = $input.all().map(({ json: r }, i) => ({
  row: r.row_number || i + 2, date: toDate(r[col.date]), description: String(r[col.description] || ''),
  amount: toNum(r[col.amount]), reference: String(r[col.reference] || ''),
})).filter(b => b.date && b.amount > 0);
return [{ json: { bank } }];`),
    code('Load sample bank lines', `
// Used until BANK_SHEET_ID is set. Credits only; one is doubled, one is short, one is orphaned.
const day = n => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
return [{ json: { bank: [
  { row: 2, date: day(19), description: 'STRIPE TRANSFER ST-K2L9', amount: 4210.55, reference: 'ST-K2L9' },
  { row: 3, date: day(12), description: 'STRIPE TRANSFER ST-P4Q1', amount: 1875.00, reference: 'ST-P4Q1' },
  { row: 4, date: day(11), description: 'STRIPE TRANSFER ST-P4Q1', amount: 1875.00, reference: 'ST-P4Q1' },
  { row: 5, date: day(8),  description: 'STRIPE TRANSFER ST-W7E3', amount: 948.20,  reference: 'ST-W7E3' },
  { row: 6, date: day(15), description: 'CLIENT PAYMENT NORTHFIELD STUDIO', amount: 2300.00, reference: 'INV-1038' },
  { row: 7, date: day(4),  description: 'STRIPE TRANSFER ST-Z0X8', amount: 120.00,  reference: 'ST-Z0X8' },
] } }];`),
    merge('Combine bank sources'),
    code('Match payouts to bank lines', `
// Exact match first (amount within AMOUNT_TOLERANCE, bank date 0..DATE_WINDOW_DAYS
// after arrival). A bank line can satisfy only one payout. Anything without an
// exact match is tried as partial, then aged into pending or missing.
const cfg = $('config').first().json;
const payouts = $('Combine payout sources').first().json.payouts;
const bank = $input.first().json.bank;
const words = cfg.stripe_words.map(w => w.toLowerCase());
const isStripe = b => words.some(w => (b.description + ' ' + b.reference).toLowerCase().includes(w));
const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 864e5);
const today = new Date().toISOString().slice(0, 10);
const claimed = new Set();
const rows = [];
const inWindow = (p, b) => { const d = daysBetween(p.arrival_date, b.date); return d >= 0 && d <= cfg.date_window_days; };

for (const p of [...payouts].sort((a, b) => a.arrival_date.localeCompare(b.arrival_date))) {
  const base = { payout_id: p.id, arrival_date: p.arrival_date, payout_amount: p.amount, currency: p.currency };
  if (p.status === 'failed' || p.status === 'canceled') {
    rows.push({ ...base, status: 'not expected', bank_row: '', bank_amount: '', difference: '', note: 'payout ' + p.status + ' in Stripe' });
    continue;
  }
  const exact = bank.filter(b => !claimed.has(b.row) && inWindow(p, b) && Math.abs(b.amount - p.amount) <= cfg.amount_tolerance);
  if (exact.length === 1) {
    claimed.add(exact[0].row);
    rows.push({ ...base, status: 'matched', bank_row: exact[0].row, bank_amount: exact[0].amount, difference: 0, note: '' });
    continue;
  }
  if (exact.length > 1) {
    exact.forEach(b => claimed.add(b.row));
    rows.push({ ...base, status: 'duplicate', bank_row: exact.map(b => b.row).join(', '), bank_amount: exact[0].amount, difference: 0,
      note: exact.length + ' bank lines match; check for a double import' });
    continue;
  }
  const near = bank.filter(b => !claimed.has(b.row) && inWindow(p, b) && isStripe(b)
    && Math.abs(b.amount - p.amount) / p.amount * 100 <= cfg.partial_pct)
    .sort((a, b) => Math.abs(a.amount - p.amount) - Math.abs(b.amount - p.amount));
  if (near.length) {
    claimed.add(near[0].row);
    const diff = Math.round((near[0].amount - p.amount) * 100) / 100;
    rows.push({ ...base, status: 'partial', bank_row: near[0].row, bank_amount: near[0].amount, difference: diff,
      note: 'bank shows ' + (diff < 0 ? 'less' : 'more') + ' than Stripe by ' + Math.abs(diff).toFixed(2) });
    continue;
  }
  const age = daysBetween(p.arrival_date, today);
  rows.push({ ...base, status: age < cfg.grace_days ? 'pending' : 'missing', bank_row: '', bank_amount: '', difference: '',
    note: age < cfg.grace_days ? 'arrived ' + age + ' days ago, inside GRACE_DAYS' : 'no bank line ' + age + ' days after arrival' });
}
for (const b of bank.filter(b => !claimed.has(b.row) && isStripe(b))) {
  rows.push({ payout_id: 'bank-row-' + b.row, arrival_date: b.date, payout_amount: '', currency: '', status: 'bank only',
    bank_row: b.row, bank_amount: b.amount, difference: '', note: 'Stripe deposit on the bank with no payout in the window' });
}
const counts = rows.reduce((m, r) => ({ ...m, [r.status]: (m[r.status] || 0) + 1 }), {});
return rows.map(r => ({ json: { ...r, checked_at: cfg.run_started_at, _counts: counts } }));`),
    ifWhen('Write to the sheet?', [[cfg('live'), 'true'], [cfg('sheets_enabled'), 'true']]),
    stop('STOP: dry run - sheet untouched'),
    sheets.upsert('Write Reconciliation tab', cfg('bank_sheet_id'), 'Reconciliation', 'payout_id'),
    code('Summarise the reconciliation', `
// One readable summary of the run for the execution log, whatever mode it ran in.
const cfg = $('config').first().json;
const rows = $('Match payouts to bank lines').all().map(i => i.json);
const counts = rows[0]?._counts || {};
const problems = rows.filter(r => ['missing', 'partial', 'duplicate', 'bank only'].includes(r.status));
const text = [
  'Stripe payout reconciliation (' + cfg.mode + ')',
  Object.entries(counts).map(([k, v]) => v + ' ' + k).join(', '),
  ...problems.map(r => '- ' + r.payout_id + ': ' + r.status + (r.note ? ' (' + r.note + ')' : '')),
].join('\\n');
return [{ json: { text, problems: problems.length, counts } }];`),
  ],
  edges: [
    ['Run manually', 'config'], ['Every Monday at 07:00', 'config'],
    ['config', 'Stripe connected?'],
    ['Stripe connected?', 0, 'Fetch payouts from Stripe'], ['Stripe connected?', 1, 'Load sample payouts'],
    ['Fetch payouts from Stripe', 'Read Stripe payouts'],
    ['Read Stripe payouts', 'Combine payout sources'], ['Load sample payouts', 0, 'Combine payout sources', 1],
    ['Combine payout sources', 'Bank sheet set?'],
    ['Bank sheet set?', 0, 'Read bank transactions'], ['Bank sheet set?', 1, 'Load sample bank lines'],
    ['Read bank transactions', 'Read bank rows'],
    ['Read bank rows', 'Combine bank sources'], ['Load sample bank lines', 0, 'Combine bank sources', 1],
    ['Combine bank sources', 'Match payouts to bank lines'],
    ['Match payouts to bank lines', 'Write to the sheet?'],
    ['Match payouts to bank lines', 'Summarise the reconciliation'],
    ['Write to the sheet?', 0, 'Write Reconciliation tab'], ['Write to the sheet?', 1, 'STOP: dry run - sheet untouched'],
  ],
  groups: [
    { title: 'Start and settings', why: 'Runs every Monday at 07:00 or by hand. Match rules, column names and the date format all live in `config`, so a different bank export only means editing one node.', nodes: ['Run manually', 'Every Monday at 07:00', 'config'] },
    { title: 'Read Stripe payouts', why: '`Stripe connected?` reads payouts that arrived inside `LOOKBACK_DAYS`. Until `USE_STRIPE` is true, `Load sample payouts` feeds the same single item, so the matcher can be checked before a credential exists.', nodes: ['Stripe connected?', 'Fetch payouts from Stripe', 'Read Stripe payouts', 'Load sample payouts', 'Combine payout sources'] },
    { title: 'Read bank lines', why: '`Read bank rows` parses money strings and three date formats and drops debits, because only credits can be payouts. A blank `BANK_SHEET_ID` routes to `Load sample bank lines` instead.', nodes: ['Bank sheet set?', 'Read bank transactions', 'Read bank rows', 'Load sample bank lines', 'Combine bank sources'] },
    { title: 'Match, write and summarise', why: 'A bank line is claimed by one payout only, so a double import shows as duplicate rather than two clean matches. `Write to the sheet?` needs both a live run and a sheet id; the summary is built either way.', nodes: ['Match payouts to bank lines', 'Write to the sheet?', 'STOP: dry run - sheet untouched', 'Write Reconciliation tab', 'Summarise the reconciliation'] },
  ],
  scenarios: [
    {
      name: 'shipped config (dry run)', start: 'Run manually',
      expect: { reached: ['Load sample payouts', 'Load sample bank lines', 'STOP: dry run - sheet untouched', 'Summarise the reconciliation'], outward: 'none' },
      check: out => {
        const rows = out['Match payouts to bank lines'];
        const by = (id: string) => rows.find((r: any) => r.payout_id === id)?.status;
        const f: string[] = [];
        const want: Record<string, string> = { po_sample_1: 'matched', po_sample_2: 'duplicate', po_sample_3: 'partial', po_sample_4: 'missing', po_sample_5: 'pending', po_sample_6: 'not expected', 'bank-row-7': 'bank only' };
        for (const [id, st] of Object.entries(want)) if (by(id) !== st) f.push(`${id} should be ${st}, got ${by(id)}`);
        const partial = rows.find((r: any) => r.payout_id === 'po_sample_3');
        if (partial?.difference !== -12.2) f.push(`partial difference should be -12.2, got ${partial?.difference}`);
        if (rows.some((r: any) => r.bank_row === 6)) f.push('non-Stripe client payment must not be claimed');
        if (out['Summarise the reconciliation'][0].problems !== 4) f.push('summary should list 4 problems');
        return f;
      },
    },
    {
      name: 'live write with Stripe and the bank sheet', start: 'Every Monday at 07:00',
      overrides: { USE_STRIPE: true, BANK_SHEET_ID: '1AbCdEfGhIjKlMnOp', DRY_RUN: false, BANK_DATE_FORMAT: 'DD/MM/YYYY' },
      mocks: {
        'Fetch payouts from Stripe': [{ object: 'list', has_more: false, data: [
          { id: 'po_1Live', object: 'payout', amount: 125000, currency: 'gbp', arrival_date: Math.floor(Date.now() / 1000) - 6 * 86400, status: 'paid', statement_descriptor: 'STRIPE' },
          { id: 'po_2Live', object: 'payout', amount: 40000, currency: 'gbp', arrival_date: Math.floor(Date.now() / 1000) - 10 * 86400, status: 'paid', statement_descriptor: 'STRIPE' },
        ] }],
        'Read bank transactions': () => {
          const d = new Date(Date.now() - 5 * 864e5);
          const s = String(d.getUTCDate()).padStart(2, '0') + '/' + String(d.getUTCMonth() + 1).padStart(2, '0') + '/' + d.getUTCFullYear();
          return [{ row_number: 2, Date: s, Description: 'STRIPE PAYMENTS UK', Amount: '£1,250.00', Reference: 'STRP-88' },
                  { row_number: 3, Date: s, Description: 'CARD FEE', Amount: '(4.50)', Reference: '' }];
        },
        'Write Reconciliation tab': (items: any[]) => items,
      },
      expect: { reached: ['Read bank rows', 'Write Reconciliation tab'], notReached: ['Load sample payouts', 'STOP: dry run - sheet untouched'], outward: 'some' },
      check: out => {
        const rows = out['Match payouts to bank lines'];
        const f: string[] = [];
        if (rows.find((r: any) => r.payout_id === 'po_1Live')?.status !== 'matched') f.push('po_1Live should match the DD/MM/YYYY bank line');
        if (rows.find((r: any) => r.payout_id === 'po_2Live')?.status !== 'missing') f.push('po_2Live should be missing');
        if (out['Read bank rows'][0].bank.length !== 1) f.push('the debit fee line should be dropped');
        return f;
      },
    },
  ],
});
