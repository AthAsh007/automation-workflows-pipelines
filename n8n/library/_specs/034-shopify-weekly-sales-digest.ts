import { defineSpec } from '../_kit/spec';
import { trigger, code, ifTrue, merge, stop, http, slack } from '../_kit/n';

const cfg = (k: string) => `$('config').first().json.${k}`;

export default defineSpec({
  slug: 'shopify-weekly-sales-digest',
  title: 'Post a weekly Shopify sales digest by product to Slack',
  summary: 'Every Monday compares the last 7 days of Shopify orders with the 7 before: revenue, orders, average order value, refunds by the week they happened, discount code usage, new versus returning customers, and the top products with their week-over-week change, posted as one Slack message.',
  category: 'E-commerce',
  description: {
    who: 'Shopify store owners and small e-commerce teams who want Monday\'s numbers in the team channel without opening Shopify Analytics or exporting a report.',
    how: [
      'Every Monday at 08:30 it reads the last 14 days of orders from Shopify, or 14 sample orders until Shopify is connected.',
      'Cancelled and test orders are dropped. The rest are split into this week and the week before.',
      'For each week it totals revenue, orders, average order value, units, discount codes used and new versus returning customers. Refunds count in the week they were issued, not the week of the order.',
      'Products are ranked by this week\'s revenue with the change against last week, and the digest is posted to Slack.',
    ],
    setup: [
      'Run it once as imported. It builds the digest from sample orders and stops at `STOP: no Slack channel`.',
      'Add a Shopify access token credential to `Fetch orders from the last 14 days`, set `SHOP_DOMAIN` and `USE_SHOPIFY = true`.',
      'Add a Slack credential and set `SLACK_CHANNEL_ID`.',
      'Set `DRY_RUN = false` to post every Monday.',
    ],
    requirements: ['A Shopify store', 'A custom app token with read_orders', 'A Slack workspace'],
    customize: [
      '`TOP_PRODUCTS` sets how many products the digest lists.',
      '`CURRENCY` and `LOCALE` control number formatting.',
      'Change the schedule on `Every Monday at 08:30` for a different reporting day.',
    ],
  },
  config: {
    intro: ['USE_SHOPIFY false -> SAMPLE orders.', 'SLACK_CHANNEL_ID blank -> nothing is posted. DRY_RUN true -> the digest is built and shown, not posted.'],
    consts: [
      { name: 'USE_SHOPIFY', value: false, note: 'set true after adding the Shopify credential to the fetch node' },
      { name: 'SHOP_DOMAIN', value: 'your-store.myshopify.com', note: 'your myshopify.com domain' },
      { name: 'TOP_PRODUCTS', value: 5, note: 'products listed in the digest' },
      { name: 'CURRENCY', value: 'USD', note: 'currency for formatting' },
      { name: 'LOCALE', value: 'en-US', note: 'number format' },
      { name: 'SLACK_CHANNEL_ID', value: '', note: 'channel for the digest; blank posts nothing' },
    ],
    flags: { slack_enabled: "SLACK_CHANNEL_ID.trim() !== ''" },
    safety: 'dry_run',
  },
  nodes: [
    trigger.manual(),
    trigger.schedule('Every Monday at 08:30', '30 8 * * 1'),
    ifTrue('Shopify connected?', cfg('use_shopify')),
    http('Fetch orders from the last 14 days', {
      url: `={{ 'https://' + ${cfg('shop_domain')} + '/admin/api/2024-10/orders.json' }}`, auth: 'shopifyAccessTokenApi',
      query: { status: 'any', limit: '250', created_at_min: '={{ new Date(Date.now() - 14 * 864e5).toISOString() }}',
        fields: 'id,created_at,cancelled_at,test,total_price,total_discounts,discount_codes,line_items,refunds,customer' },
    }),
    code('Read Shopify orders', `
// Orders -> the fields the digest needs. Refund amounts come from refund transactions
// so a partial refund counts for what was actually returned.
const out = [];
for (const page of $input.all()) for (const o of page.json.orders || []) out.push({ json: {
  id: o.id, created_at: o.created_at, cancelled: Boolean(o.cancelled_at), test: Boolean(o.test),
  total: Number(o.total_price || 0), discounts: Number(o.total_discounts || 0), codes: (o.discount_codes || []).map(d => d.code.toUpperCase()),
  lines: (o.line_items || []).map(l => ({ title: l.title, qty: l.quantity, price: Number(l.price) })),
  refunds: (o.refunds || []).map(r => ({ at: r.created_at, amount: (r.transactions || []).filter(t => t.kind === 'refund' && t.status !== 'failure').reduce((s, t) => s + Number(t.amount), 0) })),
  first_order: Number(o.customer?.orders_count || 1) <= 1,
} });
return out;`),
    code('Load sample orders', `
// Used until USE_SHOPIFY is true. Eight orders this week (one cancelled), six last week (one test).
const at = d => new Date(Date.now() - d * 864e5 - 3600000).toISOString();
const A = ['Cold brew kit', 40], B = ['Glass carafe', 25], C = ['Filter pack', 10], D = ['Gift box', 60];
const o = (id, day, lines, extra = {}) => {
  const sub = lines.reduce((s, [p, q]) => s + p[1] * q, 0);
  const disc = extra.discounts || 0;
  return { id, created_at: at(day), cancelled: false, test: false, total: sub - disc, discounts: disc, codes: [], refunds: [], first_order: false,
    lines: lines.map(([p, q]) => ({ title: p[0], qty: q, price: p[1] })), ...extra };
};
return [
  o(1, 1, [[A, 1], [B, 1]], { discounts: 6.5, codes: ['WELCOME10'], first_order: true }),
  o(2, 1, [[C, 3]]),
  o(3, 2, [[D, 1]]),
  o(4, 3, [[A, 2]], { discounts: 12, codes: ['SPRING15'], first_order: true }),
  o(5, 4, [[B, 2]]),
  o(6, 5, [[A, 1]], { refunds: [{ at: at(0.5), amount: 40 }] }),
  o(7, 6, [[C, 2]], { first_order: true }),
  o(8, 2, [[A, 1]], { cancelled: true }),
  o(11, 8, [[A, 1]]),
  o(12, 9, [[B, 1]]),
  o(13, 10, [[D, 2]]),
  o(14, 11, [[C, 1]], { test: true }),
  o(15, 12, [[A, 1], [B, 1]]),
  o(16, 13, [[C, 4]], { discounts: 4, codes: ['WELCOME10'], first_order: true }),
].map(json => ({ json }));`),
    merge('Combine order sources'),
    code('Compare this week with last week', `
// Two 7-day windows ending now. Orders count in the week they were placed; refunds
// count in the week they were issued. Cancelled and test orders are excluded.
const now = Date.now(), week = 7 * 864e5;
const which = iso => { const t = now - new Date(iso).getTime(); return t < 0 ? null : t < week ? 'this' : t < 2 * week ? 'last' : null; };
const blank = () => ({ orders: 0, revenue: 0, units: 0, discounts: 0, discounted_orders: 0, refunds: 0, refund_count: 0, new_customers: 0, codes: {}, products: {} });
const W = { this: blank(), last: blank() };
const excluded = { cancelled: 0, test: 0 };
for (const { json: o } of $input.all()) {
  for (const r of o.refunds) { const w = which(r.at); if (w && r.amount > 0) { W[w].refunds += r.amount; W[w].refund_count++; } }
  if (o.cancelled) { excluded.cancelled++; continue; }
  if (o.test) { excluded.test++; continue; }
  const w = which(o.created_at); if (!w) continue;
  const s = W[w];
  s.orders++; s.revenue += o.total;
  if (o.first_order) s.new_customers++;
  if (o.discounts > 0) { s.discounts += o.discounts; s.discounted_orders++; }
  for (const c of o.codes) s.codes[c] = (s.codes[c] || 0) + 1;
  for (const l of o.lines) {
    const p = s.products[l.title] ||= { units: 0, revenue: 0 };
    p.units += l.qty; p.revenue += l.qty * l.price; s.units += l.qty;
  }
}
const r2 = n => Math.round(n * 100) / 100;
for (const s of Object.values(W)) { s.revenue = r2(s.revenue); s.refunds = r2(s.refunds); s.discounts = r2(s.discounts); s['net'] = r2(s.revenue - s.refunds); s.aov = s.orders ? r2(s.revenue / s.orders) : 0; }
const pct = (a, b) => b ? Math.round((a - b) / b * 1000) / 10 : null;
const top = Object.entries(W.this.products).map(([title, p]) => ({ title, ...p, last: W.last.products[title]?.revenue || 0,
  change: pct(p.revenue, W.last.products[title]?.revenue || 0) })).sort((a, b) => b.revenue - a.revenue);
return [{ json: { this_week: W.this, last_week: W.last, top, excluded,
  change: { revenue: pct(W.this.revenue, W.last.revenue), orders: pct(W.this.orders, W.last.orders), aov: pct(W.this.aov, W.last.aov) } } }];`),
    code('Write the sales digest', `
// Slack mrkdwn. Arrows show direction; a product with no sales last week says "new".
const cfg = $('config').first().json;
const d = $input.first().json;
const T = d.this_week, L = d.last_week;
const money = n => new Intl.NumberFormat(cfg.locale, { style: 'currency', currency: cfg.currency }).format(n);
const ch = p => p === null ? 'new' : (p >= 0 ? '▲ ' : '▼ ') + Math.abs(p) + '%';
const day = n => new Date(Date.now() - n * 864e5).toISOString().slice(5, 10);
const codes = Object.entries(T.codes).sort((a, b) => b[1] - a[1]).map(([c, n]) => c + ' x' + n).join(', ');
const lines = [
  '*Weekly sales* ' + day(7) + ' to ' + day(0) + (cfg.mode === 'preview' ? ' (dry run)' : ''),
  'Revenue ' + money(T.revenue) + ' (' + ch(d.change.revenue) + ') · Orders ' + T.orders + ' (' + ch(d.change.orders) + ') · AOV ' + money(T.aov) + ' (' + ch(d.change.aov) + ')',
  'Refunds ' + money(T.refunds) + ' on ' + T.refund_count + ' order' + (T.refund_count === 1 ? '' : 's') + ' · Net ' + money(T['net']),
  'Discounts ' + money(T.discounts) + ' on ' + T.discounted_orders + ' of ' + T.orders + ' orders' + (codes ? ' (' + codes + ')' : ''),
  'Customers: ' + T.new_customers + ' new, ' + (T.orders - T.new_customers) + ' returning',
  '', '*Top products*',
  ...d.top.slice(0, cfg.top_products).map((p, i) => (i + 1) + '. ' + p.title + ': ' + money(p.revenue) + ', ' + p.units + ' units (' + ch(p.change) + ')'),
];
if (d.excluded.cancelled || d.excluded.test) lines.push('', '_Left out: ' + d.excluded.cancelled + ' cancelled, ' + d.excluded.test + ' test orders._');
return [{ json: { text: lines.join('\\n') } }];`),
    ifTrue('Slack channel set?', cfg('slack_enabled')),
    stop('STOP: no Slack channel'),
    ifTrue('Live run?', cfg('live')),
    stop('STOP: dry run - nothing posted'),
    slack.post('Post the digest to Slack', cfg('slack_channel_id'), '$json.text'),
  ],
  edges: [
    ['Run manually', 'config'], ['Every Monday at 08:30', 'config'],
    ['config', 'Shopify connected?'],
    ['Shopify connected?', 0, 'Fetch orders from the last 14 days'], ['Shopify connected?', 1, 'Load sample orders'],
    ['Fetch orders from the last 14 days', 'Read Shopify orders'],
    ['Read Shopify orders', 'Combine order sources'], ['Load sample orders', 0, 'Combine order sources', 1],
    ['Combine order sources', 'Compare this week with last week'],
    ['Compare this week with last week', 'Write the sales digest'],
    ['Write the sales digest', 'Slack channel set?'],
    ['Slack channel set?', 0, 'Live run?'], ['Slack channel set?', 1, 'STOP: no Slack channel'],
    ['Live run?', 0, 'Post the digest to Slack'], ['Live run?', 1, 'STOP: dry run - nothing posted'],
  ],
  groups: [
    { title: 'Start and settings', why: 'Runs Monday at 08:30 so the 7-day window covers the full previous week. Formatting and how many products to list live in `config`.', nodes: ['Run manually', 'Every Monday at 08:30', 'config'] },
    { title: 'Read two weeks of orders', why: 'One read covers both weeks, so this week and last are always counted the same way. `Load sample orders` includes a cancelled and a test order to show they are left out.', nodes: ['Shopify connected?', 'Fetch orders from the last 14 days', 'Read Shopify orders', 'Load sample orders', 'Combine order sources'] },
    { title: 'Compare the weeks', why: 'Refunds land in the week they were issued, which is when the money left. Product revenue is line price times quantity, before order-level discounts, so a promotion does not make a product look weaker.', nodes: ['Compare this week with last week', 'Write the sales digest'] },
    { title: 'Post to Slack', why: 'The digest text is built on every run so a dry run can be read in the execution. A blank channel and a dry run each end on their own STOP.', nodes: ['Slack channel set?', 'STOP: no Slack channel', 'Live run?', 'STOP: dry run - nothing posted', 'Post the digest to Slack'] },
  ],
  scenarios: [
    {
      name: 'shipped config (dry run)', start: 'Run manually',
      expect: { reached: ['Load sample orders', 'STOP: no Slack channel'], outward: 'none' },
      check: out => {
        const f: string[] = [];
        const d = out['Compare this week with last week'][0];
        const T = d.this_week, L = d.last_week;
        if (T.orders !== 7 || L.orders !== 5) f.push(`orders should be 7 and 5, got ${T.orders} and ${L.orders}`);
        if (T.revenue !== 326.5 || L.revenue !== 286) f.push(`revenue should be 326.5 and 286, got ${T.revenue} and ${L.revenue}`);
        if (T.refunds !== 40 || T['net'] !== 286.5) f.push(`refunds 40 and net 286.5 expected, got ${T.refunds} / ${T['net']}`);
        if (T.aov !== 46.64) f.push(`AOV should be 46.64, got ${T.aov}`);
        if (d.change.revenue !== 14.2) f.push(`revenue change should be 14.2%, got ${d.change.revenue}`);
        if (T.discounted_orders !== 2 || T.discounts !== 18.5) f.push('2 discounted orders totalling 18.5 expected');
        if (d.top[0].title !== 'Cold brew kit' || d.top[0].revenue !== 160 || d.top[0].change !== 100) f.push('top product should be Cold brew kit at 160, +100%');
        if (d.excluded.cancelled !== 1 || d.excluded.test !== 1) f.push('one cancelled and one test order should be left out');
        if (T.new_customers !== 3) f.push(`3 new customers expected, got ${T.new_customers}`);
        return f;
      },
    },
    {
      name: 'live with Shopify and Slack', start: 'Every Monday at 08:30',
      overrides: { USE_SHOPIFY: true, DRY_RUN: false, SLACK_CHANNEL_ID: 'C0SALES', CURRENCY: 'EUR', LOCALE: 'de-DE' },
      mocks: {
        'Fetch orders from the last 14 days': [{ orders: [
          { id: 1, created_at: new Date(Date.now() - 2 * 864e5).toISOString(), cancelled_at: null, test: false, total_price: '100.00', total_discounts: '0.00', discount_codes: [],
            line_items: [{ title: 'Desk mat', quantity: 2, price: '50.00' }], customer: { orders_count: 4 },
            refunds: [{ created_at: new Date(Date.now() - 864e5).toISOString(), transactions: [{ kind: 'refund', status: 'success', amount: '50.00' }] }] },
          { id: 2, created_at: new Date(Date.now() - 9 * 864e5).toISOString(), cancelled_at: null, test: false, total_price: '80.00', total_discounts: '0.00', discount_codes: [],
            line_items: [{ title: 'Desk mat', quantity: 1, price: '50.00' }, { title: 'Pen cup', quantity: 1, price: '30.00' }], customer: { orders_count: 1 }, refunds: [] },
        ] }],
        'Post the digest to Slack': [{ ok: true }],
      },
      expect: { reached: ['Post the digest to Slack'], notReached: ['Load sample orders'], outward: 'some' },
      check: out => {
        const f: string[] = [];
        const d = out['Compare this week with last week'][0];
        if (d.this_week.net !== 50 || d.change.revenue !== 25) f.push(`net 50 and +25% expected, got ${d.this_week.net} / ${d.change.revenue}`);
        if (!out['Write the sales digest'][0].text.includes('Desk mat')) f.push('digest should list Desk mat');
        return f;
      },
    },
  ],
});
