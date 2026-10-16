import { defineSpec } from '../_kit/spec';
import { trigger, code, ifTrue, merge, stop, http, slack } from '../_kit/n';

const cfg = (k: string) => `$('config').first().json.${k}`;
const gql = `={{ 'https://' + ${cfg('shop_domain')} + '/admin/api/2024-10/graphql.json' }}`;

// No '}}' anywhere: n8n would read it as the end of the expression.
const ORDERS_QUERY = 'query($q: String!) { orders(first: 50, query: $q, sortKey: CREATED_AT, reverse: true) { nodes { id name email createdAt tags '
  + 'totalPriceSet { shopMoney { amount currencyCode } } customer { id numberOfOrders } billingAddress { countryCode } '
  + 'shippingAddress { countryCode address1 address2 company city } lineItems(first: 50) { nodes { quantity title sku } } '
  + 'risk { recommendation assessments { riskLevel } } } } }';
const TAG_MUTATION = 'mutation($id: ID!, $tags: [String!]!) { tagsAdd(id: $id, tags: $tags) { userErrors { field message } } }';

export default defineSpec({
  slug: 'shopify-risky-order-hold',
  title: 'Flag risky Shopify orders to Slack before fulfilment',
  summary: 'Scores every unfulfilled Shopify order on mismatched countries, high-value first orders, freight forwarder addresses, bulk quantities, disposable email domains and Shopify\'s own risk level, tags the risky ones for review and alerts Slack before anyone packs them.',
  category: 'E-commerce',
  description: {
    who: 'Shopify merchants who fulfil the same day and have been hit by chargebacks on orders that looked odd in hindsight. It flags those orders while there is still time to call the customer.',
    how: [
      'Every 30 minutes it reads unfulfilled orders from the last 2 days through the Shopify GraphQL Admin API, or 7 sample orders until Shopify is connected.',
      'Each order collects points: Shopify high risk 40, cancel recommendation 30, billing and shipping countries differ 20, first order over 300 25, freight forwarder address 25, a line of 5 or more units 15, disposable email domain 15.',
      'At 50 points the order is held: tagged `risk-review` so your packing team skips it. From 30 to 49 it is listed to watch.',
      'Orders already tagged `risk-review` or `risk-cleared` are not scored again, so clearing an order is just adding that tag.',
    ],
    setup: [
      'Run it once as imported. It scores the sample orders and stops at `STOP: dry run - orders untouched`.',
      'Add a Shopify access token credential to `Fetch unfulfilled orders` and `Tag the order for review`, set `SHOP_DOMAIN` and `USE_SHOPIFY = true`.',
      'Set `SLACK_CHANNEL_ID` and adjust `POINTS` and the word lists to your store.',
      'Set `DRY_RUN = false` once a few runs look right.',
    ],
    requirements: ['A Shopify store', 'A custom app token with read_orders and write_orders', 'A Slack workspace'],
    customize: [
      '`HOLD_SCORE` and `WATCH_SCORE` set the two lines.',
      '`FORWARDER_WORDS` and `DISPOSABLE_DOMAINS` hold the address and email patterns.',
      '`HIGH_VALUE` sets what counts as a large first order.',
    ],
  },
  config: {
    intro: ['USE_SHOPIFY false -> SAMPLE orders.', 'SLACK_CHANNEL_ID blank -> no alert. DRY_RUN true -> orders are scored and shown, nothing is tagged or posted.'],
    consts: [
      { name: 'USE_SHOPIFY', value: false, note: 'set true after adding the Shopify credential to both Shopify nodes' },
      { name: 'SHOP_DOMAIN', value: 'your-store.myshopify.com', note: 'your myshopify.com domain' },
      { name: 'LOOKBACK_HOURS', value: 48, note: 'unfulfilled orders created in this window are scored' },
      { name: 'POINTS', value: { shopify_high: 40, shopify_medium: 15, recommend_cancel: 30, country_mismatch: 20, first_order_high_value: 25, forwarder: 25, bulk_quantity: 15, disposable_email: 15, risky_country: 20 }, note: 'points per signal' },
      { name: 'HIGH_VALUE', value: 300, note: 'a first order at or above this total is a signal' },
      { name: 'BULK_QTY', value: 5, note: 'a single line with this many units is a signal' },
      { name: 'FORWARDER_WORDS', value: ['shipito', 'myus', 'planet express', 'forward', 'reship', 'c/o', 'suite #'], note: 'address fragments that suggest a parcel forwarder' },
      { name: 'DISPOSABLE_DOMAINS', value: ['mailinator.com', 'guerrillamail.com', 'tempmail.dev', '10minutemail.com'], note: 'throwaway email domains' },
      { name: 'RISKY_COUNTRIES', value: [], note: 'shipping country codes you treat as higher risk' },
      { name: 'HOLD_SCORE', value: 50, note: 'orders at or above this are tagged for review' },
      { name: 'WATCH_SCORE', value: 30, note: 'orders at or above this are listed in the alert but not tagged' },
      { name: 'REVIEW_TAG', value: 'risk-review', note: 'tag added to held orders' },
      { name: 'CLEARED_TAG', value: 'risk-cleared', note: 'add this tag by hand to clear an order; it is never scored again' },
      { name: 'SLACK_CHANNEL_ID', value: '', note: 'channel for the alert; blank posts nothing' },
    ],
    flags: { slack_enabled: "SLACK_CHANNEL_ID.trim() !== ''" },
    safety: 'dry_run',
  },
  nodes: [
    trigger.manual(),
    trigger.schedule('Every 30 minutes', '*/30 * * * *'),
    ifTrue('Shopify connected?', cfg('use_shopify')),
    http('Fetch unfulfilled orders', {
      method: 'POST', url: gql, auth: 'shopifyAccessTokenApi', outward: false,
      jsonBody: `JSON.stringify({ query: ${JSON.stringify(ORDERS_QUERY)}, variables: { q: 'fulfillment_status:unfulfilled status:open created_at:>' + new Date(Date.now() - ${cfg('lookback_hours')} * 36e5).toISOString() } })`,
    }),
    code('Read Shopify orders', `
// GraphQL nodes -> flat orders. numberOfOrders arrives as a string.
const out = [];
for (const page of $input.all()) for (const o of page.json.data?.orders?.nodes || []) {
  const ship = o.shippingAddress || {};
  out.push({ json: {
    gid: o.id, name: o.name, email: String(o.email || '').toLowerCase(), tags: (o.tags || []).map(t => t.toLowerCase()),
    total: Number(o.totalPriceSet?.shopMoney?.amount || 0), currency: o.totalPriceSet?.shopMoney?.currencyCode || 'USD',
    orders_count: Number(o.customer?.numberOfOrders || 1), billing_country: o.billingAddress?.countryCode || '',
    shipping_country: ship.countryCode || '', shipping_text: [ship.company, ship.address1, ship.address2, ship.city].filter(Boolean).join(', '),
    lines: (o.lineItems?.nodes || []).map(l => ({ title: l.title, qty: l.quantity })),
    risk_level: (o.risk?.assessments || []).map(a => a.riskLevel).sort((a, b) => ['NONE', 'LOW', 'PENDING', 'MEDIUM', 'HIGH'].indexOf(b) - ['NONE', 'LOW', 'PENDING', 'MEDIUM', 'HIGH'].indexOf(a))[0] || 'NONE',
    recommendation: o.risk?.recommendation || 'NONE',
  } });
}
return out;`),
    code('Load sample orders', `
// Used until USE_SHOPIFY is true. Three should be held, one watched, two cleared, one skipped.
const o = (name, extra) => ({ gid: 'gid://shopify/Order/' + name.slice(1), name, email: 'buyer' + name.slice(1) + '@example.com', tags: [], total: 80, currency: 'USD',
  orders_count: 3, billing_country: 'US', shipping_country: 'US', shipping_text: '12 Elm St, Springfield', lines: [{ title: 'Trail runner', qty: 1 }],
  risk_level: 'LOW', recommendation: 'ACCEPT', ...extra });
return [
  o('#2101', { email: 'ana@brightwell.example', total: 640, orders_count: 1, billing_country: 'GB' }),
  o('#2102', { email: 'kyle@quickmail.example', total: 420, orders_count: 1, billing_country: 'CA', shipping_text: 'c/o Shipito, Suite #4471, 1430 Ocean Ave, Torrance', risk_level: 'MEDIUM', recommendation: 'INVESTIGATE' }),
  o('#2103', { email: 'li@pinehurst.example', total: 210, risk_level: 'HIGH', recommendation: 'CANCEL' }),
  o('#2104', { email: 'coach@riverclub.example', total: 300, orders_count: 6, lines: [{ title: 'Club socks', qty: 12 }] }),
  o('#2105', { email: 'mo@lindqvist.example' }),
  o('#2106', { email: 'zed@harbor.example', total: 900, orders_count: 1, billing_country: 'FR', tags: ['risk-cleared'] }),
  o('#2107', { email: 'deal4u@quickbuy.example', total: 350, orders_count: 1, billing_country: 'IE', lines: [{ title: 'Smart watch', qty: 6 }] }),
].map(json => ({ json }));`),
    merge('Combine order sources'),
    code('Score each order', `
// Every signal that fires adds its POINTS and a plain-language reason, so the alert
// says why an order was held, not just that it was.
const cfg = $('config').first().json;
const P = cfg.points;
const scored = [], skipped = [];
for (const { json: o } of $input.all()) {
  if (o.tags.includes(cfg.review_tag) || o.tags.includes(cfg.cleared_tag)) { skipped.push({ name: o.name, reason: 'already tagged ' + (o.tags.includes(cfg.cleared_tag) ? cfg.cleared_tag : cfg.review_tag) }); continue; }
  const why = []; let score = 0;
  const add = (pts, reason) => { score += pts; why.push(reason + ' (+' + pts + ')'); };
  if (o.risk_level === 'HIGH') add(P.shopify_high, 'Shopify risk high');
  else if (o.risk_level === 'MEDIUM') add(P.shopify_medium, 'Shopify risk medium');
  if (o.recommendation === 'CANCEL') add(P.recommend_cancel, 'Shopify recommends cancel');
  if (o.billing_country && o.shipping_country && o.billing_country !== o.shipping_country) add(P.country_mismatch, 'billing ' + o.billing_country + ', shipping ' + o.shipping_country);
  if (o.orders_count <= 1 && o.total >= cfg.high_value) add(P.first_order_high_value, 'first order of ' + o.total + ' ' + o.currency);
  const addr = o.shipping_text.toLowerCase();
  const fw = cfg.forwarder_words.find(w => addr.includes(w));
  if (fw) add(P.forwarder, 'forwarder address ("' + fw + '")');
  const bulk = o.lines.find(l => l.qty >= cfg.bulk_qty);
  if (bulk) add(P.bulk_quantity, bulk.qty + ' x ' + bulk.title);
  if (cfg.disposable_domains.includes(o.email.split('@')[1])) add(P.disposable_email, 'disposable email');
  if (cfg.risky_countries.includes(o.shipping_country)) add(P.risky_country, 'ships to ' + o.shipping_country);
  const verdict = score >= cfg.hold_score ? 'hold' : score >= cfg.watch_score ? 'watch' : 'clear';
  scored.push({ ...o, score, why, verdict });
}
scored.sort((a, b) => b.score - a.score);
return [{ json: { hold: scored.filter(o => o.verdict === 'hold'), watch: scored.filter(o => o.verdict === 'watch'),
  clear: scored.filter(o => o.verdict === 'clear').map(o => o.name), skipped } }];`),
    code('Split orders to tag', `
// One item per held order, carrying the GraphQL id the tag mutation needs.
const cfg = $('config').first().json;
return $input.first().json.hold.map(o => ({ json: { gid: o.gid, name: o.name, tags: [cfg.review_tag] } }));`),
    ifTrue('Live run?', cfg('live')),
    stop('STOP: dry run - orders untouched'),
    http('Tag the order for review', {
      method: 'POST', url: gql, auth: 'shopifyAccessTokenApi',
      jsonBody: `JSON.stringify({ query: ${JSON.stringify(TAG_MUTATION)}, variables: { id: $json.gid, tags: $json.tags } })`,
    }),
    code('Write the risk alert', `
// One message: held orders first with their reasons, then the watch list.
const cfg = $('config').first().json;
const d = $input.first().json;
const admin = gid => 'https://' + cfg.shop_domain + '/admin/orders/' + gid.split('/').pop();
const line = o => '• <' + admin(o.gid) + '|' + o.name + '> ' + o.total + ' ' + o.currency + ', score ' + o.score + ': ' + o.why.join('; ');
const text = [
  ...(d.hold.length ? [':no_entry: *' + d.hold.length + ' order' + (d.hold.length === 1 ? '' : 's') + ' held for review* (tagged ' + cfg.review_tag + (cfg.mode === 'preview' ? ', dry run' : '') + ')', ...d.hold.map(line), ''] : []),
  ...(d.watch.length ? [':eyes: *Watch* (not tagged)', ...d.watch.map(line)] : []),
].join('\\n').trim();
return [{ json: { text, flagged: d.hold.length + d.watch.length } }];`),
    ifTrue('Anything to flag?', '$json.flagged > 0'),
    stop('STOP: nothing risky'),
    ifTrue('Slack channel set?', cfg('slack_enabled')),
    stop('STOP: no Slack channel'),
    ifTrue('Live alert?', cfg('live')),
    stop('STOP: dry run - nothing posted'),
    slack.post('Alert the fulfilment channel', cfg('slack_channel_id'), '$json.text'),
  ],
  edges: [
    ['Run manually', 'config'], ['Every 30 minutes', 'config'],
    ['config', 'Shopify connected?'],
    ['Shopify connected?', 0, 'Fetch unfulfilled orders'], ['Shopify connected?', 1, 'Load sample orders'],
    ['Fetch unfulfilled orders', 'Read Shopify orders'],
    ['Read Shopify orders', 'Combine order sources'], ['Load sample orders', 0, 'Combine order sources', 1],
    ['Combine order sources', 'Score each order'],
    ['Score each order', 'Split orders to tag'],
    ['Score each order', 'Write the risk alert'],
    ['Split orders to tag', 'Live run?'],
    ['Live run?', 0, 'Tag the order for review'], ['Live run?', 1, 'STOP: dry run - orders untouched'],
    ['Write the risk alert', 'Anything to flag?'],
    ['Anything to flag?', 0, 'Slack channel set?'], ['Anything to flag?', 1, 'STOP: nothing risky'],
    ['Slack channel set?', 0, 'Live alert?'], ['Slack channel set?', 1, 'STOP: no Slack channel'],
    ['Live alert?', 0, 'Alert the fulfilment channel'], ['Live alert?', 1, 'STOP: dry run - nothing posted'],
  ],
  groups: [
    { title: 'Start and settings', why: 'Runs every 30 minutes so an order is scored well before the next packing round. Points, thresholds, word lists and tags all live in `config`.', nodes: ['Run manually', 'Every 30 minutes', 'config'] },
    { title: 'Read unfulfilled orders', why: 'Shopify retired the REST order risk endpoint, so `Fetch unfulfilled orders` asks the GraphQL Admin API for orders and their risk summary in one read-only call. `Load sample orders` mirrors the result until `USE_SHOPIFY` is true.', nodes: ['Shopify connected?', 'Fetch unfulfilled orders', 'Read Shopify orders', 'Load sample orders', 'Combine order sources'] },
    { title: 'Score every order', why: 'Shopify\'s own risk level is one signal among several, because it misses forwarders and bulk resale orders. Already-tagged orders are skipped first, so a cleared order never comes back.', nodes: ['Score each order'] },
    { title: 'Tag and alert', why: 'Only `HOLD_SCORE` orders are tagged; watch orders are listed but left alone. Tagging and posting each sit behind a live check, so a dry run shows the full alert text and changes nothing.', nodes: ['Split orders to tag', 'Live run?', 'STOP: dry run - orders untouched', 'Tag the order for review', 'Write the risk alert', 'Anything to flag?', 'STOP: nothing risky', 'Slack channel set?', 'STOP: no Slack channel', 'Live alert?', 'STOP: dry run - nothing posted', 'Alert the fulfilment channel'] },
  ],
  scenarios: [
    {
      name: 'shipped config (dry run)', start: 'Run manually',
      expect: { reached: ['Load sample orders', 'STOP: dry run - orders untouched', 'STOP: no Slack channel'], outward: 'none' },
      check: out => {
        const f: string[] = [];
        const d = out['Score each order'][0];
        const names = (l: any[]) => l.map((o: any) => o.name).sort().join(',');
        if (names(d.hold) !== '#2102,#2103,#2107') f.push(`hold should be #2102,#2103,#2107, got ${names(d.hold)}`);
        if (names(d.watch) !== '#2101') f.push(`watch should be #2101, got ${names(d.watch)}`);
        if (d.clear.sort().join(',') !== '#2104,#2105') f.push(`clear should be #2104,#2105, got ${d.clear}`);
        if (d.skipped[0]?.name !== '#2106') f.push('#2106 is tagged risk-cleared and should be skipped');
        const s2102 = d.hold.find((o: any) => o.name === '#2102');
        if (s2102?.score !== 85) f.push(`#2102 should score 85 (medium 15, mismatch 20, first order 25, forwarder 25), got ${s2102?.score}`);
        if (out['Split orders to tag'].length !== 3) f.push('3 orders should be prepared for tagging');
        return f;
      },
    },
    {
      name: 'live with Shopify and Slack', start: 'Every 30 minutes',
      overrides: { USE_SHOPIFY: true, DRY_RUN: false, SLACK_CHANNEL_ID: 'C0FULFIL' },
      mocks: {
        'Fetch unfulfilled orders': [{ data: { orders: { nodes: [
          { id: 'gid://shopify/Order/5501', name: '#5501', email: 'X@Tempmail.dev', createdAt: new Date().toISOString(), tags: [],
            totalPriceSet: { shopMoney: { amount: '512.00', currencyCode: 'EUR' } }, customer: { id: 'gid://shopify/Customer/1', numberOfOrders: '1' },
            billingAddress: { countryCode: 'DE' }, shippingAddress: { countryCode: 'NL', address1: 'Havenstraat 9', address2: null, company: null, city: 'Rotterdam' },
            lineItems: { nodes: [{ quantity: 1, title: 'E-bike battery', sku: 'BAT-1' }] }, risk: { recommendation: 'INVESTIGATE', assessments: [{ riskLevel: 'LOW' }, { riskLevel: 'MEDIUM' }] } },
          { id: 'gid://shopify/Order/5502', name: '#5502', email: 'repeat@cityshop.example', createdAt: new Date().toISOString(), tags: [],
            totalPriceSet: { shopMoney: { amount: '40.00', currencyCode: 'EUR' } }, customer: { numberOfOrders: '9' }, billingAddress: { countryCode: 'DE' },
            shippingAddress: { countryCode: 'DE', address1: 'Hauptstr. 1', city: 'Berlin' }, lineItems: { nodes: [{ quantity: 1, title: 'Bell' }] }, risk: { recommendation: 'ACCEPT', assessments: [{ riskLevel: 'LOW' }] } },
        ] } } }],
        'Tag the order for review': (items: any[]) => items.map(() => ({ data: { tagsAdd: { userErrors: [] } } })),
        'Alert the fulfilment channel': [{ ok: true }],
      },
      expect: { reached: ['Tag the order for review', 'Alert the fulfilment channel'], notReached: ['Load sample orders'], outward: 'some' },
      check: out => {
        const f: string[] = [];
        const d = out['Score each order'][0];
        // medium 15 + mismatch 20 + first order 25 + disposable 15 = 75
        if (d.hold.length !== 1 || d.hold[0].score !== 75) f.push(`#5501 should be held at 75, got ${JSON.stringify(d.hold.map((o: any) => o.score))}`);
        if (out['Tag the order for review'].length !== 1) f.push('one order should be tagged');
        if (!out['Write the risk alert'][0].text.includes('/admin/orders/5501')) f.push('alert should link the order in Shopify admin');
        return f;
      },
    },
  ],
});
