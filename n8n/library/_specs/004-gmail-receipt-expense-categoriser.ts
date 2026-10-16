import { defineSpec } from '../_kit/spec';
import { trigger, code, ifTrue, ifWhen, merge, stop, sheets, aiAgent } from '../_kit/n';

const cfg = (k: string) => `$('config').first().json.${k}`;

export default defineSpec({
  slug: 'gmail-receipt-expense-categoriser',
  title: 'Categorise emailed receipts into Google Sheets expense rows with OpenAI',
  summary: 'Reads receipt emails from Gmail, pulls vendor, amount, currency and date out with rules, picks a category with OpenAI or a keyword table, flags rows with missing fields and writes each receipt once to an Expenses sheet.',
  category: 'Finance and billing',
  description: {
    who: 'Freelancers and small teams whose receipts arrive by email and get typed into an expenses sheet once a quarter. Each receipt becomes a row within a minute of landing in Gmail.',
    how: [
      'Gmail is polled every minute for unread mail matching `subject:(receipt OR invoice)`. A manual run uses five sample receipts instead.',
      'Rules read the vendor from the sender, the total from lines like "Total paid" or "Amount charged", the currency from the symbol or ISO code, and the receipt date from the body or the email header.',
      'A category comes from OpenAI when `USE_OPENAI` is true, otherwise from the keyword table in `config`. An AI answer outside your category list falls back to the keyword match.',
      'Rows missing an amount or a vendor are marked needs review. Rows are written to the Expenses tab keyed by Gmail message id, so a re-run never adds a second row.',
    ],
    setup: [
      'Run it once as imported from `Run manually`. It parses the samples and stops at `STOP: dry run - nothing written`.',
      'Connect Gmail on `New receipt in Gmail` and adjust its search query to match your receipts.',
      'Connect Google Sheets and put the spreadsheet id in `EXPENSE_SHEET_ID`. The Expenses tab needs a message_id column.',
      'Optional: add an OpenAI credential to `Pick a category with OpenAI` and set `USE_OPENAI = true`. Set `DRY_RUN = false` to start writing rows.',
    ],
    requirements: ['A Gmail account that receives receipts', 'A Google Sheet with an Expenses tab', 'Optional: an OpenAI API key'],
    customize: [
      '`CATEGORY_KEYWORDS` maps each category to the words that select it.',
      '`DEFAULT_CURRENCY` is used when a receipt shows only a bare number.',
      '`REVIEW_ABOVE` marks any receipt above that amount for a second look.',
    ],
  },
  config: {
    intro: ['A manual run uses SAMPLE receipts. The Gmail trigger feeds real ones.', 'USE_OPENAI false -> categories come from CATEGORY_KEYWORDS only.'],
    consts: [
      { name: 'EXPENSE_SHEET_ID', value: '', note: 'Google Sheets id holding the Expenses tab; blank means nothing is written' },
      { name: 'USE_OPENAI', value: false, note: 'set true after adding the OpenAI credential to the categoriser' },
      { name: 'CATEGORY_KEYWORDS', value: {
        Software: ['subscription', 'license', 'saas', 'hosting', 'cloud', 'domain', 'plan'],
        Travel: ['taxi', 'cab', 'flight', 'airline', 'hotel', 'rail', 'train', 'parking'],
        Meals: ['restaurant', 'bistro', 'cafe', 'coffee', 'lunch', 'dinner', 'catering'],
        Office: ['stationery', 'paper', 'printer', 'ink', 'desk', 'chair'],
        Advertising: ['ads', 'campaign', 'sponsored', 'promotion'],
      }, note: 'category -> words that select it; the first category with a hit wins' },
      { name: 'DEFAULT_CURRENCY', value: 'USD', note: 'used when a receipt shows no currency symbol or code' },
      { name: 'REVIEW_ABOVE', value: 1000, note: 'receipts above this amount are marked needs review' },
    ],
    flags: { sheets_enabled: "EXPENSE_SHEET_ID.trim() !== ''" },
    safety: 'dry_run',
  },
  nodes: [
    trigger.manual(),
    trigger.gmail('New receipt in Gmail', 'subject:(receipt OR invoice OR "order confirmation") newer_than:2d'),
    code('Pick up the trigger email', `
// The Gmail trigger and the manual run share one path. When Gmail started the run
// its messages are passed on; a manual run gets an empty list and uses the samples.
let messages = [];
try { messages = $('New receipt in Gmail').all().map(i => i.json); } catch (e) { messages = []; }
return [{ json: { from_gmail: messages.length > 0, messages } }];`),
    ifTrue('Started by Gmail?', '$json.from_gmail'),
    code('Read receipt emails', `
// Gmail (simple: false) -> the fields the parser reads. Plain text is preferred over HTML.
return $input.first().json.messages.map(m => ({ json: {
  message_id: m.id, from_name: m.from?.value?.[0]?.name || '', from_address: m.from?.value?.[0]?.address || '',
  subject: m.subject || '', email_date: m.date || '',
  text: m.text || String(m.html || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' '),
} }));`),
    code('Load sample receipts', `
// Used on a manual run. Covers a decimal comma, a missing total and a duplicate message.
const day = n => new Date(Date.now() - n * 864e5).toISOString();
return [
  { message_id: '18f0a1', from_name: 'Pixelpond Billing', from_address: 'billing@pixelpond.example', subject: 'Your receipt from Pixelpond', email_date: day(1),
    text: 'Thanks for your payment.\\nPlan: Team subscription (annual)\\nDate: ' + day(1).slice(0, 10) + '\\nSubtotal $240.00\\nTax $19.20\\nTotal paid: $259.20' },
  { message_id: '18f0a2', from_name: 'MetroCab', from_address: 'no-reply@metrocab.example', subject: 'Trip receipt', email_date: day(2),
    text: 'Your ride on ' + day(2).slice(0, 10) + '\\nTaxi fare 31,50\\nAmount charged: EUR 34,65' },
  { message_id: '18f0a3', from_name: '', from_address: 'orders@cornerbistro.example', subject: 'Order confirmation #5521', email_date: day(3),
    text: 'Corner Bistro, catering for 12\\nGrand total: £186.00' },
  { message_id: '18f0a4', from_name: 'Northgate Supplies', from_address: 'hello@northgate.example', subject: 'Invoice 7731', email_date: day(4),
    text: 'Invoice 7731\\nItems: printer paper, ink\\nPlease see attached PDF.' },
  { message_id: '18f0a1', from_name: 'Pixelpond Billing', from_address: 'billing@pixelpond.example', subject: 'Fwd: Your receipt from Pixelpond', email_date: day(1),
    text: 'Forwarded copy. Total paid: $259.20' },
].map(json => ({ json }));`),
    merge('Combine receipt sources'),
    code('Extract receipt fields', `
// Rules, not a model: the total comes from the highest-priority label found, so
// "Subtotal" never wins over "Total paid". Message ids already seen are dropped.
const cfg = $('config').first().json;
const seen = new Set(($getWorkflowStaticData('global').seen_ids || []));
const SYM = { '$': 'USD', '€': 'EUR', '£': 'GBP', '¥': 'JPY', '₹': 'INR' };
const LABELS = ['grand total', 'total paid', 'amount paid', 'amount charged', 'total charged', 'total due', 'amount due', 'total'];
const num = s => {
  let t = s.replace(/[^0-9.,]/g, '');
  if (/,\\d{2}$/.test(t)) t = t.replace(/\\./g, '').replace(',', '.'); else t = t.replace(/,/g, '');
  const n = Number(t); return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
};
const findAmount = text => {
  const lines = text.split(/\\n/);
  for (const label of LABELS) {
    for (const line of lines) {
      const low = line.toLowerCase();
      const at = low.indexOf(label);
      if (at < 0 || (label === 'total' && /sub\\s*total/.test(low))) continue;
      const m = line.slice(at + label.length).match(/([A-Z]{3})?\\s*([$€£¥₹])?\\s*([0-9][0-9.,]*)\\s*([A-Z]{3})?/);
      if (m && num(m[3])) return { amount: num(m[3]), currency: m[1] || m[4] || SYM[m[2]] || '', label };
    }
  }
  return { amount: null, currency: '', label: '' };
};
const findDate = (text, fallback) => {
  const iso = text.match(/(20\\d{2})-(\\d{2})-(\\d{2})/);
  if (iso) return { date: iso[0], date_source: 'body' };
  return { date: fallback ? new Date(fallback).toISOString().slice(0, 10) : '', date_source: fallback ? 'email header' : '' };
};
const vendorOf = r => {
  const name = r.from_name.replace(/\\b(billing|receipts?|payments?|no-?reply|team|invoices?)\\b/gi, '').trim();
  if (name) return name;
  const host = (r.from_address.split('@')[1] || '').split('.')[0];
  return host ? host.charAt(0).toUpperCase() + host.slice(1) : '';
};
const kw = cfg.category_keywords;
const out = [], skipped = [];
for (const { json: r } of $input.all()) {
  if (seen.has(r.message_id)) { skipped.push({ message_id: r.message_id, reason: 'already processed' }); continue; }
  seen.add(r.message_id);
  const a = findAmount(r.text);
  const d = findDate(r.text, r.email_date);
  const vendor = vendorOf(r);
  const hay = (vendor + ' ' + r.subject + ' ' + r.text).toLowerCase();
  const keyword_category = Object.keys(kw).find(c => kw[c].some(w => new RegExp('\\\\b' + w + '\\\\b').test(hay))) || 'Uncategorised';
  out.push({ json: { message_id: r.message_id, vendor, amount: a.amount, currency: a.currency || cfg.default_currency,
    currency_guessed: !a.currency, amount_label: a.label, receipt_date: d.date, date_source: d.date_source,
    subject: r.subject, keyword_category, snippet: r.text.slice(0, 400) } });
}
if (!out.length) return [];
out[0].json._skipped = skipped;
return out;`),
    ifTrue('Keywords only?', '!' + cfg('use_openai')),
    aiAgent('Pick a category with OpenAI', {
      prompt: "Vendor: {{ $json.vendor }}\nSubject: {{ $json.subject }}\nAmount: {{ $json.amount }} {{ $json.currency }}\nReceipt text:\n{{ $json.snippet }}\n\nAllowed categories: {{ Object.keys($('config').first().json.category_keywords).join(', ') }}, Uncategorised",
      system: 'You file business expenses. Pick exactly one category from the allowed list for this receipt. If none fits, answer Uncategorised. Confidence is 0 to 1.',
      schemaExample: { category: 'Software', confidence: 0.82 },
    }),
    code('Check the AI category', `
// The model may only choose from the configured list; anything else, or a low
// confidence, keeps the keyword category so a bad answer never lands in the sheet.
const cfg = $('config').first().json;
const allowed = [...Object.keys(cfg.category_keywords), 'Uncategorised'];
const r = $('Extract receipt fields').item.json;
const o = $json.output || {};
const ok = allowed.includes(o.category) && Number(o.confidence || 0) >= 0.5;
return { json: { ...r, category: ok ? o.category : r.keyword_category, category_source: ok ? 'openai' : 'keywords (AI answer rejected)' } };`, { perItem: true }),
    code('Use the keyword category', `
// Deterministic fallback while USE_OPENAI is false.
return $input.all().map(i => ({ json: { ...i.json, category: i.json.keyword_category, category_source: 'keywords' } }));`),
    merge('Combine categorised receipts'),
    code('Build expense rows', `
// One sheet row per receipt. Anything a person must check is spelled out in review_notes.
const cfg = $('config').first().json;
return $input.all().map(({ json: r }) => {
  const notes = [];
  if (r.amount === null) notes.push('no total found');
  if (!r.vendor) notes.push('no vendor');
  if (r.currency_guessed) notes.push('currency assumed ' + r.currency);
  if (r.date_source === 'email header') notes.push('date taken from email');
  if (r.category === 'Uncategorised') notes.push('no category matched');
  if (r.amount !== null && r.amount > cfg.review_above) notes.push('above REVIEW_ABOVE');
  return { json: {
    message_id: r.message_id, receipt_date: r.receipt_date, vendor: r.vendor, amount: r.amount ?? '', currency: r.currency,
    category: r.category, category_source: r.category_source, status: notes.length ? 'needs review' : 'ready',
    review_notes: notes.join('; '), subject: r.subject, logged_at: cfg.run_started_at,
  } };
});`),
    ifWhen('Write to the sheet?', [[cfg('live'), 'true'], [cfg('sheets_enabled'), 'true']]),
    stop('STOP: dry run - nothing written'),
    sheets.upsert('Write rows to the Expenses tab', cfg('expense_sheet_id'), 'Expenses', 'message_id'),
    code('Remember processed messages', `
// Only after a real write: the ids join the seen list (last 500 kept) so a re-poll skips them.
const store = $getWorkflowStaticData('global');
const ids = $('Build expense rows').all().map(i => i.json.message_id);
store.seen_ids = [...new Set([...(store.seen_ids || []), ...ids])].slice(-500);
return [{ json: { remembered: ids.length, total_seen: store.seen_ids.length } }];`),
  ],
  edges: [
    ['Run manually', 'config'], ['New receipt in Gmail', 'config'],
    ['config', 'Pick up the trigger email'],
    ['Pick up the trigger email', 'Started by Gmail?'],
    ['Started by Gmail?', 0, 'Read receipt emails'], ['Started by Gmail?', 1, 'Load sample receipts'],
    ['Read receipt emails', 'Combine receipt sources'], ['Load sample receipts', 0, 'Combine receipt sources', 1],
    ['Combine receipt sources', 'Extract receipt fields'],
    ['Extract receipt fields', 'Keywords only?'],
    ['Keywords only?', 0, 'Use the keyword category'], ['Keywords only?', 1, 'Pick a category with OpenAI'],
    ['Pick a category with OpenAI model', 'Pick a category with OpenAI', 'ai_languageModel'],
    ['Pick a category with OpenAI output format', 'Pick a category with OpenAI', 'ai_outputParser'],
    ['Pick a category with OpenAI', 'Check the AI category'],
    ['Use the keyword category', 'Combine categorised receipts'], ['Check the AI category', 0, 'Combine categorised receipts', 1],
    ['Combine categorised receipts', 'Build expense rows'],
    ['Build expense rows', 'Write to the sheet?'],
    ['Write to the sheet?', 0, 'Write rows to the Expenses tab'], ['Write to the sheet?', 1, 'STOP: dry run - nothing written'],
    ['Write rows to the Expenses tab', 'Remember processed messages'],
  ],
  groups: [
    { title: 'Start and settings', why: 'Gmail polls every minute for unread receipts; `Run manually` is the zero-credential way in. Category keywords and review thresholds live in `config`.', nodes: ['Run manually', 'New receipt in Gmail', 'config'] },
    { title: 'Collect and parse receipts', why: '`Started by Gmail?` tells a real poll from a manual run, which gets `Load sample receipts`. `Extract receipt fields` ranks total labels so a subtotal never wins, and drops message ids it has already written.', nodes: ['Pick up the trigger email', 'Started by Gmail?', 'Read receipt emails', 'Load sample receipts', 'Combine receipt sources', 'Extract receipt fields'] },
    { title: 'Choose a category', why: 'The keyword category is computed first, so `Check the AI category` always has a fallback. A model answer outside the allowed list or under 0.5 confidence is rejected rather than written.', nodes: ['Keywords only?', 'Use the keyword category', 'Pick a category with OpenAI', 'Check the AI category', 'Combine categorised receipts', 'Build expense rows'] },
    { title: 'Write once per message', why: 'Rows are upserted on message_id, and `Remember processed messages` runs only after a real write, so a dry run never marks a receipt as done.', nodes: ['Write to the sheet?', 'STOP: dry run - nothing written', 'Write rows to the Expenses tab', 'Remember processed messages'] },
  ],
  scenarios: [
    {
      name: 'shipped config (dry run, samples)', start: 'Run manually',
      expect: { reached: ['Load sample receipts', 'Use the keyword category', 'STOP: dry run - nothing written'], notReached: ['Pick a category with OpenAI'], outward: 'none' },
      check: out => {
        const rows = out['Build expense rows'];
        const by = (id: string) => rows.find((r: any) => r.message_id === id);
        const f: string[] = [];
        if (rows.length !== 4) f.push(`duplicate message should be dropped, got ${rows.length} rows`);
        const a = by('18f0a1');
        if (a?.amount !== 259.2 || a?.currency !== 'USD' || a?.category !== 'Software' || a?.vendor !== 'Pixelpond' || a?.status !== 'ready') f.push(`Pixelpond row wrong: ${JSON.stringify(a)}`);
        const b = by('18f0a2');
        if (b?.amount !== 34.65 || b?.currency !== 'EUR' || b?.category !== 'Travel') f.push(`MetroCab decimal comma wrong: ${JSON.stringify(b)}`);
        const c = by('18f0a3');
        if (c?.amount !== 186 || c?.currency !== 'GBP' || c?.vendor !== 'Cornerbistro' || c?.category !== 'Meals' || !c?.review_notes.includes('date taken from email')) f.push(`bistro row wrong: ${JSON.stringify(c)}`);
        const d = by('18f0a4');
        if (d?.status !== 'needs review' || !d?.review_notes.includes('no total found') || d?.category !== 'Office') f.push(`missing-total row wrong: ${JSON.stringify(d)}`);
        return f;
      },
    },
    {
      name: 'Gmail receipt, OpenAI on, live write', start: 'New receipt in Gmail',
      overrides: { USE_OPENAI: true, EXPENSE_SHEET_ID: '1ExpSheetAbc', DRY_RUN: false },
      input: [{ id: '19a7c3', threadId: '19a7c3', subject: 'Receipt for your order', date: new Date().toISOString(),
        from: { value: [{ address: 'receipts@lanternhost.example', name: 'Lantern Host Receipts' }], text: 'Lantern Host Receipts <receipts@lanternhost.example>' },
        text: 'Server hosting, October\nAmount paid: 1.240,00 EUR\nThank you.', html: '' }],
      mocks: {
        'Pick a category with OpenAI': [{ output: { category: 'Hosting', confidence: 0.9 } }],
        'Write rows to the Expenses tab': (items: any[]) => items,
      },
      expect: { reached: ['Read receipt emails', 'Check the AI category', 'Write rows to the Expenses tab', 'Remember processed messages'], notReached: ['Load sample receipts'], outward: 'some' },
      check: out => {
        const r = out['Build expense rows'][0];
        const f: string[] = [];
        if (r.amount !== 1240 || r.currency !== 'EUR') f.push(`amount parse wrong: ${r.amount} ${r.currency}`);
        if (r.category !== 'Software' || r.category_source !== 'keywords (AI answer rejected)') f.push(`off-list AI category should fall back to keywords, got ${r.category}/${r.category_source}`);
        if (!r.review_notes.includes('above REVIEW_ABOVE')) f.push('large receipt should be flagged');
        if (out['Remember processed messages'][0].remembered !== 1) f.push('message id not remembered');
        return f;
      },
    },
  ],
});
