import { defineSpec } from '../_kit/spec';
import { trigger, code, ifTrue, ifWhen, merge, stop, http, gmail } from '../_kit/n';

const cfg = (k: string) => `$('config').first().json.${k}`;

export default defineSpec({
  slug: 'lemonsqueezy-customer-onboarding',
  title: 'Welcome new Lemon Squeezy customers and tag them in ConvertKit',
  summary: 'Receives Lemon Squeezy order_created webhooks, ignores retries, unpaid orders and other events, sends a welcome email written for the product bought, and subscribes the buyer to a ConvertKit form with that product\'s tag. Test-mode orders only ever reach your test address.',
  category: 'E-commerce',
  description: {
    who: 'Creators selling templates, courses or software on Lemon Squeezy who want each buyer to get a product-specific welcome and land in the right ConvertKit segment, instead of one generic receipt.',
    how: [
      'Lemon Squeezy calls the webhook on every new order. A manual run uses 5 sample payloads instead.',
      'Only `order_created` events for your store with status paid go on. Lemon Squeezy retries are dropped by order id.',
      'Orders placed in Lemon Squeezy test mode are never treated as real: the welcome goes to `TEST_EMAIL` and ConvertKit is skipped.',
      'The first item\'s product id picks the welcome subject and text, the ConvertKit form and the tag from `PRODUCTS`, with a default for unlisted products.',
      'The welcome is sent from Gmail, then the buyer is added to the form with the tag and their first name.',
    ],
    setup: [
      'Run it once as imported. It processes the sample payloads and stops at `STOP: preview - nothing sent`.',
      'Activate the workflow and add the production URL of `Lemon Squeezy order webhook` in Lemon Squeezy under Settings, Webhooks, with the order_created event. Set `STORE_ID`.',
      'Connect Gmail, add a ConvertKit credential to `Add to the ConvertKit form`, and fill `PRODUCTS` with your product ids, form ids, tag ids and welcome copy.',
      'Put your address in `TEST_EMAIL`, place a test-mode order in Lemon Squeezy, then set `TEST_RUN = false`.',
    ],
    requirements: ['A Lemon Squeezy store', 'A Gmail account', 'A ConvertKit account with a form and tags'],
    customize: [
      '`PRODUCTS` holds the subject, welcome lines, form id and tag id per product.',
      '`DEFAULT_PRODUCT` covers anything not listed.',
      '`SENDER_NAME` signs every email.',
    ],
  },
  config: {
    intro: ['A manual run uses SAMPLE webhook payloads; real orders arrive on the webhook.', 'TEST_RUN true + TEST_EMAIL blank -> preview only. Lemon Squeezy test-mode orders never reach a customer or ConvertKit.'],
    consts: [
      { name: 'STORE_ID', value: '', note: 'your Lemon Squeezy store id; blank accepts any store' },
      { name: 'PRODUCTS', value: {
        '11': { name: 'Budget Planner for Notion', subject: 'Your Budget Planner is ready, {first_name}', lines: ['Open the duplicate link on your receipt to copy the planner into your Notion workspace.', 'Start with the Monthly view: it fills itself from the Transactions table.'], form_id: '', tag_id: '' },
        '12': { name: 'Freelance Pricing Course', subject: 'Welcome to the Freelance Pricing Course', lines: ['Lesson 1 is waiting in your account: it takes 20 minutes.', 'Bring one current client quote; we use it in lesson 3.'], form_id: '', tag_id: '' },
      }, note: 'Lemon Squeezy product id -> welcome copy, ConvertKit form id and tag id' },
      { name: 'DEFAULT_PRODUCT', value: { subject: 'Thanks for your order, {first_name}', lines: ['Your download link and receipt are in the Lemon Squeezy email.', 'Reply to this email if anything does not work.'], form_id: '', tag_id: '' }, note: 'used for products not in PRODUCTS' },
      { name: 'SENDER_NAME', value: 'Maya at Paperlane', note: 'sign-off on every email' },
    ],
    safety: 'test_run',
  },
  nodes: [
    trigger.manual(),
    trigger.webhook('Lemon Squeezy order webhook', 'lemonsqueezy-orders'),
    code('Read the webhook payload', `
// When the webhook fired, pass its JSON body on. A manual run has none, so it
// returns a marker and the sample payloads are used.
let hooks = [];
try { if ($('Lemon Squeezy order webhook').isExecuted) hooks = $('Lemon Squeezy order webhook').all().map(i => i.json.body || {}); } catch (e) { hooks = []; }
if (!hooks.length) return [{ json: { source: 'none' } }];
return hooks.map(body => ({ json: { source: 'webhook', body } }));`),
    ifTrue('Webhook received?', "$json.source === 'webhook'"),
    code('Load sample payloads', `
// Used on a manual run. Shaped like Lemon Squeezy webhook bodies.
const p = (id, event, status, testMode, productId, productName, email, name) => ({ source: 'sample', body: {
  meta: { event_name: event, test_mode: testMode, webhook_id: 'wh_' + id },
  data: { type: 'orders', id: String(id), attributes: { store_id: 4401, order_number: id, identifier: 'ord-' + id, user_name: name, user_email: email,
    status, total: 2900, currency: 'USD', test_mode: testMode, urls: { receipt: 'https://app.lemonsqueezy.com/my-orders/ord-' + id },
    first_order_item: { product_id: productId, product_name: productName, variant_name: 'Default' } } } } });
return [
  p(1001, 'order_created', 'paid', false, 11, 'Budget Planner for Notion', 'priya@quillworks.example', 'Priya Nair'),
  p(1002, 'order_created', 'paid', true, 12, 'Freelance Pricing Course', 'me@yourcompany.example', 'Store Owner'),
  p(1003, 'order_created', 'pending', false, 11, 'Budget Planner for Notion', 'sam@hollowtree.example', 'Sam Reid'),
  p(1004, 'order_created', 'paid', false, 99, 'Icon Pack Vol. 2', 'lucas@brightfold.example', 'Lucas Moreau'),
  p(1005, 'subscription_created', 'active', false, 12, 'Freelance Pricing Course', 'amy@northlight.example', 'Amy Cho'),
].map(json => ({ json }));`),
    merge('Combine payload sources'),
    code('Check and map each order', `
// Gate in this order: event, store, status, retry. Test-mode orders continue but are
// marked so they can only reach TEST_EMAIL. Then map the product to its welcome.
const cfg = $('config').first().json;
const memory = $getWorkflowStaticData('global');
const done = memory.welcomed || {};
const orders = [], held = [];
for (const { json: { body } } of $input.all()) {
  const meta = body.meta || {}, a = body.data?.attributes || {};
  const id = String(body.data?.id || '');
  const reason =
    meta.event_name !== 'order_created' ? 'event ' + meta.event_name + ' ignored' :
    cfg.store_id && String(a.store_id) !== String(cfg.store_id) ? 'other store ' + a.store_id :
    a.status !== 'paid' ? 'status ' + a.status :
    done[id] ? 'already welcomed (webhook retry)' :
    !a.user_email ? 'no email' : '';
  if (reason) { held.push({ order: id, reason }); continue; }
  const test = Boolean(meta.test_mode || a.test_mode);
  if (test && cfg.test_email.trim() === '') { held.push({ order: id, reason: 'test-mode order and TEST_EMAIL is blank' }); continue; }
  const pid = String(a.first_order_item?.product_id || '');
  const product = cfg.products[pid] || cfg.default_product;
  orders.push({ order: id, test_order: test, email: String(a.user_email).toLowerCase(), first_name: String(a.user_name || '').split(' ')[0],
    product_id: pid, product_name: a.first_order_item?.product_name || product.name || '', receipt: a.urls?.receipt || '',
    known_product: Boolean(cfg.products[pid]), subject_tpl: product.subject, lines: product.lines, form_id: product.form_id, tag_id: product.tag_id });
}
return [{ json: { orders, held } }];`),
    code('Write each welcome email', `
// Product copy from PRODUCTS, receipt link from the order. Test-mode orders and
// test runs both go to TEST_EMAIL.
const cfg = $('config').first().json;
return $input.first().json.orders.map(o => {
  const fill = s => s.replace('{first_name}', o.first_name || 'there').replace('{product}', o.product_name);
  const body = ['Hi ' + (o.first_name || 'there') + ',', '', 'Thanks for buying ' + o.product_name + '.', '', ...o.lines.map(fill), '',
    ...(o.receipt ? ['Your receipt and downloads: ' + o.receipt, ''] : []), cfg.sender_name].join('\\n');
  const toTest = cfg.mode === 'test' || o.test_order;
  return { json: { ...o, subject: fill(o.subject_tpl), body, send_to: toTest ? cfg.test_email : o.email } };
});`),
    ifTrue('Sending switched on?', `${cfg('sends_enabled')} || $json.test_order`),
    stop('STOP: preview - nothing sent'),
    gmail.send('Email the welcome', { to: '$json.send_to', subject: "($json.send_to !== $json.email ? '[TEST to ' + $json.email + '] ' : '') + $json.subject", message: '$json.body' }),
    ifWhen('Subscribe in ConvertKit?', [[cfg('live'), 'true'], ["!$('Write each welcome email').item.json.test_order", 'true'], ["$('Write each welcome email').item.json.form_id", 'notEmpty']]),
    stop('STOP: test, or no form id - ConvertKit untouched'),
    http('Add to the ConvertKit form', {
      method: 'POST', auth: 'convertKitApi',
      url: "={{ 'https://api.convertkit.com/v3/forms/' + $('Write each welcome email').item.json.form_id + '/subscribe' }}",
      jsonBody: "JSON.stringify({ email: $('Write each welcome email').item.json.email, first_name: $('Write each welcome email').item.json.first_name, tags: $('Write each welcome email').item.json.tag_id ? [Number($('Write each welcome email').item.json.tag_id)] : [] })",
    }),
    code('Remember welcomed orders', `
// Lemon Squeezy retries a webhook until it gets a 200; this stops a retry from
// sending a second welcome. Ids older than 30 days are dropped.
const memory = $getWorkflowStaticData('global');
const done = memory.welcomed || {};
const now = new Date().toISOString();
for (const o of $('Write each welcome email').all()) if (!o.json.test_order) done[o.json.order] = now;
const cutoff = new Date(Date.now() - 30 * 864e5).toISOString();
for (const [k, v] of Object.entries(done)) if (v < cutoff) delete done[k];
memory.welcomed = done;
return [{ json: { remembered: Object.keys(done).length } }];`),
  ],
  edges: [
    ['Run manually', 'config'], ['Lemon Squeezy order webhook', 'config'],
    ['config', 'Read the webhook payload'],
    ['Read the webhook payload', 'Webhook received?'],
    ['Webhook received?', 0, 'Combine payload sources'], ['Webhook received?', 1, 'Load sample payloads'],
    ['Load sample payloads', 0, 'Combine payload sources', 1],
    ['Combine payload sources', 'Check and map each order'],
    ['Check and map each order', 'Write each welcome email'],
    ['Write each welcome email', 'Sending switched on?'],
    ['Sending switched on?', 0, 'Email the welcome'], ['Sending switched on?', 1, 'STOP: preview - nothing sent'],
    ['Email the welcome', 'Subscribe in ConvertKit?'],
    ['Subscribe in ConvertKit?', 0, 'Add to the ConvertKit form'], ['Subscribe in ConvertKit?', 1, 'STOP: test, or no form id - ConvertKit untouched'],
    ['Add to the ConvertKit form', 'Remember welcomed orders'],
  ],
  groups: [
    { title: 'Start and settings', why: 'The webhook answers Lemon Squeezy at once and then runs; the manual trigger replays sample payloads. Product copy, form ids and tag ids all live in `config`.', nodes: ['Run manually', 'Lemon Squeezy order webhook', 'config'] },
    { title: 'Read the payload', why: '`Read the webhook payload` passes the JSON body on, or a marker on a manual run so `Load sample payloads` takes over with the same Lemon Squeezy shape.', nodes: ['Read the webhook payload', 'Webhook received?', 'Load sample payloads', 'Combine payload sources'] },
    { title: 'Check the order and write', why: 'Cheap checks come first: wrong event, wrong store, unpaid, retry. The `test_mode` flag in the payload is trusted over everything else, so a test purchase can never reach a real inbox or list.', nodes: ['Check and map each order', 'Write each welcome email'] },
    { title: 'Send and subscribe', why: 'ConvertKit is only touched on a live run, for a real order, with a form id set. The order id is remembered after the subscribe call, so a Lemon Squeezy retry is dropped at the check.', nodes: ['Sending switched on?', 'STOP: preview - nothing sent', 'Email the welcome', 'Subscribe in ConvertKit?', 'STOP: test, or no form id - ConvertKit untouched', 'Add to the ConvertKit form', 'Remember welcomed orders'] },
  ],
  scenarios: [
    {
      name: 'shipped config (preview)', start: 'Run manually',
      expect: { reached: ['Load sample payloads', 'STOP: preview - nothing sent'], outward: 'none' },
      check: out => {
        const f: string[] = [];
        const d = out['Check and map each order'][0];
        const ids = d.orders.map((o: any) => o.order).join(',');
        if (ids !== '1001,1004') f.push(`expected orders 1001 and 1004, got ${ids}`);
        const why = (id: string) => d.held.find((h: any) => h.order === id)?.reason || '';
        if (!why('1002').includes('test-mode')) f.push('test-mode order 1002 should be held while TEST_EMAIL is blank');
        if (why('1003') !== 'status pending') f.push('pending order should be held');
        if (!why('1005').includes('subscription_created')) f.push('other events should be ignored');
        const w = out['Write each welcome email'];
        if (w[0].subject !== 'Your Budget Planner is ready, Priya') f.push(`product subject expected, got ${w[0].subject}`);
        if (w[1].known_product || !w[1].subject.startsWith('Thanks for your order')) f.push('unlisted product should use DEFAULT_PRODUCT');
        return f;
      },
    },
    {
      name: 'test-mode order goes only to TEST_EMAIL', start: 'Lemon Squeezy order webhook',
      input: [{ headers: { 'x-event-name': 'order_created' }, params: {}, query: {}, body: {
        meta: { event_name: 'order_created', test_mode: true },
        data: { type: 'orders', id: '7001', attributes: { store_id: 4401, user_name: 'Real Customer', user_email: 'real@customer.example', status: 'paid', test_mode: true,
          first_order_item: { product_id: 12, product_name: 'Freelance Pricing Course' }, urls: { receipt: 'https://app.lemonsqueezy.com/my-orders/x' } } } } }],
      overrides: { TEST_RUN: false, TEST_EMAIL: 'you@example.com' },
      mocks: { 'Email the welcome': (items: any[]) => items.map(() => ({ id: 'msg_t' })) },
      expect: { reached: ['Email the welcome', 'STOP: test, or no form id - ConvertKit untouched'], notReached: ['Load sample payloads', 'Add to the ConvertKit form'], outward: 'some' },
      check: out => out['Write each welcome email'][0]?.send_to === 'you@example.com' ? [] : ['a test-mode order must go to TEST_EMAIL even when TEST_RUN is false'],
    },
    {
      name: 'live order subscribes to ConvertKit', start: 'Lemon Squeezy order webhook',
      input: [{ headers: {}, params: {}, query: {}, body: {
        meta: { event_name: 'order_created', test_mode: false },
        data: { type: 'orders', id: '7002', attributes: { store_id: 4401, user_name: 'Olu Bankole', user_email: 'Olu@Bankole.example', status: 'paid', test_mode: false,
          first_order_item: { product_id: 11, product_name: 'Budget Planner for Notion' }, urls: { receipt: 'https://app.lemonsqueezy.com/my-orders/y' } } } } }],
      overrides: { TEST_RUN: false, STORE_ID: '4401', PRODUCTS: { '11': { name: 'Budget Planner for Notion', subject: 'Your planner, {first_name}', lines: ['Duplicate it from the receipt.'], form_id: '5551234', tag_id: '880' } } },
      mocks: {
        'Email the welcome': (items: any[]) => items.map(() => ({ id: 'msg_1' })),
        'Add to the ConvertKit form': [{ subscription: { id: 1, state: 'active', subscriber: { id: 99 } } }],
      },
      expect: { reached: ['Add to the ConvertKit form', 'Remember welcomed orders'], outward: 'some' },
      check: out => {
        const f: string[] = [];
        const w = out['Write each welcome email'][0];
        if (w?.send_to !== 'olu@bankole.example' || w.subject !== 'Your planner, Olu') f.push('live welcome should go to the buyer with the product subject');
        if (out['Remember welcomed orders'][0]?.remembered !== 1) f.push('order 7002 should be remembered');
        return f;
      },
    },
  ],
});
