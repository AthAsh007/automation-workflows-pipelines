import { defineSpec } from '../_kit/spec';
import { trigger, code, ifTrue, merge, stop, http, sheets, slack } from '../_kit/n';

const cfg = (k: string) => `$('config').first().json.${k}`;

export default defineSpec({
  slug: 'shopify-price-history',
  title: 'Record Shopify price changes into a Google Sheets price history',
  summary: 'Compares every Shopify variant price with yesterday\'s snapshot in Google Sheets, appends each change with its percentage and type (drop, rise, sale started or ended, new, removed) to a history tab, and flags large drops and likely decimal slips to Slack.',
  category: 'E-commerce',
  description: {
    who: 'Shopify merchants and pricing managers who need to answer "when did this price change and by how much" without digging through admin logs, and who want to catch a 99.00 typed as 9.90 before it sells out.',
    how: [
      'Every day at 06:00 it reads all product variants from Shopify, or 7 sample variants until Shopify is connected.',
      'It loads the last snapshot from the Price snapshot tab and compares price and compare-at price for every variant.',
      'Each change becomes a history row: old and new price, delta, percent, and a type such as drop, rise, sale started, sale ended, new or removed.',
      'Drops of 25% or more are flagged, and a new price close to a tenth of the old one is marked as a possible decimal slip.',
      'History rows are appended, the snapshot is updated, and flagged drops go to Slack.',
    ],
    setup: [
      'Run it once as imported. It compares the sample data and stops at `STOP: dry run - sheet untouched`.',
      'Add a Shopify access token credential to `Fetch product variants`, set `SHOP_DOMAIN` and `USE_SHOPIFY = true`.',
      'Create a sheet with a Price snapshot tab and a Price history tab and put its id in `PRICE_SHEET_ID`. The first live run fills the snapshot.',
      'Optionally set `SLACK_CHANNEL_ID`, then set `DRY_RUN = false`.',
    ],
    requirements: ['A Shopify store', 'A custom app token with read_products', 'A Google Sheet with two tabs', 'Optional: a Slack workspace'],
    customize: [
      '`DROP_ALERT_PCT` sets how big a drop must be to reach Slack.',
      '`IGNORE_UNDER_PCT` hides rounding changes below that percent.',
      '`SKIP_PRODUCT_TYPES` leaves gift cards and samples out of the history.',
    ],
  },
  config: {
    intro: ['USE_SHOPIFY false -> SAMPLE variants. PRICE_SHEET_ID blank -> SAMPLE snapshot, nothing written.', 'DRY_RUN true -> changes are computed and shown, nothing is written or posted.'],
    consts: [
      { name: 'USE_SHOPIFY', value: false, note: 'set true after adding the Shopify credential to the fetch node' },
      { name: 'SHOP_DOMAIN', value: 'your-store.myshopify.com', note: 'your myshopify.com domain' },
      { name: 'PRICE_SHEET_ID', value: '', note: 'Google Sheets id with Price snapshot and Price history tabs' },
      { name: 'DROP_ALERT_PCT', value: 25, note: 'drops of at least this percent are flagged and posted' },
      { name: 'IGNORE_UNDER_PCT', value: 0.5, note: 'price moves smaller than this percent are not recorded' },
      { name: 'SKIP_PRODUCT_TYPES', value: ['Gift Card', 'Sample'], note: 'Shopify product types left out' },
      { name: 'SLACK_CHANNEL_ID', value: '', note: 'channel for flagged drops; blank skips Slack' },
    ],
    flags: { sheet_enabled: "PRICE_SHEET_ID.trim() !== ''", slack_enabled: "SLACK_CHANNEL_ID.trim() !== ''" },
    safety: 'dry_run',
  },
  nodes: [
    trigger.manual(),
    trigger.schedule('Every day at 06:00', '0 6 * * *'),
    ifTrue('Shopify connected?', cfg('use_shopify')),
    http('Fetch product variants', {
      url: `={{ 'https://' + ${cfg('shop_domain')} + '/admin/api/2024-10/products.json' }}`, auth: 'shopifyAccessTokenApi',
      query: { limit: '250', fields: 'id,title,product_type,variants' },
    }),
    code('Read Shopify variants', `
// Products -> one entry per variant with price and compare-at price as numbers.
const cfg = $('config').first().json;
const variants = [];
for (const page of $input.all()) for (const p of page.json.products || []) {
  if (cfg.skip_product_types.includes(p.product_type)) continue;
  for (const v of p.variants || []) variants.push({
    variant_id: String(v.id), sku: v.sku || '', title: p.title + (v.title && v.title !== 'Default Title' ? ' / ' + v.title : ''),
    price: Number(v.price), compare_at: v.compare_at_price ? Number(v.compare_at_price) : null,
  });
}
return [{ json: { variants } }];`),
    code('Load sample variants', `
// Used until USE_SHOPIFY is true. Paired with the sample snapshot to show every change type.
return [{ json: { variants: [
  { variant_id: '41', sku: 'LS-M', title: 'Linen shirt / M', price: 69, compare_at: null },
  { variant_id: '42', sku: 'LS-L', title: 'Linen shirt / L', price: 79, compare_at: null },
  { variant_id: '43', sku: 'WB-1', title: 'Wool beanie', price: 3.5, compare_at: null },
  { variant_id: '44', sku: 'CB-1', title: 'Canvas bag', price: 52, compare_at: null },
  { variant_id: '45', sku: 'SS-1', title: 'Silk scarf', price: 96, compare_at: 120 },
  { variant_id: '47', sku: 'TEE-1', title: 'Organic tee', price: 29, compare_at: null },
  { variant_id: '48', sku: 'SK-3', title: 'Merino socks 3-pack', price: 15, compare_at: null },
] } }];`),
    merge('Combine variant sources'),
    ifTrue('Snapshot sheet set?', cfg('sheet_enabled')),
    sheets.read('Read the last snapshot', cfg('price_sheet_id'), 'Price snapshot'),
    code('Load sample snapshot', `
// Used until PRICE_SHEET_ID is set: yesterday's prices.
const day = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
return [
  ['41', 'LS-M', 'Linen shirt / M', 79, ''], ['42', 'LS-L', 'Linen shirt / L', 79, ''], ['43', 'WB-1', 'Wool beanie', 35, ''],
  ['44', 'CB-1', 'Canvas bag', 45, ''], ['45', 'SS-1', 'Silk scarf', 120, ''], ['46', 'LB-1', 'Leather belt', 58, ''],
  ['48', 'SK-3', 'Merino socks 3-pack', 12, 15],
].map(([variant_id, sku, title, price, compare_at]) => ({ json: { variant_id, sku, title, price, compare_at, captured_at: day } }));`),
    merge('Combine snapshot sources'),
    code('Compare with the snapshot', `
// Every variant is new, removed, changed or unchanged. Changes get a type and a
// percent; a drop of DROP_ALERT_PCT or more is flagged, and a new price close to a
// tenth (or ten times) of the old one is marked as a possible decimal slip.
const cfg = $('config').first().json;
const now = new Date().toISOString();
const current = $('Combine variant sources').first().json.variants;
const num = v => v === '' || v === null || v === undefined ? null : Number(String(v).replace(/[^0-9.]/g, ''));
const snap = Object.fromEntries($input.all().map(i => i.json).filter(r => r.variant_id !== undefined && r.variant_id !== '')
  .map(r => [String(r.variant_id), { ...r, price: num(r.price), compare_at: num(r.compare_at) }]));
const baseline = Object.keys(snap).length === 0;
const rows = [];
const seen = new Set();
for (const v of current) {
  seen.add(v.variant_id);
  const old = snap[v.variant_id];
  if (!old) { rows.push({ ...v, old_price: '', new_price: v.price, delta: '', delta_pct: '', change: baseline ? 'baseline' : 'new', flag: '' }); continue; }
  const delta = Math.round((v.price - old.price) * 100) / 100;
  const pct = old.price ? Math.round(delta / old.price * 1000) / 10 : 0;
  const compareChanged = (old.compare_at || null) !== (v.compare_at || null);
  if (Math.abs(pct) < cfg.ignore_under_pct && !compareChanged) continue;
  const change =
    !old.compare_at && v.compare_at && delta < 0 ? 'sale started' :
    old.compare_at && !v.compare_at && delta > 0 ? 'sale ended' :
    delta < 0 ? 'drop' : delta > 0 ? 'rise' : 'compare-at changed';
  const ratio = old.price ? v.price / old.price : 1;
  const flag = (ratio > 0.09 && ratio < 0.11) || (ratio > 9 && ratio < 11) ? 'possible decimal slip' : pct <= -cfg.drop_alert_pct ? 'big drop' : '';
  rows.push({ ...v, old_price: old.price, new_price: v.price, delta, delta_pct: pct, change, flag });
}
for (const [id, old] of Object.entries(snap)) if (!seen.has(id)) rows.push({ variant_id: id, sku: old.sku, title: old.title, price: null, compare_at: null,
  old_price: old.price, new_price: '', delta: '', delta_pct: '', change: 'removed', flag: '' });
const history = rows.filter(r => r.change !== 'baseline').map(r => ({ changed_at: now, variant_id: r.variant_id, sku: r.sku, title: r.title,
  old_price: r.old_price, new_price: r.new_price, delta: r.delta, delta_pct: r.delta_pct, compare_at: r.compare_at ?? '', change: r.change, flag: r.flag }));
const snapshot = rows.filter(r => r.change !== 'removed').map(r => ({ variant_id: r.variant_id, sku: r.sku, title: r.title, price: r.price, compare_at: r.compare_at ?? '', captured_at: now }));
return [{ json: { history, snapshot, flagged: history.filter(h => h.flag), baseline, checked: current.length } }];`),
    code('Split history rows', `
// One item per history row for the append.
return $input.first().json.history.map(json => ({ json }));`),
    ifTrue('Write to the sheet?', `${cfg('live')} && ${cfg('sheet_enabled')}`),
    stop('STOP: dry run - sheet untouched'),
    sheets.append('Append to price history', cfg('price_sheet_id'), 'Price history'),
    code('Prepare snapshot rows', `
// After the history is safe, the snapshot moves forward: changed and new variants only.
return $('Compare with the snapshot').first().json.snapshot.map(json => ({ json }));`),
    sheets.upsert('Update the price snapshot', cfg('price_sheet_id'), 'Price snapshot', 'variant_id'),
    code('Write the price alert', `
// Only flagged rows are posted; ordinary changes stay in the sheet.
const cfg = $('config').first().json;
const d = $input.first().json;
const text = [
  ':warning: *' + d.flagged.length + ' price change' + (d.flagged.length === 1 ? '' : 's') + ' to check*' + (cfg.mode === 'preview' ? ' (dry run)' : ''),
  ...d.flagged.map(r => '• ' + r.title + ' (' + (r.sku || r.variant_id) + '): ' + r.old_price + ' -> ' + r.new_price + ' (' + r.delta_pct + '%), ' + r.flag),
  '', d.history.length + ' changes recorded out of ' + d.checked + ' variants.',
].join('\\n');
return [{ json: { text, flagged: d.flagged.length } }];`),
    ifTrue('Any flagged drops?', '$json.flagged > 0'),
    stop('STOP: no flagged drops'),
    ifTrue('Slack channel set?', cfg('slack_enabled')),
    stop('STOP: no Slack channel'),
    ifTrue('Live alert?', cfg('live')),
    stop('STOP: dry run - nothing posted'),
    slack.post('Post flagged drops to Slack', cfg('slack_channel_id'), '$json.text'),
  ],
  edges: [
    ['Run manually', 'config'], ['Every day at 06:00', 'config'],
    ['config', 'Shopify connected?'],
    ['Shopify connected?', 0, 'Fetch product variants'], ['Shopify connected?', 1, 'Load sample variants'],
    ['Fetch product variants', 'Read Shopify variants'],
    ['Read Shopify variants', 'Combine variant sources'], ['Load sample variants', 0, 'Combine variant sources', 1],
    ['Combine variant sources', 'Snapshot sheet set?'],
    ['Snapshot sheet set?', 0, 'Read the last snapshot'], ['Snapshot sheet set?', 1, 'Load sample snapshot'],
    ['Read the last snapshot', 'Combine snapshot sources'], ['Load sample snapshot', 0, 'Combine snapshot sources', 1],
    ['Combine snapshot sources', 'Compare with the snapshot'],
    ['Compare with the snapshot', 'Split history rows'],
    ['Compare with the snapshot', 'Write the price alert'],
    ['Split history rows', 'Write to the sheet?'],
    ['Write to the sheet?', 0, 'Append to price history'], ['Write to the sheet?', 1, 'STOP: dry run - sheet untouched'],
    ['Append to price history', 'Prepare snapshot rows'],
    ['Prepare snapshot rows', 'Update the price snapshot'],
    ['Write the price alert', 'Any flagged drops?'],
    ['Any flagged drops?', 0, 'Slack channel set?'], ['Any flagged drops?', 1, 'STOP: no flagged drops'],
    ['Slack channel set?', 0, 'Live alert?'], ['Slack channel set?', 1, 'STOP: no Slack channel'],
    ['Live alert?', 0, 'Post flagged drops to Slack'], ['Live alert?', 1, 'STOP: dry run - nothing posted'],
  ],
  groups: [
    { title: 'Start and settings', why: 'Runs daily at 06:00, before most stores change prices, so each row reads as one day\'s change. Thresholds and skipped product types live in `config`.', nodes: ['Run manually', 'Every day at 06:00', 'config'] },
    { title: 'Read current prices', why: '`Read Shopify variants` flattens products into variants and drops gift cards, whose price is a face value, not a price. `Load sample variants` stands in until `USE_SHOPIFY` is true.', nodes: ['Shopify connected?', 'Fetch product variants', 'Read Shopify variants', 'Load sample variants', 'Combine variant sources'] },
    { title: 'Compare with the snapshot', why: 'The snapshot tab is yesterday\'s price list. With an empty snapshot the run is a baseline: it fills the snapshot and writes no history, so the first day does not log every variant as new.', nodes: ['Snapshot sheet set?', 'Read the last snapshot', 'Load sample snapshot', 'Combine snapshot sources', 'Compare with the snapshot'] },
    { title: 'Write history and alert', why: 'History is appended before the snapshot moves, so a failed append leaves yesterday\'s snapshot and the change is caught again tomorrow. Only flagged drops reach Slack; ordinary changes stay in the sheet.', nodes: ['Split history rows', 'Write the price alert', 'Write to the sheet?', 'Any flagged drops?', 'STOP: dry run - sheet untouched', 'Append to price history', 'STOP: no flagged drops', 'Slack channel set?', 'Prepare snapshot rows', 'STOP: no Slack channel', 'Live alert?', 'Update the price snapshot', 'STOP: dry run - nothing posted', 'Post flagged drops to Slack'] },
  ],
  scenarios: [
    {
      name: 'shipped config (dry run)', start: 'Run manually',
      expect: { reached: ['Load sample variants', 'Load sample snapshot', 'STOP: dry run - sheet untouched', 'STOP: no Slack channel'], outward: 'none' },
      check: out => {
        const f: string[] = [];
        const d = out['Compare with the snapshot'][0];
        const ch = (sku: string) => d.history.find((h: any) => h.sku === sku);
        const want: Record<string, string> = { 'LS-M': 'drop', 'WB-1': 'drop', 'CB-1': 'rise', 'SS-1': 'sale started', 'LB-1': 'removed', 'TEE-1': 'new', 'SK-3': 'sale ended' };
        for (const [sku, c] of Object.entries(want)) if (ch(sku)?.change !== c) f.push(`${sku} should be ${c}, got ${ch(sku)?.change}`);
        if (ch('LS-L')) f.push('unchanged LS-L should not be recorded');
        if (d.history.length !== 7) f.push(`expected 7 history rows, got ${d.history.length}`);
        if (ch('LS-M')?.delta_pct !== -12.7) f.push(`LS-M should be -12.7%, got ${ch('LS-M')?.delta_pct}`);
        if (d.flagged.length !== 1 || d.flagged[0].flag !== 'possible decimal slip') f.push('only the beanie (35 -> 3.5) should be flagged, as a decimal slip');
        if (d.snapshot.some((s: any) => s.sku === 'LB-1')) f.push('removed variant must leave the snapshot');
        return f;
      },
    },
    {
      name: 'live with Shopify, the sheet and Slack', start: 'Every day at 06:00',
      overrides: { USE_SHOPIFY: true, PRICE_SHEET_ID: '1PriceSheet', DRY_RUN: false, SLACK_CHANNEL_ID: 'C0PRICING' },
      mocks: {
        'Fetch product variants': [{ products: [
          { id: 1, title: 'Desk lamp', product_type: 'Lighting', variants: [{ id: 501, sku: 'DL-1', title: 'Default Title', price: '60.00', compare_at_price: null }] },
          { id: 2, title: 'Gift card', product_type: 'Gift Card', variants: [{ id: 502, sku: 'GC', title: '50', price: '50.00', compare_at_price: null }] },
        ] }],
        'Read the last snapshot': [{ row_number: 2, variant_id: 501, sku: 'DL-1', title: 'Desk lamp', price: '89.00', compare_at: '', captured_at: '2026-10-15' }],
        'Append to price history': (items: any[]) => items,
        'Update the price snapshot': (items: any[]) => items,
        'Post flagged drops to Slack': [{ ok: true }],
      },
      expect: { reached: ['Append to price history', 'Update the price snapshot', 'Post flagged drops to Slack'], notReached: ['Load sample variants'], outward: 'some' },
      check: out => {
        const f: string[] = [];
        const h = out['Append to price history'];
        if (h.length !== 1 || h[0].delta_pct !== -32.6 || h[0].flag !== 'big drop') f.push(`desk lamp 89 -> 60 should be a -32.6% big drop, got ${JSON.stringify(h)}`);
        if (out['Update the price snapshot'].some((s: any) => s.sku === 'GC')) f.push('gift cards must be skipped');
        return f;
      },
    },
  ],
});
