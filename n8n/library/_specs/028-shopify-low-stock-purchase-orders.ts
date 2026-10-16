import { defineSpec } from '../_kit/spec';
import { trigger, code, ifTrue, merge, stop, http, sheets } from '../_kit/n';

const cfg = (k: string) => `$('config').first().json.${k}`;
const shop = (path: string) => `={{ 'https://' + ${cfg('shop_domain')} + '/admin/api/2024-10/${path}' }}`;

export default defineSpec({
  slug: 'shopify-low-stock-purchase-orders',
  title: 'Draft purchase orders in Google Sheets for low Shopify stock',
  summary: 'Works out a reorder point for every tracked Shopify variant from its last 28 days of sales, supplier lead time and safety stock, rounds order quantities to case packs and minimums, groups them into one draft PO per supplier, and appends the lines to a Google Sheets tab.',
  category: 'E-commerce',
  description: {
    who: 'Shopify store owners who reorder from a handful of suppliers and currently eyeball the inventory page every Monday. It writes the draft PO; you still decide whether to send it.',
    how: [
      'Every weekday at 07:30 it reads products, the last 28 days of orders and unit costs from Shopify, or a 9-variant sample until Shopify is connected.',
      'For each tracked variant: daily sales = units sold / 28; reorder point = daily sales x supplier lead time + 7 days of safety stock.',
      'Below the reorder point it orders enough to cover lead time plus 30 days, rounded up to the case pack and at least the supplier MOQ.',
      'Lines are grouped into one PO per supplier. A supplier under its minimum order value is held, and a SKU already on an open draft is skipped.',
      'New lines are appended to the PO lines tab as status draft.',
    ],
    setup: [
      'Run it once as imported. It drafts POs from the sample and stops at `STOP: dry run - sheet untouched`.',
      'Add a Shopify access token credential to the three Shopify nodes, set `SHOP_DOMAIN` and `USE_SHOPIFY = true`.',
      'Fill `SUPPLIERS` with each vendor name as it appears in Shopify, plus lead time, case pack, MOQ and minimum order value.',
      'Create a sheet with a PO lines tab and put its id in `PO_SHEET_ID`, then set `DRY_RUN = false`.',
    ],
    requirements: ['A Shopify store with inventory tracking on', 'A custom app access token with read_products, read_orders and read_inventory', 'A Google Sheet'],
    customize: [
      '`SAFETY_DAYS` and `COVER_DAYS` set how much buffer and how many days each order covers.',
      '`SALES_WINDOW_DAYS` changes how far back sales are averaged.',
      '`SKIP_TAGS` keeps discontinued products out of every PO.',
    ],
  },
  config: {
    intro: ['USE_SHOPIFY false -> SAMPLE stock and sales. PO_SHEET_ID blank -> SAMPLE open PO lines.', 'DRY_RUN true -> POs are drafted and shown, nothing is written.'],
    consts: [
      { name: 'USE_SHOPIFY', value: false, note: 'set true after adding the Shopify credential to the three Shopify nodes' },
      { name: 'SHOP_DOMAIN', value: 'your-store.myshopify.com', note: 'your myshopify.com domain' },
      { name: 'SALES_WINDOW_DAYS', value: 28, note: 'days of orders used to average daily sales' },
      { name: 'SAFETY_DAYS', value: 7, note: 'days of average sales kept as safety stock' },
      { name: 'COVER_DAYS', value: 30, note: 'each order covers lead time plus this many days' },
      { name: 'SUPPLIERS', value: {
        'Kiln & Co': { lead_time_days: 21, case_pack: 12, moq: 24, min_order_value: 0, email: 'orders@kilnco.example' },
        Brewline: { lead_time_days: 14, case_pack: 6, moq: 6, min_order_value: 200, email: 'trade@brewline.example' },
        'Weave Studio': { lead_time_days: 10, case_pack: 5, moq: 10, min_order_value: 300, email: 'hello@weavestudio.example' },
      }, note: 'Shopify vendor name -> lead time (days), case pack, minimum units per line, minimum order value' },
      { name: 'DEFAULT_SUPPLIER', value: { lead_time_days: 14, case_pack: 1, moq: 1, min_order_value: 0, email: '' }, note: 'used for vendors not listed above' },
      { name: 'SKIP_TAGS', value: ['discontinued', 'made-to-order'], note: 'product tags that are never reordered' },
      { name: 'OPEN_PO_DAYS', value: 30, note: 'a SKU on a draft or ordered line newer than this is not drafted again' },
      { name: 'PO_SHEET_ID', value: '', note: 'Google Sheets id with a PO lines tab; blank uses sample open lines and writes nothing' },
    ],
    flags: { sheet_enabled: "PO_SHEET_ID.trim() !== ''" },
    safety: 'dry_run',
  },
  nodes: [
    trigger.manual(),
    trigger.schedule('Every weekday at 07:30', '30 7 * * 1-5'),
    ifTrue('Sample mode?', `!${cfg('use_shopify')}`),
    code('Load sample stock and sales', `
// Used until USE_SHOPIFY is true. Nine variants: four to reorder, one held by a
// supplier minimum, and one of each skip reason.
return [{ json: { window_days: 28, variants: [
  { sku: 'MUG-12', title: 'Speckled mug 12oz', vendor: 'Kiln & Co', tags: [], tracked: true, on_hand: 14, sold: 84, unit_cost: 4.2 },
  { sku: 'MUG-16', title: 'Speckled mug 16oz', vendor: 'Kiln & Co', tags: [], tracked: true, on_hand: 120, sold: 56, unit_cost: 4.8 },
  { sku: 'CST-4', title: 'Stoneware coaster set', vendor: 'Kiln & Co', tags: [], tracked: true, on_hand: 4, sold: 28, unit_cost: 6.5 },
  { sku: 'KTL-1', title: 'Pour-over kettle', vendor: 'Brewline', tags: [], tracked: true, on_hand: 3, sold: 21, unit_cost: 22 },
  { sku: 'FLT-100', title: 'Paper filters x100', vendor: 'Brewline', tags: [], tracked: true, on_hand: 40, sold: 84, unit_cost: 1.9 },
  { sku: 'GRN-2', title: 'Hand grinder', vendor: 'Brewline', tags: [], tracked: true, on_hand: 5, sold: 14, unit_cost: 31 },
  { sku: 'APR-L', title: 'Linen apron', vendor: 'Weave Studio', tags: [], tracked: true, on_hand: 1, sold: 14, unit_cost: 9 },
  { sku: 'TOTE-1', title: 'Canvas tote', vendor: 'Canvas Lab', tags: [], tracked: true, on_hand: 2, sold: 0, unit_cost: 3 },
  { sku: 'GIFT-25', title: 'Gift card', vendor: 'Store', tags: [], tracked: false, on_hand: 0, sold: 9, unit_cost: 0 },
] } }];`),
    http('Fetch products and variants', { url: shop('products.json'), auth: 'shopifyAccessTokenApi', query: { limit: '250', status: 'active', fields: 'id,title,vendor,tags,variants' } }),
    http('Fetch orders in the sales window', {
      url: shop('orders.json'), auth: 'shopifyAccessTokenApi',
      query: { status: 'any', limit: '250', fields: 'id,created_at,cancelled_at,line_items', created_at_min: `={{ new Date(Date.now() - ${cfg('sales_window_days')} * 864e5).toISOString() }}` },
    }),
    http('Fetch unit costs', {
      url: shop('inventory_items.json'), auth: 'shopifyAccessTokenApi',
      query: { ids: "={{ $('Fetch products and variants').first().json.products.flatMap(p => p.variants.map(v => v.inventory_item_id)).slice(0, 100).join(',') }}" },
    }),
    code('Read Shopify stock and sales', `
// Units sold per variant from non-cancelled orders, joined to stock and cost.
// One page of each list (250 products, 250 orders); larger stores should page.
const cfg = $('config').first().json;
const products = $('Fetch products and variants').first().json.products || [];
const orders = $('Fetch orders in the sales window').first().json.orders || [];
const costs = Object.fromEntries(($input.first().json.inventory_items || []).map(i => [i.id, Number(i.cost || 0)]));
const sold = {};
for (const o of orders) if (!o.cancelled_at) for (const li of o.line_items || []) sold[li.variant_id] = (sold[li.variant_id] || 0) + li.quantity;
const variants = [];
for (const p of products) for (const v of p.variants || []) variants.push({
  sku: v.sku || String(v.id), title: p.title + (v.title && v.title !== 'Default Title' ? ' - ' + v.title : ''), vendor: p.vendor || '',
  tags: String(p.tags || '').split(',').map(t => t.trim().toLowerCase()).filter(Boolean),
  tracked: v.inventory_management === 'shopify', on_hand: Number(v.inventory_quantity || 0), sold: sold[v.id] || 0,
  unit_cost: costs[v.inventory_item_id] || 0,
});
return [{ json: { window_days: cfg.sales_window_days, variants } }];`),
    merge('Combine stock sources'),
    ifTrue('PO sheet set?', cfg('sheet_enabled')),
    sheets.read('Read open PO lines', cfg('po_sheet_id'), 'PO lines'),
    code('Load sample open PO lines', `
// Used until PO_SHEET_ID is set. The grinder is already on a draft from 6 days ago.
const day = n => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
return [
  { po_number: 'PO-SAMPLE-BREW', supplier: 'Brewline', sku: 'GRN-2', order_qty: 12, status: 'draft', created_at: day(6) },
  { po_number: 'PO-OLD-KILN', supplier: 'Kiln & Co', sku: 'MUG-12', order_qty: 96, status: 'received', created_at: day(40) },
].map(json => ({ json }));`),
    merge('Combine open PO sources'),
    code('Work out reorder quantities', `
// reorder point = daily sales x lead time + daily sales x SAFETY_DAYS.
// order = daily sales x (lead time + COVER_DAYS) + safety - on hand,
// rounded up to the case pack and never below the supplier MOQ.
const cfg = $('config').first().json;
const { variants, window_days } = $('Combine stock sources').first().json;
const cutoff = new Date(Date.now() - cfg.open_po_days * 864e5).toISOString().slice(0, 10);
const open = {};
for (const { json: r } of $input.all()) {
  if (!r.sku || !['draft', 'ordered'].includes(String(r.status || '').toLowerCase())) continue;
  if (String(r.created_at || '').slice(0, 10) >= cutoff) open[r.sku] = r.po_number;
}
const lines = [], skipped = [];
for (const v of variants) {
  const sup = cfg.suppliers[v.vendor] || cfg.default_supplier;
  const daily = v.sold / window_days;
  const safety = Math.ceil(daily * cfg.safety_days);
  const rp = Math.ceil(daily * sup.lead_time_days) + safety;
  const reason =
    !v.tracked ? 'stock not tracked' :
    v.tags.some(t => cfg.skip_tags.includes(t)) ? 'tagged ' + v.tags.find(t => cfg.skip_tags.includes(t)) :
    v.sold === 0 ? 'no sales in ' + window_days + ' days' :
    v.on_hand > rp ? 'above reorder point (' + v.on_hand + ' > ' + rp + ')' :
    open[v.sku] ? 'already on ' + open[v.sku] : '';
  if (reason) { skipped.push({ sku: v.sku, reason }); continue; }
  const need = Math.ceil(daily * (sup.lead_time_days + cfg.cover_days)) + safety - v.on_hand;
  const qty = Math.max(sup.moq, Math.ceil(need / sup.case_pack) * sup.case_pack);
  lines.push({ sku: v.sku, title: v.title, supplier: v.vendor, on_hand: v.on_hand, daily_sales: Math.round(daily * 100) / 100,
    reorder_point: rp, order_qty: qty, unit_cost: v.unit_cost, line_total: Math.round(qty * v.unit_cost * 100) / 100 });
}
return [{ json: { lines, skipped } }];`),
    code('Draft one PO per supplier', `
// Group lines by supplier and number each PO. A supplier whose total is below its
// min_order_value is held back whole: topping it up is a human decision.
const cfg = $('config').first().json;
const { lines, skipped } = $input.first().json;
const date = new Date().toISOString().slice(0, 10);
const bySup = {};
for (const l of lines) (bySup[l.supplier] ||= []).push(l);
const pos = [], held = [];
for (const [supplier, ls] of Object.entries(bySup)) {
  const sup = cfg.suppliers[supplier] || cfg.default_supplier;
  const total = Math.round(ls.reduce((s, l) => s + l.line_total, 0) * 100) / 100;
  const code = supplier.toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 6);
  if (total < sup.min_order_value) { held.push({ supplier, total, reason: 'below minimum order value ' + sup.min_order_value, skus: ls.map(l => l.sku) }); continue; }
  pos.push({ po_number: 'PO-' + date.replace(/-/g, '') + '-' + code, supplier, email: sup.email, total, lines: ls });
}
const rows = pos.flatMap(po => po.lines.map(l => ({ po_number: po.po_number, supplier: po.supplier, supplier_email: po.email, sku: l.sku, title: l.title,
  on_hand: l.on_hand, daily_sales: l.daily_sales, reorder_point: l.reorder_point, order_qty: l.order_qty, unit_cost: l.unit_cost,
  line_total: l.line_total, status: 'draft', created_at: date, mode: cfg.mode })));
return [{ json: { pos, held, skipped, rows } }];`),
    code('Summarise the drafts', `
// Readable result for the execution log, in every mode.
const d = $input.first().json;
const text = [
  d.pos.length + ' draft PO(s), ' + d.rows.length + ' lines',
  ...d.pos.map(p => '- ' + p.po_number + ' ' + p.supplier + ': ' + p.lines.length + ' lines, ' + p.total.toFixed(2)),
  ...d.held.map(h => '- held ' + h.supplier + ' (' + h.total.toFixed(2) + '): ' + h.reason),
  ...d.skipped.map(s => '- skip ' + s.sku + ': ' + s.reason),
].join('\\n');
return [{ json: { text } }];`),
    code('Split into PO lines', `
// One item per sheet row.
return $input.first().json.rows.map(json => ({ json }));`),
    ifTrue('Write to the sheet?', `${cfg('live')} && ${cfg('sheet_enabled')}`),
    stop('STOP: dry run - sheet untouched'),
    sheets.append('Append PO draft lines', cfg('po_sheet_id'), 'PO lines'),
  ],
  edges: [
    ['Run manually', 'config'], ['Every weekday at 07:30', 'config'],
    ['config', 'Sample mode?'],
    ['Sample mode?', 0, 'Load sample stock and sales'], ['Sample mode?', 1, 'Fetch products and variants'],
    ['Fetch products and variants', 'Fetch orders in the sales window'],
    ['Fetch orders in the sales window', 'Fetch unit costs'],
    ['Fetch unit costs', 'Read Shopify stock and sales'],
    ['Load sample stock and sales', 'Combine stock sources'], ['Read Shopify stock and sales', 0, 'Combine stock sources', 1],
    ['Combine stock sources', 'PO sheet set?'],
    ['PO sheet set?', 0, 'Read open PO lines'], ['PO sheet set?', 1, 'Load sample open PO lines'],
    ['Read open PO lines', 'Combine open PO sources'], ['Load sample open PO lines', 0, 'Combine open PO sources', 1],
    ['Combine open PO sources', 'Work out reorder quantities'],
    ['Work out reorder quantities', 'Draft one PO per supplier'],
    ['Draft one PO per supplier', 'Split into PO lines'],
    ['Draft one PO per supplier', 'Summarise the drafts'],
    ['Split into PO lines', 'Write to the sheet?'],
    ['Write to the sheet?', 0, 'Append PO draft lines'], ['Write to the sheet?', 1, 'STOP: dry run - sheet untouched'],
  ],
  groups: [
    { title: 'Start and settings', why: 'Runs every weekday at 07:30, before suppliers open. Lead times, case packs, MOQs and minimum order values live per supplier in `config`, so a new supplier is one entry.', nodes: ['Run manually', 'Every weekday at 07:30', 'config'] },
    { title: 'Read stock, sales and cost', why: 'Three read-only Shopify calls: products for stock, orders for the last `SALES_WINDOW_DAYS`, and inventory items for unit cost. Cancelled orders are ignored so a refunded rush does not inflate demand.', nodes: ['Sample mode?', 'Load sample stock and sales', 'Fetch products and variants', 'Fetch orders in the sales window', 'Fetch unit costs', 'Read Shopify stock and sales', 'Combine stock sources'] },
    { title: 'Check open POs and compute', why: 'Open draft and ordered lines are read first, so a SKU drafted on Monday is not drafted again on Tuesday. Every skipped variant keeps its reason, from untracked stock to above reorder point.', nodes: ['PO sheet set?', 'Read open PO lines', 'Load sample open PO lines', 'Combine open PO sources', 'Work out reorder quantities'] },
    { title: 'Draft and write', why: 'A supplier below its minimum order value is held whole rather than sent a partial PO. `Write to the sheet?` needs both a live run and a sheet id; the summary is built either way.', nodes: ['Draft one PO per supplier', 'Split into PO lines', 'Summarise the drafts', 'Write to the sheet?', 'STOP: dry run - sheet untouched', 'Append PO draft lines'] },
  ],
  scenarios: [
    {
      name: 'shipped config (dry run)', start: 'Run manually',
      expect: { reached: ['Load sample stock and sales', 'Load sample open PO lines', 'STOP: dry run - sheet untouched', 'Summarise the drafts'], outward: 'none' },
      check: out => {
        const f: string[] = [];
        const w = out['Work out reorder quantities'][0];
        const line = (sku: string) => w.lines.find((l: any) => l.sku === sku);
        // MUG-12: 3/day, lead 21, safety 21 -> RP 84; need 3*51+21-14 = 160 -> case 12 -> 168
        if (line('MUG-12')?.reorder_point !== 84 || line('MUG-12')?.order_qty !== 168) f.push(`MUG-12 should be RP 84 / qty 168, got ${line('MUG-12')?.reorder_point}/${line('MUG-12')?.order_qty}`);
        // CST-4: 1/day -> RP 28; need 51+7-4 = 54 -> case 12 -> 60
        if (line('CST-4')?.order_qty !== 60) f.push(`CST-4 qty should be 60, got ${line('CST-4')?.order_qty}`);
        // KTL-1: 0.75/day, lead 14 -> RP 11+6 = 17; need ceil(33)+6-3 = 36 -> case 6 -> 36
        if (line('KTL-1')?.order_qty !== 36) f.push(`KTL-1 qty should be 36, got ${line('KTL-1')?.order_qty}`);
        const why = (sku: string) => w.skipped.find((s: any) => s.sku === sku)?.reason || '';
        if (!why('MUG-16').startsWith('above reorder point')) f.push('MUG-16 is above its reorder point');
        if (!why('GRN-2').includes('PO-SAMPLE-BREW')) f.push('GRN-2 is already on an open draft');
        if (!why('TOTE-1').startsWith('no sales')) f.push('TOTE-1 has no sales');
        if (why('GIFT-25') !== 'stock not tracked') f.push('gift card is not tracked');
        const d = out['Draft one PO per supplier'][0];
        if (d.pos.length !== 2) f.push(`expected POs for Kiln & Co and Brewline, got ${d.pos.map((p: any) => p.supplier).join(', ')}`);
        if (!d.held.some((h: any) => h.supplier === 'Weave Studio')) f.push('Weave Studio should be held under its minimum');
        if (d.rows.length !== 4) f.push(`expected 4 PO lines, got ${d.rows.length}`);
        return f;
      },
    },
    {
      name: 'live with Shopify and the PO sheet', start: 'Every weekday at 07:30',
      overrides: { USE_SHOPIFY: true, PO_SHEET_ID: '1PoSheet', DRY_RUN: false },
      mocks: {
        'Fetch products and variants': [{ products: [
          { id: 1, title: 'Cold brew bottle', vendor: 'Brewline', tags: '', variants: [{ id: 11, sku: 'CB-1', title: 'Default Title', inventory_quantity: 2, inventory_management: 'shopify', inventory_item_id: 111 }] },
          { id: 2, title: 'Old mug', vendor: 'Kiln & Co', tags: 'Discontinued, sale', variants: [{ id: 21, sku: 'OLD-1', title: 'Default Title', inventory_quantity: 0, inventory_management: 'shopify', inventory_item_id: 211 }] },
        ] }],
        'Fetch orders in the sales window': [{ orders: [
          { id: 900, cancelled_at: null, line_items: [{ variant_id: 11, quantity: 40 }, { variant_id: 21, quantity: 3 }] },
          { id: 901, cancelled_at: '2026-10-01T10:00:00Z', line_items: [{ variant_id: 11, quantity: 50 }] },
        ] }],
        'Fetch unit costs': [{ inventory_items: [{ id: 111, cost: '9.50' }, { id: 211, cost: '3.00' }] }],
        'Read open PO lines': [{ po_number: 'PO-X', sku: 'ZZZ', status: 'received', created_at: '2026-01-01' }],
        'Append PO draft lines': (items: any[]) => items,
      },
      expect: { reached: ['Read Shopify stock and sales', 'Append PO draft lines'], notReached: ['Load sample stock and sales', 'STOP: dry run - sheet untouched'], outward: 'some' },
      check: out => {
        const f: string[] = [];
        const rows = out['Append PO draft lines'];
        // 40 units / 28 days; cancelled order ignored. RP = ceil(20)+ceil(10) = 30; need ceil(62.86)+10-2 = 71 -> case 6 -> 72
        if (rows.length !== 1 || rows[0].sku !== 'CB-1' || rows[0].order_qty !== 72) f.push(`expected one CB-1 line of 72, got ${JSON.stringify(rows.map((r: any) => [r.sku, r.order_qty]))}`);
        if (rows[0]?.line_total !== 684) f.push(`line total should be 684, got ${rows[0]?.line_total}`);
        if (!out['Work out reorder quantities'][0].skipped.some((s: any) => s.sku === 'OLD-1' && s.reason === 'tagged discontinued')) f.push('discontinued product should be skipped');
        return f;
      },
    },
  ],
});
