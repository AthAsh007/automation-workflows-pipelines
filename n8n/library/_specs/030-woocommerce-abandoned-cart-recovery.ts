import { defineSpec } from '../_kit/spec';
import { trigger, code, ifTrue, merge, stop, http, gmail } from '../_kit/n';

const cfg = (k: string) => `$('config').first().json.${k}`;
const woo = (path: string) => `={{ ${cfg('store_url')} + '/wp-json/wc/v3/${path}' }}`;

export default defineSpec({
  slug: 'woocommerce-abandoned-cart-recovery',
  title: 'Recover abandoned WooCommerce carts with a two-step Gmail sequence',
  summary: 'Every hour finds unpaid WooCommerce orders, sends a reminder after 1 hour and a second one after 24 hours with a coupon for carts over a threshold, stops as soon as the customer pays or buys again, and records the step on the order.',
  category: 'E-commerce',
  description: {
    who: 'WooCommerce stores where checkout creates a pending order before payment, and customers drop off at the payment step. It works on those orders, so no cart-tracking plugin is needed.',
    how: [
      'Every hour it reads the last 4 days of WooCommerce orders, or 10 sample orders until WooCommerce is connected.',
      'Pending and on-hold orders are carts. An order paid since, or a newer paid order from the same email, ends the sequence.',
      'Step 1 goes after 1 hour. Step 2 goes after 24 hours and adds the `COUPON_CODE` when the cart is worth 100 or more. Nothing is sent after 72 hours.',
      'On-hold orders paid by bank transfer or cheque are left alone, since they are waiting on the customer\'s bank, not abandoned.',
      'After a live send the step is written to the order as `recovery_step`, so no step is ever sent twice.',
    ],
    setup: [
      'Run it once as imported. It previews against sample orders and stops at `STOP: preview - nothing sent`.',
      'Add a WooCommerce credential to `Fetch recent orders` and `Record the step on the order`, set `STORE_URL` and `USE_WOOCOMMERCE = true`.',
      'Create the coupon named in `COUPON_CODE` in WooCommerce (limit it to one use per customer), and connect Gmail.',
      'Put your address in `TEST_EMAIL` to get every message yourself, then set `TEST_RUN = false`.',
    ],
    requirements: ['A WooCommerce store with REST API keys', 'A Gmail account', 'One coupon created in WooCommerce'],
    customize: [
      '`STEPS` holds the delay and subject of each message.',
      '`COUPON_MIN_TOTAL` and `COUPON_CODE` control who gets the discount.',
      '`MIN_CART_TOTAL` and `HOURLY_CAP` keep small carts and big batches out.',
    ],
  },
  config: {
    intro: ['USE_WOOCOMMERCE false -> SAMPLE orders.', 'TEST_RUN true + TEST_EMAIL blank -> preview only. Orders are only updated on a live run.'],
    consts: [
      { name: 'USE_WOOCOMMERCE', value: false, note: 'set true after adding the WooCommerce credential to both WooCommerce nodes' },
      { name: 'STORE_URL', value: 'https://shop.yourstore.example', note: 'your store address, no trailing slash' },
      { name: 'STORE_NAME', value: 'Harbor Tea Co', note: 'used in subjects and sign-off' },
      { name: 'STEPS', value: [
        { step: 1, after_hours: 1, subject: 'Your order at {store} is waiting' },
        { step: 2, after_hours: 24, subject: 'Still thinking it over? Your cart is saved' },
      ], note: 'sequence: hours since the order was created before each step' },
      { name: 'STOP_AFTER_HOURS', value: 72, note: 'carts older than this get nothing more' },
      { name: 'COUPON_CODE', value: 'COMEBACK10', note: 'existing WooCommerce coupon added to step 2' },
      { name: 'COUPON_MIN_TOTAL', value: 100, note: 'step 2 includes the coupon only for carts at or above this total' },
      { name: 'MIN_CART_TOTAL', value: 15, note: 'carts below this are not chased' },
      { name: 'OFFLINE_METHODS', value: ['bacs', 'cheque', 'cod'], note: 'payment methods where on-hold means waiting for the bank, not abandoned' },
      { name: 'HOURLY_CAP', value: 30, note: 'hard ceiling on emails per run' },
    ],
    safety: 'test_run',
  },
  nodes: [
    trigger.manual(),
    trigger.schedule('Every hour at :15', '15 * * * *'),
    ifTrue('WooCommerce connected?', cfg('use_woocommerce')),
    http('Fetch recent orders', {
      url: woo('orders'), auth: 'wooCommerceApi',
      query: { after: '={{ new Date(Date.now() - 4 * 864e5).toISOString() }}', per_page: '100', orderby: 'date', order: 'desc' },
    }),
    code('Read WooCommerce orders', `
// Order list -> the fields the sequence needs. recovery_step lives in order meta.
const out = [];
for (const page of $input.all()) {
  const list = Array.isArray(page.json) ? page.json : [page.json];
  for (const o of list) {
    if (!o || !o.id) continue;
    const meta = Object.fromEntries((o.meta_data || []).map(m => [m.key, m.value]));
    out.push({ json: {
      id: o.id, number: String(o.number || o.id), status: o.status, created: (o.date_created_gmt || o.date_created) + (String(o.date_created_gmt || '').endsWith('Z') ? '' : 'Z'),
      paid: Boolean(o.date_paid || o.date_paid_gmt), total: Number(o.total || 0), currency: o.currency || 'USD',
      email: String(o.billing?.email || '').toLowerCase(), first_name: o.billing?.first_name || '', payment_method: o.payment_method || '',
      pay_url: o.payment_url || '', items: (o.line_items || []).map(li => li.quantity + ' x ' + li.name),
      step: Number(meta.recovery_step || 0),
    } });
  }
}
return out;`),
    code('Load sample orders', `
// Used until USE_WOOCOMMERCE is true. Three carts are due a step; the rest show each stop rule.
const ago = h => new Date(Date.now() - h * 36e5).toISOString();
const o = (id, status, hours, total, email, step, extra = {}) => ({ id, number: String(id), status, created: ago(hours), paid: status === 'processing' || status === 'completed',
  total, currency: 'USD', email, first_name: email.split('@')[0].replace(/^./, c => c.toUpperCase()), payment_method: 'stripe',
  pay_url: 'https://shop.yourstore.example/checkout/order-pay/' + id + '/?pay_for_order=true&key=wc_order_sample' + id,
  items: ['1 x Sencha loose leaf 250g', '2 x Glass infuser mug'], step, ...extra });
return [
  o(301, 'pending', 2, 85, 'maya@lindenrow.example', 0),
  o(302, 'pending', 26, 140, 'theo@copperfield.example', 1),
  o(303, 'pending', 30, 60, 'iris@saltmarsh.example', 1),
  o(304, 'pending', 0.5, 45, 'leo@whitby.example', 0),
  o(305, 'pending', 5, 70, 'nina@hollins.example', 0),
  o(306, 'on-hold', 3, 210, 'omar@greystone.example', 0, { payment_method: 'bacs' }),
  o(307, 'pending', 26, 95, 'pia@fairhaven.example', 2),
  o(308, 'pending', 80, 120, 'quin@ashby.example', 1),
  o(309, 'pending', 3, 8, 'rae@morrow.example', 0),
  o(310, 'processing', 1, 70, 'nina@hollins.example', 0),
].map(json => ({ json }));`),
    merge('Combine order sources'),
    code('Pick the next step for each cart', `
// A cart gets at most one step per run: the highest step it has reached by age that
// was not sent yet. A paid order from the same email after the cart ends the sequence.
const cfg = $('config').first().json;
const orders = $input.all().map(i => i.json);
const now = Date.now();
const steps = [...cfg.steps].sort((a, b) => a.after_hours - b.after_hours);
const paidAt = {};
for (const o of orders) if (o.paid || ['processing', 'completed'].includes(o.status)) {
  if (!paidAt[o.email] || o.created > paidAt[o.email]) paidAt[o.email] = o.created;
}
const due = [], held = [];
for (const o of orders.filter(o => ['pending', 'on-hold'].includes(o.status))) {
  const hours = (now - new Date(o.created).getTime()) / 36e5;
  const next = steps.filter(s => hours >= s.after_hours).pop();
  const reason =
    !o.email ? 'no email' :
    o.paid ? 'paid' :
    paidAt[o.email] && paidAt[o.email] > o.created ? 'bought since' :
    o.status === 'on-hold' && cfg.offline_methods.includes(o.payment_method) ? 'awaiting offline payment (' + o.payment_method + ')' :
    o.total < cfg.min_cart_total ? 'below MIN_CART_TOTAL' :
    hours > cfg.stop_after_hours ? 'older than ' + cfg.stop_after_hours + 'h, sequence over' :
    !next ? 'too soon (' + Math.round(hours * 60) + ' min)' :
    o.step >= steps[steps.length - 1].step ? 'sequence finished' :
    next.step <= o.step ? 'step ' + o.step + ' sent, next not due' : '';
  if (reason) { held.push({ order: o.number, reason }); continue; }
  due.push({ ...o, next_step: next.step, subject_tpl: next.subject, hours: Math.floor(hours),
    coupon: next.step === steps[steps.length - 1].step && o.total >= cfg.coupon_min_total ? cfg.coupon_code : '' });
}
due.sort((a, b) => b.total - a.total);
for (const o of due.slice(cfg.hourly_cap)) held.push({ order: o.number, reason: 'over HOURLY_CAP, next run' });
return [{ json: { carts: due.slice(0, cfg.hourly_cap), held, checked: orders.length } }];`),
    code('Write each recovery email', `
// Plain text, the cart contents, and the order's own pay link so the customer
// lands back on payment with everything filled in.
const cfg = $('config').first().json;
const money = (n, c) => new Intl.NumberFormat('en-US', { style: 'currency', currency: c }).format(n);
return $input.first().json.carts.map(o => {
  const body = [
    'Hi ' + (o.first_name || 'there') + ',', '',
    o.next_step === 1 ? 'You started an order with us but did not finish paying. It is saved:' : 'Your order is still saved, in case you want to pick it up again:',
    '', ...o.items.map(i => '- ' + i), 'Total: ' + money(o.total, o.currency), '',
    'Finish your order: ' + o.pay_url,
    ...(o.coupon ? ['', 'Use code ' + o.coupon + ' at checkout for 10% off this order.'] : []),
    '', 'Questions about the order? Reply to this email.', '', cfg.store_name,
  ].join('\\n');
  return { json: { order_id: o.id, order: o.number, step: o.next_step, coupon: o.coupon, email: o.email,
    subject: o.subject_tpl.replace('{store}', cfg.store_name), body, send_to: cfg.mode === 'test' ? cfg.test_email : o.email } };
});`),
    ifTrue('Sending switched on?', cfg('sends_enabled')),
    stop('STOP: preview - nothing sent'),
    gmail.send('Email the recovery message', { to: '$json.send_to', subject: "($('config').first().json.mode === 'test' ? '[TEST step ' + $json.step + ' to ' + $json.email + '] ' : '') + $json.subject", message: '$json.body' }),
    ifTrue('Live run?', cfg('live')),
    stop('STOP: test send - orders untouched'),
    http('Record the step on the order', {
      method: 'PUT', auth: 'wooCommerceApi',
      url: `={{ ${cfg('store_url')} + '/wp-json/wc/v3/orders/' + $('Write each recovery email').item.json.order_id }}`,
      jsonBody: "JSON.stringify({ meta_data: [{ key: 'recovery_step', value: String($('Write each recovery email').item.json.step) }, { key: 'recovery_sent_at', value: new Date().toISOString() }] })",
    }),
  ],
  edges: [
    ['Run manually', 'config'], ['Every hour at :15', 'config'],
    ['config', 'WooCommerce connected?'],
    ['WooCommerce connected?', 0, 'Fetch recent orders'], ['WooCommerce connected?', 1, 'Load sample orders'],
    ['Fetch recent orders', 'Read WooCommerce orders'],
    ['Read WooCommerce orders', 'Combine order sources'], ['Load sample orders', 0, 'Combine order sources', 1],
    ['Combine order sources', 'Pick the next step for each cart'],
    ['Pick the next step for each cart', 'Write each recovery email'],
    ['Write each recovery email', 'Sending switched on?'],
    ['Sending switched on?', 0, 'Email the recovery message'], ['Sending switched on?', 1, 'STOP: preview - nothing sent'],
    ['Email the recovery message', 'Live run?'],
    ['Live run?', 0, 'Record the step on the order'], ['Live run?', 1, 'STOP: test send - orders untouched'],
  ],
  groups: [
    { title: 'Start and settings', why: 'Runs every hour at :15 so step 1 lands between 1 and 2 hours after checkout. Delays, subjects, the coupon and its threshold all sit in `config`.', nodes: ['Run manually', 'Every hour at :15', 'config'] },
    { title: 'Read recent orders', why: 'One call returns paid and unpaid orders from the last 4 days, which is what lets the picker see that a customer bought on a second try. `Load sample orders` stands in until `USE_WOOCOMMERCE` is true.', nodes: ['WooCommerce connected?', 'Fetch recent orders', 'Read WooCommerce orders', 'Load sample orders', 'Combine order sources'] },
    { title: 'Pick the step and write', why: 'Stop rules run before timing: paid, bought since, offline payment, too small, too old. A cart past 24 hours that never got step 1 goes straight to step 2 rather than receiving both at once.', nodes: ['Pick the next step for each cart', 'Write each recovery email'] },
    { title: 'Send and record', why: 'Nothing is emailed while `TEST_RUN` is true and `TEST_EMAIL` is blank. A test send leaves the orders alone; only a live send writes `recovery_step`, which is what stops a repeat.', nodes: ['Sending switched on?', 'STOP: preview - nothing sent', 'Email the recovery message', 'Live run?', 'STOP: test send - orders untouched', 'Record the step on the order'] },
  ],
  scenarios: [
    {
      name: 'shipped config (preview)', start: 'Run manually',
      expect: { reached: ['Load sample orders', 'STOP: preview - nothing sent'], outward: 'none' },
      check: out => {
        const f: string[] = [];
        const p = out['Pick the next step for each cart'][0];
        const step = (n: string) => p.carts.find((c: any) => c.number === n);
        if (p.carts.length !== 3) f.push(`expected 3 carts due, got ${p.carts.length}`);
        if (step('301')?.next_step !== 1) f.push('#301 should get step 1');
        if (step('302')?.next_step !== 2 || step('302')?.coupon !== 'COMEBACK10') f.push('#302 should get step 2 with the coupon');
        if (step('303')?.next_step !== 2 || step('303')?.coupon !== '') f.push('#303 should get step 2 without a coupon (under 100)');
        const why = (n: string) => p.held.find((h: any) => h.order === n)?.reason || '';
        const want: Record<string, string> = { '304': 'too soon', '305': 'bought since', '306': 'offline', '307': 'finished', '308': 'sequence over', '309': 'MIN_CART_TOTAL' };
        for (const [n, w] of Object.entries(want)) if (!why(n).includes(w)) f.push(`#${n} should be held for "${w}", got "${why(n)}"`);
        if (!out['Write each recovery email'].find((e: any) => e.order === '302')?.body.includes('COMEBACK10')) f.push('step 2 email for #302 should carry the code');
        return f;
      },
    },
    {
      name: 'test send to TEST_EMAIL', start: 'Run manually', overrides: { TEST_EMAIL: 'you@example.com' },
      mocks: { 'Email the recovery message': (items: any[]) => items.map(() => ({ id: 'msg_t' })) },
      expect: { reached: ['Email the recovery message', 'STOP: test send - orders untouched'], notReached: ['Record the step on the order'], outward: 'some' },
      check: out => out['Write each recovery email'].every((r: any) => r.send_to === 'you@example.com') ? [] : ['test sends must go to TEST_EMAIL'],
    },
    {
      name: 'live with WooCommerce', start: 'Every hour at :15',
      overrides: { USE_WOOCOMMERCE: true, TEST_RUN: false },
      mocks: {
        'Fetch recent orders': [[
          { id: 9001, number: '9001', status: 'pending', date_created_gmt: new Date(Date.now() - 25 * 36e5).toISOString().slice(0, 19), date_paid: null, total: '42.50', currency: 'GBP',
            billing: { email: 'Sky@Marlow.example', first_name: 'Sky' }, payment_method: 'stripe', payment_url: 'https://shop.example/pay/9001',
            line_items: [{ name: 'Oolong 100g', quantity: 2 }], meta_data: [{ id: 1, key: 'recovery_step', value: '1' }] },
          { id: 9002, number: '9002', status: 'pending', date_created_gmt: new Date(Date.now() - 2 * 36e5).toISOString().slice(0, 19), date_paid: '2026-10-16T10:00:00', total: '30.00', currency: 'GBP',
            billing: { email: 'kim@marlow.example', first_name: 'Kim' }, payment_method: 'stripe', line_items: [], meta_data: [] },
        ]],
        'Email the recovery message': (items: any[]) => items.map(() => ({ id: 'msg_1' })),
        'Record the step on the order': (items: any[]) => items.map(() => ({ id: 9001 })),
      },
      expect: { reached: ['Read WooCommerce orders', 'Record the step on the order'], notReached: ['Load sample orders'], outward: 'some' },
      check: out => {
        const f: string[] = [];
        const w = out['Write each recovery email'];
        if (w.length !== 1 || w[0].order !== '9001' || w[0].step !== 2 || w[0].send_to !== 'sky@marlow.example') f.push('only #9001 should get step 2, sent to the lower-cased email');
        if (w[0]?.coupon !== '') f.push('a 42.50 cart is under COUPON_MIN_TOTAL');
        return f;
      },
    },
  ],
});
