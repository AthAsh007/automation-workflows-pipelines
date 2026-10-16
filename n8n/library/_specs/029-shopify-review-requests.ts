import { defineSpec } from '../_kit/spec';
import { trigger, code, ifTrue, merge, stop, http, gmail } from '../_kit/n';

const cfg = (k: string) => `$('config').first().json.${k}`;

export default defineSpec({
  slug: 'shopify-review-requests',
  title: 'Request reviews by Gmail for delivered Shopify orders',
  summary: 'Each day emails customers whose Shopify order was delivered 7 to 21 days ago, linking straight to the review page of the main product they bought, and skips refunded, cancelled and opted-out orders and anyone asked in the last 90 days.',
  category: 'E-commerce',
  description: {
    who: 'Shopify stores that want more product reviews but do not want to email the same customer every week or ask someone whose order went wrong.',
    how: [
      'Every day at 11:00 it reads Shopify orders fulfilled in the last 60 days, or 9 sample orders until Shopify is connected.',
      'Delivery date comes from carrier tracking; without tracking it assumes delivery 5 days after fulfilment.',
      'An order is asked about 7 to 21 days after delivery. Refunded, cancelled and `no-review` orders are skipped, and so is any customer tagged as asked in the last 90 days.',
      'The email names the most expensive item in the order and links to its review page from `REVIEW_LINKS`, or to a page built from `DEFAULT_REVIEW_URL`.',
      'After a live send the customer gets a dated `review-requested-YYYY-MM-DD` tag, which is how the 90 days are counted.',
    ],
    setup: [
      'Run it once as imported. It previews against sample orders and stops at `STOP: preview - nothing sent`.',
      'Add a Shopify access token credential to `Fetch fulfilled orders` and `Tag the customer in Shopify`, set `SHOP_DOMAIN` and `USE_SHOPIFY = true`.',
      'Connect Gmail, fill `REVIEW_LINKS` for your main products and check `STORE_NAME`.',
      'Put your address in `TEST_EMAIL` to receive every request yourself, then set `TEST_RUN = false`.',
    ],
    requirements: ['A Shopify store', 'A custom app token with read_orders and write_customers', 'A Gmail account'],
    customize: [
      '`REQUEST_AFTER_DAYS` and `MAX_DAYS_AFTER_DELIVERY` set the window.',
      '`COOLDOWN_DAYS` sets how long a customer rests between requests.',
      '`DAILY_CAP` limits sends per run.',
    ],
  },
  config: {
    intro: ['USE_SHOPIFY false -> SAMPLE orders.', 'TEST_RUN true + TEST_EMAIL blank -> preview only. Shopify is only tagged on a live run.'],
    consts: [
      { name: 'USE_SHOPIFY', value: false, note: 'set true after adding the Shopify credential to both Shopify nodes' },
      { name: 'SHOP_DOMAIN', value: 'your-store.myshopify.com', note: 'your myshopify.com domain' },
      { name: 'STORE_NAME', value: 'Fernway Home', note: 'used in the subject and sign-off' },
      { name: 'REQUEST_AFTER_DAYS', value: 7, note: 'days after delivery before asking' },
      { name: 'MAX_DAYS_AFTER_DELIVERY', value: 21, note: 'after this many days the order is not asked about' },
      { name: 'ASSUME_DELIVERY_DAYS', value: 5, note: 'without tracking, delivery is assumed this many days after fulfilment' },
      { name: 'COOLDOWN_DAYS', value: 90, note: 'one request per customer in this many days' },
      { name: 'REVIEW_LINKS', value: { '7001': 'https://reviews.fernway.example/linen-duvet-set', '7003': 'https://reviews.fernway.example/wool-throw' }, note: 'Shopify product id -> review page' },
      { name: 'DEFAULT_REVIEW_URL', value: 'https://www.fernway.example/pages/review?product={product_id}&order={order}', note: 'used when a product has no entry in REVIEW_LINKS' },
      { name: 'SKIP_TAGS', value: ['no-review', 'wholesale'], note: 'order or customer tags that are never asked' },
      { name: 'DAILY_CAP', value: 50, note: 'hard ceiling on requests per run' },
    ],
    safety: 'test_run',
  },
  nodes: [
    trigger.manual(),
    trigger.schedule('Every day at 11:00', '0 11 * * *'),
    ifTrue('Shopify connected?', cfg('use_shopify')),
    http('Fetch fulfilled orders', {
      url: `={{ 'https://' + ${cfg('shop_domain')} + '/admin/api/2024-10/orders.json' }}`, auth: 'shopifyAccessTokenApi',
      query: { status: 'any', fulfillment_status: 'shipped', limit: '250', created_at_min: '={{ new Date(Date.now() - 60 * 864e5).toISOString() }}',
        fields: 'id,name,email,customer,financial_status,cancelled_at,tags,fulfillments,line_items' },
    }),
    code('Read Shopify orders', `
// Orders -> the fields the picker needs. delivered_at is the newest fulfilment
// whose carrier status is delivered; fulfilled_at is the fallback.
const out = [];
for (const page of $input.all()) for (const o of page.json.orders || []) {
  const fs = o.fulfillments || [];
  const delivered = fs.filter(f => f.shipment_status === 'delivered').map(f => f.updated_at).sort().pop() || null;
  out.push({ json: {
    id: o.id, name: o.name, email: (o.email || o.customer?.email || '').toLowerCase(), first_name: o.customer?.first_name || '',
    customer_id: o.customer?.id || null, customer_tags: String(o.customer?.tags || ''), order_tags: String(o.tags || ''),
    financial_status: o.financial_status, cancelled: Boolean(o.cancelled_at), delivered_at: delivered,
    fulfilled_at: fs.map(f => f.created_at).sort()[0] || null,
    line_items: (o.line_items || []).map(li => ({ product_id: String(li.product_id), title: li.title, price: Number(li.price), quantity: li.quantity })),
  } });
}
return out;`),
    code('Load sample orders', `
// Used until USE_SHOPIFY is true. Two should be asked; every other one shows a skip rule.
const ago = d => new Date(Date.now() - d * 864e5).toISOString();
const items = (...a) => a.map(([product_id, title, price]) => ({ product_id, title, price, quantity: 1 }));
return [
  { id: 1, name: '#1041', email: 'ruth@meadowbank.example', first_name: 'Ruth', customer_id: 501, customer_tags: '', order_tags: '', financial_status: 'paid', cancelled: false, delivered_at: ago(8), fulfilled_at: ago(11), line_items: items(['7001', 'Linen duvet set', 189], ['7002', 'Pillowcase pair', 39]) },
  { id: 2, name: '#1042', email: 'abe@northgate.example', first_name: 'Abe', customer_id: 502, customer_tags: '', order_tags: '', financial_status: 'paid', cancelled: false, delivered_at: ago(3), fulfilled_at: ago(6), line_items: items(['7003', 'Wool throw', 120]) },
  { id: 3, name: '#1043', email: 'cleo@riverside.example', first_name: 'Cleo', customer_id: 503, customer_tags: '', order_tags: '', financial_status: 'refunded', cancelled: false, delivered_at: ago(9), fulfilled_at: ago(12), line_items: items(['7003', 'Wool throw', 120]) },
  { id: 4, name: '#1044', email: 'dev@hillcrest.example', first_name: 'Dev', customer_id: 504, customer_tags: '', order_tags: '', financial_status: 'voided', cancelled: true, delivered_at: null, fulfilled_at: ago(10), line_items: items(['7002', 'Pillowcase pair', 39]) },
  { id: 5, name: '#1045', email: 'eve@stonebridge.example', first_name: 'Eve', customer_id: 505, customer_tags: 'vip, review-requested-' + ago(40).slice(0, 10), order_tags: '', financial_status: 'paid', cancelled: false, delivered_at: ago(10), fulfilled_at: ago(13), line_items: items(['7001', 'Linen duvet set', 189]) },
  { id: 6, name: '#1046', email: 'finn@oakridge.example', first_name: 'Finn', customer_id: 506, customer_tags: '', order_tags: '', financial_status: 'paid', cancelled: false, delivered_at: null, fulfilled_at: ago(13), line_items: items(['7004', 'Waffle bath towel', 45], ['7005', 'Hand towel', 18]) },
  { id: 7, name: '#1047', email: 'gus@lakeview.example', first_name: 'Gus', customer_id: 507, customer_tags: '', order_tags: '', financial_status: 'paid', cancelled: false, delivered_at: ago(30), fulfilled_at: ago(33), line_items: items(['7003', 'Wool throw', 120]) },
  { id: 8, name: '#1048', email: 'hana@elmstead.example', first_name: 'Hana', customer_id: 508, customer_tags: '', order_tags: 'no-review', financial_status: 'paid', cancelled: false, delivered_at: ago(9), fulfilled_at: ago(12), line_items: items(['7002', 'Pillowcase pair', 39]) },
  { id: 9, name: '#1049', email: 'ruth@meadowbank.example', first_name: 'Ruth', customer_id: 501, customer_tags: '', order_tags: '', financial_status: 'partially_paid', cancelled: false, delivered_at: ago(7.5), fulfilled_at: ago(10), line_items: items(['7003', 'Wool throw', 120]) },
].map(json => ({ json }));`),
    merge('Combine order sources'),
    code('Pick orders to ask about', `
// One request per customer per COOLDOWN_DAYS, counted from the dated tag left on the
// customer by an earlier live send. Inside one run the earliest delivery wins.
const cfg = $('config').first().json;
const now = Date.now();
const days = iso => (now - new Date(iso).getTime()) / 864e5;
const tagsOf = s => String(s || '').split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
const lastAsked = tags => tags.filter(t => t.startsWith('review-requested-')).map(t => t.slice(17)).sort().pop() || null;
const rows = $input.all().map(i => i.json).map(o => ({ ...o,
  delivered: o.delivered_at || (o.fulfilled_at ? new Date(new Date(o.fulfilled_at).getTime() + cfg.assume_delivery_days * 864e5).toISOString() : null),
  assumed: !o.delivered_at })).sort((a, b) => String(a.delivered).localeCompare(String(b.delivered)));
const picked = [], held = [], asking = {};
for (const o of rows) {
  const tags = [...tagsOf(o.order_tags), ...tagsOf(o.customer_tags)];
  const asked = lastAsked(tagsOf(o.customer_tags));
  const since = o.delivered ? days(o.delivered) : null;
  const reason =
    !o.email ? 'no email' :
    o.cancelled ? 'cancelled' :
    /refunded|voided/.test(o.financial_status) ? o.financial_status :
    tags.some(t => cfg.skip_tags.includes(t)) ? 'tagged ' + tags.find(t => cfg.skip_tags.includes(t)) :
    since === null ? 'not delivered' :
    since < cfg.request_after_days ? 'delivered ' + Math.floor(since) + ' days ago, too soon' :
    since > cfg.max_days_after_delivery ? 'delivered ' + Math.floor(since) + ' days ago, too late' :
    asked && days(asked) < cfg.cooldown_days ? 'customer asked ' + Math.floor(days(asked)) + ' days ago' :
    asking[o.email] ? 'already asking this customer about ' + asking[o.email] : '';
  if (reason) { held.push({ order: o.name, reason }); continue; }
  asking[o.email] = o.name;
  picked.push({ ...o, days_since_delivery: Math.floor(since) });
}
for (const o of picked.slice(cfg.daily_cap)) held.push({ order: o.name, reason: 'over DAILY_CAP, next run' });
return [{ json: { requests: picked.slice(0, cfg.daily_cap), held, checked: rows.length } }];`),
    code('Write each review request', `
// Ask about one product (the most expensive line) and link straight to its review
// page. The new customer tag is computed here so the Shopify write needs no lookup.
const cfg = $('config').first().json;
const today = new Date().toISOString().slice(0, 10);
return $input.first().json.requests.map(o => {
  const main = [...o.line_items].sort((a, b) => b.price - a.price)[0];
  const link = cfg.review_links[main.product_id] || cfg.default_review_url.replace('{product_id}', main.product_id).replace('{order}', o.name.replace('#', ''));
  const others = o.line_items.filter(li => li !== main).map(li => li.title);
  const body = [
    'Hi ' + (o.first_name || 'there') + ',', '',
    'Your ' + main.title + ' arrived about ' + o.days_since_delivery + ' days ago. How is it working out?', '',
    'A two-line review helps other customers decide, and we read every one:',
    link, '',
    ...(others.length ? ['(Also in order ' + o.name + ': ' + others.join(', ') + '.)', ''] : []),
    'If something is not right, just reply and we will sort it out.', '',
    cfg.store_name,
  ].join('\\n');
  const keep = o.customer_tags.split(',').map(t => t.trim()).filter(t => t && !t.toLowerCase().startsWith('review-requested-'));
  return { json: { order: o.name, customer_id: o.customer_id, email: o.email, product: main.title, review_url: link,
    subject: 'How is your ' + main.title + '?', body, send_to: cfg.mode === 'test' ? cfg.test_email : o.email,
    new_tags: [...keep, 'review-requested-' + today].join(', ') } };
});`),
    ifTrue('Sending switched on?', cfg('sends_enabled')),
    stop('STOP: preview - nothing sent'),
    gmail.send('Email the review request', { to: '$json.send_to', subject: "($('config').first().json.mode === 'test' ? '[TEST to ' + $json.email + '] ' : '') + $json.subject", message: '$json.body' }),
    ifTrue('Live run?', cfg('live')),
    stop('STOP: test send - Shopify untouched'),
    http('Tag the customer in Shopify', {
      method: 'PUT', auth: 'shopifyAccessTokenApi',
      url: `={{ 'https://' + ${cfg('shop_domain')} + '/admin/api/2024-10/customers/' + $('Write each review request').item.json.customer_id + '.json' }}`,
      jsonBody: "JSON.stringify({ customer: { id: $('Write each review request').item.json.customer_id, tags: $('Write each review request').item.json.new_tags } })",
    }),
  ],
  edges: [
    ['Run manually', 'config'], ['Every day at 11:00', 'config'],
    ['config', 'Shopify connected?'],
    ['Shopify connected?', 0, 'Fetch fulfilled orders'], ['Shopify connected?', 1, 'Load sample orders'],
    ['Fetch fulfilled orders', 'Read Shopify orders'],
    ['Read Shopify orders', 'Combine order sources'], ['Load sample orders', 0, 'Combine order sources', 1],
    ['Combine order sources', 'Pick orders to ask about'],
    ['Pick orders to ask about', 'Write each review request'],
    ['Write each review request', 'Sending switched on?'],
    ['Sending switched on?', 0, 'Email the review request'], ['Sending switched on?', 1, 'STOP: preview - nothing sent'],
    ['Email the review request', 'Live run?'],
    ['Live run?', 0, 'Tag the customer in Shopify'], ['Live run?', 1, 'STOP: test send - Shopify untouched'],
  ],
  groups: [
    { title: 'Start and settings', why: 'Runs daily at 11:00, a time when review emails get opened. The asking window, cooldown and product review links all live in `config`.', nodes: ['Run manually', 'Every day at 11:00', 'config'] },
    { title: 'Read fulfilled orders', why: '`Read Shopify orders` takes the delivery date from carrier tracking when Shopify has it. Until `USE_SHOPIFY` is true, `Load sample orders` supplies the same shape with one order per skip rule.', nodes: ['Shopify connected?', 'Fetch fulfilled orders', 'Read Shopify orders', 'Load sample orders', 'Combine order sources'] },
    { title: 'Pick and write', why: 'Refunds and cancellations are checked before timing, so an unhappy customer is never asked. The cooldown is read from a dated customer tag, which survives a re-import of the workflow.', nodes: ['Pick orders to ask about', 'Write each review request'] },
    { title: 'Send and tag', why: 'Nothing is emailed while `TEST_RUN` is true and `TEST_EMAIL` is blank. A test send leaves Shopify alone, so the real customer can still be asked; only a live send writes the dated tag.', nodes: ['Sending switched on?', 'STOP: preview - nothing sent', 'Email the review request', 'Live run?', 'STOP: test send - Shopify untouched', 'Tag the customer in Shopify'] },
  ],
  scenarios: [
    {
      name: 'shipped config (preview)', start: 'Run manually',
      expect: { reached: ['Load sample orders', 'STOP: preview - nothing sent'], outward: 'none' },
      check: out => {
        const f: string[] = [];
        const p = out['Pick orders to ask about'][0];
        const names = p.requests.map((r: any) => r.name).sort().join(',');
        if (names !== '#1041,#1046') f.push(`expected #1041 and #1046, got ${names}`);
        const why = (n: string) => p.held.find((h: any) => h.order === n)?.reason || '';
        const want: Record<string, string> = { '#1042': 'too soon', '#1043': 'refunded', '#1044': 'cancelled', '#1045': 'customer asked 40', '#1047': 'too late', '#1048': 'tagged no-review', '#1049': 'about #1041' };
        for (const [n, w] of Object.entries(want)) if (!why(n).includes(w)) f.push(`${n} should be held for "${w}", got "${why(n)}"`);
        const w = out['Write each review request'];
        const r41 = w.find((x: any) => x.order === '#1041');
        if (r41?.review_url !== 'https://reviews.fernway.example/linen-duvet-set') f.push('#1041 should link the duvet review page');
        if (!w.find((x: any) => x.order === '#1046')?.review_url.includes('product=7004&order=1046')) f.push('#1046 should use DEFAULT_REVIEW_URL for the bath towel');
        return f;
      },
    },
    {
      name: 'test send to TEST_EMAIL', start: 'Run manually', overrides: { TEST_EMAIL: 'you@example.com' },
      mocks: { 'Email the review request': (items: any[]) => items.map(() => ({ id: 'msg_t' })) },
      expect: { reached: ['Email the review request', 'STOP: test send - Shopify untouched'], notReached: ['Tag the customer in Shopify'], outward: 'some' },
      check: out => out['Write each review request'].every((r: any) => r.send_to === 'you@example.com') ? [] : ['test sends must go to TEST_EMAIL'],
    },
    {
      name: 'live with Shopify', start: 'Every day at 11:00',
      overrides: { USE_SHOPIFY: true, TEST_RUN: false },
      mocks: {
        'Fetch fulfilled orders': [{ orders: [
          { id: 55, name: '#2001', email: 'jo@harbour.example', financial_status: 'paid', cancelled_at: null, tags: '',
            customer: { id: 9001, first_name: 'Jo', email: 'jo@harbour.example', tags: 'newsletter, review-requested-2025-01-02' },
            fulfillments: [{ created_at: new Date(Date.now() - 12 * 864e5).toISOString(), updated_at: new Date(Date.now() - 9 * 864e5).toISOString(), shipment_status: 'delivered' }],
            line_items: [{ product_id: 7003, title: 'Wool throw', price: '120.00', quantity: 1 }] },
        ] }],
        'Email the review request': (items: any[]) => items.map(() => ({ id: 'msg_1', labelIds: ['SENT'] })),
        'Tag the customer in Shopify': (items: any[]) => items.map(() => ({ customer: { id: 9001 } })),
      },
      expect: { reached: ['Read Shopify orders', 'Tag the customer in Shopify'], notReached: ['Load sample orders'], outward: 'some' },
      check: out => {
        const f: string[] = [];
        const w = out['Write each review request'][0];
        if (w?.send_to !== 'jo@harbour.example') f.push('live send should go to the customer');
        if (!w?.new_tags.startsWith('newsletter, review-requested-') || w.new_tags.includes('2025-01-02')) f.push(`old review tag should be replaced, got ${w?.new_tags}`);
        return f;
      },
    },
  ],
});
