import { defineSpec } from '../_kit/spec';
import { trigger, code, ifTrue, merge, stop, http, slack, sheets } from '../_kit/n';

const cfg = (k: string) => `$('config').first().json.${k}`;

// One Shopify order in the REST shape, for the live scenarios.
const shopOrder = (id: number, daysAgo: number, lines: [string, number, number][], extra: any = {}) => ({
  id, created_at: new Date(Date.now() - daysAgo * 864e5).toISOString(), cancelled_at: null, test: false,
  total_price: String(lines.reduce((s, [, q, p]) => s + q * p, 0)), total_discounts: '0.00', discount_codes: [],
  line_items: lines.map(([title, quantity, price]) => ({ title, quantity, price: String(price) })), customer: { orders_count: 3 }, refunds: [], ...extra,
});

export default defineSpec({
  slug: 'shopify-weekly-sales-digest',
  title: 'Post a weekly Shopify sales digest by product to Slack',
  summary: 'Every Monday reads 14 days of Shopify orders one day at a time, compares the last 7 days with the 7 before and with a trailing 4-week average kept in Google Sheets, names products that are falling, and posts one Slack digest. A failed or capped read is reported instead of a misleading digest.',
  category: 'E-commerce',
  description: {
    who: 'Shopify store owners and small e-commerce teams who want Monday\'s numbers in the team channel without opening Shopify Analytics, and who want to know whether a good or bad week is unusual or just normal noise.',
    how: [
      'Every Monday at 08:30 it reads the last 14 days of orders from Shopify as 14 one-day requests, or sample orders until Shopify is connected. A day that fails to load, or hits the 250-order page limit, is recorded.',
      'If any day failed, the digest is not built. Slack gets a short notice naming the failed days instead of a report with missing revenue.',
      'Cancelled and test orders are dropped. For each week it totals revenue, orders, average order value, units, discount codes and new versus returning customers. Refunds count in the week they were issued.',
      'This week is compared with last week and with the average of the previous `BASELINE_WEEKS` weeks read from a Weekly sales tab. Products whose revenue fell by `FALLING_DROP_PCT` or more are named.',
      'The digest is posted to Slack and this week\'s totals are upserted into the Weekly sales tab, keyed on the week, so a rerun does not add a second row.',
    ],
    setup: [
      'Run it once as imported. It builds the digest from sample orders and sample history and stops at `STOP: no Slack channel` and `STOP: history not saved`.',
      'Add a Shopify access token credential to `Fetch one day of orders`, set `SHOP_DOMAIN` and `USE_SHOPIFY = true`.',
      'Create a Weekly sales tab with columns Week, Revenue, Orders, AOV, Refunds, Net, New customers. Connect Google Sheets and set `HISTORY_SHEET_ID`.',
      'Add a Slack credential and set `SLACK_CHANNEL_ID`, then set `DRY_RUN = false` to post and save every Monday.',
    ],
    requirements: ['A Shopify store', 'A custom app token with read_orders', 'A Slack workspace', 'Optional: a Google Sheet for the weekly history'],
    customize: [
      '`TOP_PRODUCTS` sets how many products the digest lists.',
      '`BASELINE_WEEKS`, `FALLING_DROP_PCT` and `FALLING_MIN_REVENUE` control the trend line and which products are called out.',
      '`CURRENCY` and `LOCALE` control number formatting. Change the schedule on `Every Monday at 08:30` for a different reporting day.',
    ],
  },
  config: {
    intro: ['USE_SHOPIFY false -> SAMPLE orders. HISTORY_SHEET_ID blank -> SAMPLE history, nothing saved.', 'SLACK_CHANNEL_ID blank -> nothing is posted. DRY_RUN true -> the digest is built and shown, not posted or saved.'],
    consts: [
      { name: 'USE_SHOPIFY', value: false, note: 'set true after adding the Shopify credential to the fetch node' },
      { name: 'SHOP_DOMAIN', value: 'your-store.myshopify.com', note: 'your myshopify.com domain' },
      { name: 'TOP_PRODUCTS', value: 5, note: 'products listed in the digest' },
      { name: 'HISTORY_SHEET_ID', value: '', note: 'Google Sheets id with a Weekly sales tab; blank uses sample history and saves nothing' },
      { name: 'BASELINE_WEEKS', value: 4, note: 'earlier weeks averaged for the trend line' },
      { name: 'FALLING_DROP_PCT', value: 30, note: 'a product whose revenue fell by this percent or more is called out' },
      { name: 'FALLING_MIN_REVENUE', value: 50, note: 'only products that made at least this much last week can be called out' },
      { name: 'CURRENCY', value: 'USD', note: 'currency for formatting' },
      { name: 'LOCALE', value: 'en-US', note: 'number format' },
      { name: 'SLACK_CHANNEL_ID', value: '', note: 'channel for the digest; blank posts nothing' },
    ],
    flags: { slack_enabled: "SLACK_CHANNEL_ID.trim() !== ''", history_enabled: "HISTORY_SHEET_ID.trim() !== ''" },
    safety: 'dry_run',
  },
  nodes: [
    trigger.manual(),
    trigger.schedule('Every Monday at 08:30', '30 8 * * 1'),
    ifTrue('Shopify connected?', cfg('use_shopify')),
    code('Build one request per day', `
// 14 one-day windows ending now. Shopify returns at most 250 orders per request, so
// asking one day at a time keeps a busy week from being cut off silently; a day
// that still returns 250 is reported as capped.
const now = Date.now();
return Array.from({ length: 14 }, (_, i) => ({ json: {
  label: new Date(now - (i + 1) * 864e5).toISOString().slice(0, 10),
  min: new Date(now - (i + 1) * 864e5).toISOString(),
  max: new Date(now - i * 864e5).toISOString(),
} }));`),
    http('Fetch one day of orders', {
      url: `={{ 'https://' + ${cfg('shop_domain')} + '/admin/api/2024-10/orders.json' }}`, auth: 'shopifyAccessTokenApi',
      query: { status: 'any', limit: '250', created_at_min: '={{ $json.min }}', created_at_max: '={{ $json.max }}',
        fields: 'id,created_at,cancelled_at,test,total_price,total_discounts,discount_codes,line_items,refunds,customer' },
      continueOnError: true,
    }),
    code('Read Shopify orders', `
// One response per day, in request order. A failed day arrives as an item with an
// error; it is listed, not skipped, so the digest never under-reports quietly.
// Refund amounts come from refund transactions so a partial refund counts for what was returned.
const days = $('Build one request per day').all().map(i => i.json);
const seen = new Set(), orders = [], failed_days = [], capped_days = [];
$input.all().forEach((it, i) => {
  const day = days[i]?.label || 'day ' + (i + 1);
  if (it.json.error) { failed_days.push({ day, error: String(it.json.error.message || it.json.error).slice(0, 120) }); return; }
  const list = it.json.orders || [];
  if (list.length >= 250) capped_days.push(day);
  for (const o of list) {
    if (seen.has(o.id)) continue; seen.add(o.id);
    orders.push({
      id: o.id, created_at: o.created_at, cancelled: Boolean(o.cancelled_at), test: Boolean(o.test),
      total: Number(o.total_price || 0), discounts: Number(o.total_discounts || 0), codes: (o.discount_codes || []).map(d => d.code.toUpperCase()),
      lines: (o.line_items || []).map(l => ({ title: l.title, qty: l.quantity, price: Number(l.price) })),
      refunds: (o.refunds || []).map(r => ({ at: r.created_at, amount: (r.transactions || []).filter(t => t.kind === 'refund' && t.status !== 'failure').reduce((s, t) => s + Number(t.amount), 0) })),
      first_order: Number(o.customer?.orders_count || 1) <= 1,
    });
  }
});
return [{ json: { orders, failed_days, capped_days, days_read: $input.all().length - failed_days.length } }];`),
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
const orders = [
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
];
return [{ json: { orders, failed_days: [], capped_days: [], days_read: 14 } }];`),
    merge('Combine order sources'),
    ifTrue('Every day read?', '$json.failed_days.length === 0'),
    code('Write the failed-read notice', `
// A digest built from a partial read would show a fall in revenue that never happened,
// so a failed day replaces the digest with a notice and nothing is saved to history.
const cfg = $('config').first().json;
const d = $input.first().json;
const lines = [
  ':warning: *Weekly sales digest not built*' + (cfg.mode === 'preview' ? ' (dry run)' : ''),
  'Shopify did not return orders for ' + d.failed_days.length + ' of 14 days, so the totals would be wrong:',
  ...d.failed_days.map(f => '- ' + f.day + ': ' + f.error),
  'Run the workflow again once Shopify responds. History was not updated.',
];
return [{ json: { text: lines.join('\\n'), failed: true } }];`),
    ifTrue('Notice can be posted?', `${cfg('slack_enabled')} && ${cfg('live')}`),
    stop('STOP: notice not posted'),
    slack.post('Post the failed-read notice', cfg('slack_channel_id'), '$json.text'),
    ifTrue('History sheet set?', cfg('history_enabled')),
    sheets.read('Read the weekly history', cfg('history_sheet_id'), 'Weekly sales'),
    code('Load sample history', `
// Used until HISTORY_SHEET_ID is set: the four weeks before this one.
const wk = n => new Date(Date.now() - n * 7 * 864e5).toISOString().slice(0, 10);
return [[1, 286], [2, 240], [3, 300], [4, 274]].map(([n, revenue]) => ({ json: { Week: wk(n + 1), Revenue: revenue, Orders: 5 } }));`),
    merge('Combine history sources'),
    code('Compare this week with last week', `
// Two 7-day windows ending now. Orders count in the week they were placed; refunds
// count in the week they were issued. Cancelled and test orders are excluded.
// The baseline is the average revenue of the BASELINE_WEEKS saved weeks before this one.
const cfg = $('config').first().json;
const src = $('Combine order sources').first().json;
const now = Date.now(), week = 7 * 864e5;
const week_start = new Date(now - week).toISOString().slice(0, 10);
const which = iso => { const t = now - new Date(iso).getTime(); return t < 0 ? null : t < week ? 'this' : t < 2 * week ? 'last' : null; };
const blank = () => ({ orders: 0, revenue: 0, units: 0, discounts: 0, discounted_orders: 0, refunds: 0, refund_count: 0, new_customers: 0, codes: {}, products: {} });
const W = { this: blank(), last: blank() };
const excluded = { cancelled: 0, test: 0 };
for (const o of src.orders) {
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
// Falling: sold at least FALLING_MIN_REVENUE last week and dropped by FALLING_DROP_PCT or more (including to zero).
const falling = Object.entries(W.last.products).filter(([, p]) => p.revenue >= cfg.falling_min_revenue)
  .map(([title, p]) => ({ title, last: p.revenue, now: W.this.products[title]?.revenue || 0 }))
  .map(p => ({ ...p, change: pct(p.now, p.last) })).filter(p => p.change <= -cfg.falling_drop_pct).sort((a, b) => a.change - b.change);
// Baseline from saved weeks strictly before this one; a rerun of this week is ignored.
const history = $input.all().map(i => i.json).filter(r => r.Week && String(r.Week).slice(0, 10) < week_start)
  .sort((a, b) => String(b.Week).localeCompare(String(a.Week))).slice(0, cfg.baseline_weeks);
const baseline = history.length >= 2 ? r2(history.reduce((s, r) => s + Number(r.Revenue || 0), 0) / history.length) : null;
return [{ json: { week_start, this_week: W.this, last_week: W.last, top, falling, excluded, capped_days: src.capped_days,
  baseline: { weeks: history.length, revenue: baseline, change: baseline === null ? null : pct(W.this.revenue, baseline) },
  change: { revenue: pct(W.this.revenue, W.last.revenue), orders: pct(W.this.orders, W.last.orders), aov: pct(W.this.aov, W.last.aov) } } }];`),
    code('Write the sales digest', `
// Slack mrkdwn. Arrows show direction; a product with no sales last week says "new".
const cfg = $('config').first().json;
const d = $input.first().json;
const T = d.this_week;
const money = n => new Intl.NumberFormat(cfg.locale, { style: 'currency', currency: cfg.currency }).format(n);
const ch = p => p === null ? 'new' : (p >= 0 ? '▲ ' : '▼ ') + Math.abs(p) + '%';
const day = n => new Date(Date.now() - n * 864e5).toISOString().slice(5, 10);
const codes = Object.entries(T.codes).sort((a, b) => b[1] - a[1]).map(([c, n]) => c + ' x' + n).join(', ');
const lines = [
  '*Weekly sales* ' + day(7) + ' to ' + day(0) + (cfg.mode === 'preview' ? ' (dry run)' : ''),
  'Revenue ' + money(T.revenue) + ' (' + ch(d.change.revenue) + ') · Orders ' + T.orders + ' (' + ch(d.change.orders) + ') · AOV ' + money(T.aov) + ' (' + ch(d.change.aov) + ')',
  d.baseline.revenue === null ? '_No ' + cfg.baseline_weeks + '-week baseline yet (' + d.baseline.weeks + ' saved week' + (d.baseline.weeks === 1 ? '' : 's') + ')._'
    : 'Against the ' + d.baseline.weeks + '-week average of ' + money(d.baseline.revenue) + ': ' + ch(d.baseline.change),
  'Refunds ' + money(T.refunds) + ' on ' + T.refund_count + ' order' + (T.refund_count === 1 ? '' : 's') + ' · Net ' + money(T['net']),
  'Discounts ' + money(T.discounts) + ' on ' + T.discounted_orders + ' of ' + T.orders + ' orders' + (codes ? ' (' + codes + ')' : ''),
  'Customers: ' + T.new_customers + ' new, ' + (T.orders - T.new_customers) + ' returning',
  '', '*Top products*',
  ...d.top.slice(0, cfg.top_products).map((p, i) => (i + 1) + '. ' + p.title + ': ' + money(p.revenue) + ', ' + p.units + ' units (' + ch(p.change) + ')'),
];
if (d.falling.length) lines.push('', '*Falling*', ...d.falling.map(p => '- ' + p.title + ': ' + money(p.now) + ' from ' + money(p.last) + ' (' + ch(p.change) + ')'));
if (d.capped_days.length) lines.push('', ':warning: _' + d.capped_days.join(', ') + ' returned 250 orders, the page limit, so totals for those days may be low._');
if (d.excluded.cancelled || d.excluded.test) lines.push('', '_Left out: ' + d.excluded.cancelled + ' cancelled, ' + d.excluded.test + ' test orders._');
return [{ json: { text: lines.join('\\n') } }];`),
    ifTrue('Save the week to history?', `${cfg('history_enabled')} && ${cfg('live')}`),
    stop('STOP: history not saved'),
    code('Shape the history row', `
// One row per week, keyed on Week, so rerunning on the same Monday updates the row.
const d = $('Compare this week with last week').first().json;
const T = d.this_week;
return [{ json: { Week: d.week_start, Revenue: T.revenue, Orders: T.orders, AOV: T.aov, Refunds: T.refunds, Net: T['net'], 'New customers': T.new_customers } }];`),
    sheets.upsert('Upsert the week in history', cfg('history_sheet_id'), 'Weekly sales', 'Week'),
    ifTrue('Slack channel set?', cfg('slack_enabled')),
    stop('STOP: no Slack channel'),
    ifTrue('Live run?', cfg('live')),
    stop('STOP: dry run - nothing posted'),
    slack.post('Post the digest to Slack', cfg('slack_channel_id'), '$json.text'),
  ],
  edges: [
    ['Run manually', 'config'], ['Every Monday at 08:30', 'config'],
    ['config', 'Build one request per day'],
    ['Build one request per day', 'Shopify connected?'],
    ['Shopify connected?', 0, 'Fetch one day of orders'], ['Shopify connected?', 1, 'Load sample orders'],
    ['Fetch one day of orders', 'Read Shopify orders'],
    ['Read Shopify orders', 'Combine order sources'], ['Load sample orders', 0, 'Combine order sources', 1],
    ['Combine order sources', 'Every day read?'],
    ['Every day read?', 0, 'History sheet set?'], ['Every day read?', 1, 'Write the failed-read notice'],
    ['History sheet set?', 0, 'Read the weekly history'], ['History sheet set?', 1, 'Load sample history'],
    ['Read the weekly history', 'Combine history sources'], ['Load sample history', 0, 'Combine history sources', 1],
    ['Combine history sources', 'Compare this week with last week'],
    ['Compare this week with last week', 'Write the sales digest'],
    ['Write the sales digest', 'Save the week to history?'],
    ['Save the week to history?', 0, 'Shape the history row'], ['Save the week to history?', 1, 'STOP: history not saved'],
    ['Shape the history row', 'Upsert the week in history'],
    ['Write the sales digest', 'Slack channel set?'],
    ['Write the failed-read notice', 'Notice can be posted?'],
    ['Notice can be posted?', 0, 'Post the failed-read notice'], ['Notice can be posted?', 1, 'STOP: notice not posted'],
    ['Slack channel set?', 0, 'Live run?'], ['Slack channel set?', 1, 'STOP: no Slack channel'],
    ['Live run?', 0, 'Post the digest to Slack'], ['Live run?', 1, 'STOP: dry run - nothing posted'],
  ],
  groups: [
    { title: 'Start and settings', why: 'Runs Monday at 08:30 so the 7-day window covers the full previous week. Formatting, the baseline length and the falling-product thresholds live in `config`.', nodes: ['Run manually', 'Every Monday at 08:30', 'config'] },
    { title: 'Read two weeks of orders', why: '`Build one request per day` splits 14 days into one-day reads so the 250-order page limit applies per day, not per fortnight. `Fetch one day of orders` keeps going on an error so `Read Shopify orders` can name the failed day.', nodes: ['Build one request per day', 'Shopify connected?', 'Fetch one day of orders', 'Read Shopify orders', 'Load sample orders', 'Combine order sources'] },
    { title: 'Stop on a failed read', why: 'A missing day would look like a sales drop. `Every day read?` sends any gap to `Write the failed-read notice`, which is posted in place of the digest. The history write is never reached, so a bad week is not saved.', nodes: ['Every day read?', 'Write the failed-read notice', 'Notice can be posted?', 'STOP: notice not posted', 'Post the failed-read notice'] },
    { title: 'Read the weekly history', why: 'The Weekly sales tab holds one row per past week. `Load sample history` stands in until `HISTORY_SHEET_ID` is set, so the baseline line shows on the first run.', nodes: ['History sheet set?', 'Read the weekly history', 'Load sample history', 'Combine history sources'] },
    { title: 'Compare the weeks', why: 'Refunds land in the week they were issued. Product revenue is before order discounts so a promotion does not make a product look weaker. The baseline ignores a saved row for this same week, so a rerun does not compare a week with itself.', nodes: ['Compare this week with last week', 'Write the sales digest'] },
    { title: 'Post and save the week', why: 'The digest is built on every run so a dry run can be read in the execution. Only a live run with a sheet writes history, and `Upsert the week in history` matches on Week, so a second run on one Monday updates the row.', nodes: ['Slack channel set?', 'Save the week to history?', 'STOP: no Slack channel', 'Live run?', 'STOP: history not saved', 'Shape the history row', 'STOP: dry run - nothing posted', 'Post the digest to Slack', 'Upsert the week in history'] },
  ],
  scenarios: [
    {
      name: 'shipped config (dry run)', start: 'Run manually',
      expect: { reached: ['Load sample orders', 'Load sample history', 'STOP: no Slack channel', 'STOP: history not saved'], notReached: ['Write the failed-read notice'], outward: 'none' },
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
        if (d.baseline.weeks !== 4 || d.baseline.revenue !== 275 || d.baseline.change !== 18.7) f.push(`baseline 275 over 4 weeks, +18.7% expected, got ${JSON.stringify(d.baseline)}`);
        if (d.falling.length !== 1 || d.falling[0].title !== 'Gift box' || d.falling[0].change !== -50) f.push(`Gift box should be the only falling product at -50%, got ${JSON.stringify(d.falling)}`);
        if (!out['Write the sales digest'][0].text.includes('*Falling*')) f.push('digest should have a Falling section');
        return f;
      },
    },
    {
      name: 'live with Shopify, history and Slack', start: 'Every Monday at 08:30',
      overrides: { USE_SHOPIFY: true, DRY_RUN: false, SLACK_CHANNEL_ID: 'C0SALES', HISTORY_SHEET_ID: 'sheet123', CURRENCY: 'EUR', LOCALE: 'de-DE' },
      mocks: {
        // one response per requested day; day index 1 is busy enough to hit the page limit
        'Fetch one day of orders': (days: any[]) => days.map((_, i) => ({ orders:
          i === 1 ? [shopOrder(1, 1.5, [['Desk mat', 2, 50]], { customer: { orders_count: 4 },
              refunds: [{ created_at: new Date(Date.now() - 864e5).toISOString(), transactions: [{ kind: 'refund', status: 'success', amount: '50.00' }] }] }),
            ...Array.from({ length: 249 }, (_, k) => shopOrder(1000 + k, 1.6, [['Sticker', 1, 0]]))]
          : i === 8 ? [shopOrder(2, 8.5, [['Desk mat', 1, 50], ['Pen cup', 1, 30]], { customer: { orders_count: 1 } })]
          : [] })),
        'Read the weekly history': [{ row_number: 2, Week: new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10), Revenue: 80 },
          { row_number: 3, Week: new Date(Date.now() - 21 * 864e5).toISOString().slice(0, 10), Revenue: 120 },
          { row_number: 4, Week: new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10), Revenue: 999 }],
        'Upsert the week in history': [{ ok: true }],
        'Post the digest to Slack': [{ ok: true }],
      },
      expect: { reached: ['Read Shopify orders', 'Post the digest to Slack', 'Upsert the week in history'], notReached: ['Load sample orders', 'Load sample history', 'Write the failed-read notice'], outward: 'some' },
      check: out => {
        const f: string[] = [];
        const d = out['Compare this week with last week'][0];
        if (d.this_week.net !== 50 || d.change.revenue !== 25) f.push(`net 50 and +25% expected, got ${d.this_week.net} / ${d.change.revenue}`);
        if (d.baseline.weeks !== 2 || d.baseline.revenue !== 100) f.push(`baseline should average the 2 earlier weeks to 100 and ignore this week's row, got ${JSON.stringify(d.baseline)}`);
        if (d.capped_days.length !== 1) f.push(`one capped day expected, got ${d.capped_days}`);
        const text = out['Write the sales digest'][0].text;
        if (!text.includes('Desk mat') || !text.includes('page limit')) f.push('digest should list Desk mat and warn about the capped day');
        if (d.falling.some((p: any) => p.title === 'Pen cup')) f.push('Pen cup made 30 last week, under FALLING_MIN_REVENUE, so it must not be listed');
        const row = out['Shape the history row'][0];
        if (row.Week !== d.week_start || row.Revenue !== 100) f.push(`history row should be this week at 100, got ${JSON.stringify(row)}`);
        return f;
      },
    },
    {
      name: 'a failed day posts a notice, not a digest', start: 'Every Monday at 08:30',
      overrides: { USE_SHOPIFY: true, DRY_RUN: false, SLACK_CHANNEL_ID: 'C0SALES', HISTORY_SHEET_ID: 'sheet123' },
      mocks: {
        'Fetch one day of orders': (days: any[]) => days.map((_, i) => i === 3 ? { error: { message: 'The service is receiving too many requests from you' } } : { orders: [] }),
        'Post the failed-read notice': [{ ok: true }],
      },
      expect: { reached: ['Write the failed-read notice', 'Post the failed-read notice'], notReached: ['Compare this week with last week', 'Upsert the week in history', 'Post the digest to Slack'], outward: 'some' },
      check: out => {
        const t = out['Write the failed-read notice'][0].text;
        return t.includes('1 of 14 days') && t.includes('too many requests') ? [] : [`notice should name the failed day and error, got: ${t}`];
      },
    },
  ],
});
