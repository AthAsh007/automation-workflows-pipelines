// Runs both workflows' Code nodes against the sample payloads and the demo board, so the
// logic can be checked before anything is imported into n8n.
//   node simulate.js
//
// This is a simulation of the GRAPH, not of n8n: branches are walked by hand in the same
// order the workflow would take them, and every external call (Sheets, Gmail, ShipStation)
// is represented by feeding the right items into the next Code node.
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const WF = {};
for (const f of ['01-capture-and-confirm.json', '02-progress-and-ship.json']) {
  const wf = JSON.parse(fs.readFileSync(path.join(ROOT, '..', f), 'utf8'));
  for (const n of wf.nodes) if (n.type === 'n8n-nodes-base.code') WF[n.name] = n;
}
const sample = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, '..', 'sample', f), 'utf8'));

const store = {};
function run(nodeName, inputItems, overrides) {
  const node = WF[nodeName];
  if (!node) throw new Error('no Code node named ' + nodeName);
  const items = inputItems;
  const ctx = Object.assign({}, store, overrides || {});
  const wrap = (arr) => arr.map((j) => ({ json: j }));
  const $input = { all: () => wrap(items), first: () => ({ json: items[0] }),
                   last: () => ({ json: items[items.length - 1] }) };
  const $ = (name) => {
    const arr = ctx[name];
    if (!arr) throw new Error('simulate: node "' + name + '" has no recorded output — ' +
      'run it first');
    return { all: () => wrap(arr), first: () => ({ json: arr[0] }),
             last: () => ({ json: arr[arr.length - 1] }) };
  };
  const out = new Function('$input', '$', '"use strict";' + node.parameters.jsCode)($input, $);
  store[nodeName] = out.map((o) => o.json);
  return store[nodeName];
}

let failures = 0;
const expect = (label, got, want) => {
  const ok = String(got) === String(want);
  console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  ' + label.padEnd(46) + got);
  if (!ok) { failures++; console.log('        expected: ' + want); }
};
const ok = (label, cond) => expect(label, !!cond, 'true');

// ---------------------------------------------------------------- config
const cfg = run('config', [{}])[0];
console.log('config: mode ' + cfg.mode + ', board_ready ' + cfg.board_ready +
  ', demo_mode ' + cfg.demo_mode + ', ' + cfg.product_rules.length + ' product rules\n');

// ---------------------------------------------------------------- workflow 1
console.log('--- workflow 1: an order arrives ---');

const capture = (payload, label) => {
  const read = run('read the order', [payload])[0];
  if (!read._ok) {
    const stopped = run('STOP: not a usable order', [read])[0];
    console.log('  ' + label + ': rejected — ' + stopped._reason);
    return null;
  }
  const rows = run('use the demo board', [{}]);
  const seen = run('seen this order before?', rows)[0];
  if (seen._known) {
    const dup = run('STOP: duplicate delivery', [seen])[0];
    console.log('  ' + label + ': duplicate — ' + dup._reason);
    return null;
  }
  const plan = run('plan the build', [seen])[0];
  if (!plan._gate_pass) {
    const held = run('STOP: needs a product rule', [plan])[0];
    console.log('  ' + label + ': held — ' + held._reason);
    return null;
  }
  const compose = run('compose the confirmation', [plan])[0];
  return { read, seen, plan, compose };
};

const shopify = capture(sample('shopify-order.json'), 'Shopify');
expect('source detected', shopify.read.order.source, 'shopify');
expect('order id read', shopify.read.order.order_id, '5103');
expect('customer email read', shopify.read.order.email, 'dana.whitfield@example.com');
expect('two line items read', shopify.read.order.line_items.length, 2);
expect('order key', shopify.read.order_key, 'shopify|5103');
expect('not seen before', shopify.seen._known, 'false');
expect('all products ruled', shopify.plan._gate_pass, 'true');
expect('ship window promised', shopify.plan.plan.can_promise, 'true');
expect('row stage on arrival', shopify.plan.row.Stage, 'New order');
expect('confirmation is personalised', shopify.compose.customer_html.includes('Walnut dining table'), 'true');
expect('window is in the email', shopify.compose.customer_text.includes('between '), 'true');
expect('window start is order date + 14-day lead + 3 working days',
  shopify.plan.plan.window_start, '2026-10-02');
expect('window end is order date + lead + 8 working days',
  shopify.plan.plan.window_end, '2026-10-09');
expect('window lands on the row', shopify.plan.row['Ship window start'], '2026-10-02');

const demoStop = run('STOP: demo - nothing written or sent', [shopify.plan])[0];
expect('demo stop shows the row', demoStop.row['Order key'], 'shopify|5103');
expect('demo stop carries the email', demoStop.email.subject.indexOf('5103') >= 0, 'true');
expect('demo forced to preview (fabricated customer)', run('config', [{}])[0].mode, 'preview');

const dupEtsy = capture(sample('etsy-order-duplicate.json'), 'Etsy (redelivered)');
expect('duplicate caught', dupEtsy, 'null');

const square = capture(sample('square-order-paid.json'), 'Square (deposit paid)');
expect('square source detected', square.read.order.source, 'square');
expect('square usable after deposit', square.read._ok, 'true');

const squareWait = capture(sample('square-order-unpaid.json'), 'Square (no deposit yet)');
expect('square held until deposit', squareWait, 'null');

const unruly = sample('shopify-order.json');
unruly.line_items[0].sku = 'PROTO-NEW-1';
const unrulyCapture = capture(unruly, 'unruly item');
expect('unruly product held at the rule gate', unrulyCapture, 'null');
const unrulyOrder = Object.assign({}, shopify.read.order, {
  line_items: [{ sku: 'PROTO-NEW-1', name: 'Prototype', qty: 1, dim_m: '', spec: '' }] });
const unrulyPlan = run('plan the build',
  [Object.assign({}, shopify.read, { order: unrulyOrder })])[0];
expect('gate fails for missing rule', unrulyPlan._gate_pass, 'false');
expect('gap names the sku', JSON.stringify(unrulyPlan.plan.gaps), '["PROTO-NEW-1"]');

// A payload that is not an order at all.
const garbage = run('read the order', [{ hello: 'world' }])[0];
expect('non-order rejected', garbage._ok, 'false');

// n8n sometimes wraps the webhook body under 'body', or hands it over as a JSON string.
// The parser must survive both.
const wrapped = run('read the order', [{ body: sample('shopify-order.json') }])[0];
expect('body-wrapped payload still parses', wrapped.order_key, 'shopify|5103');
const asString = run('read the order', [{ body: JSON.stringify(sample('shopify-order.json')) }])[0];
expect('string body still parses', asString.order_key, 'shopify|5103');

// mark-confirmed writes heading columns only, matched on Order key. The plan node in
// store is the unruly one now, so re-run it for the real order first.
run('plan the build', [shopify.read]);
store['config'] = [Object.assign({}, cfg, { stage_confirmed: 'Confirmed' })];
const confirmedRow = run('row: mark confirmed', [shopify.plan])[0];
expect('confirmation row matches order key', confirmedRow['Order key'], 'shopify|5103');
expect('confirmation row stamps the stage', confirmedRow.Stage, 'Confirmed');
expect('confirmation row has a timestamp', /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(confirmedRow['Confirmation sent']), 'true');
expect('no machinery keys leak', Object.keys(confirmedRow).sort().join(','),
       'Confirmation sent,Order key,Stage');
store['config'] = [cfg];

// ---------------------------------------------------------------- workflow 2
console.log('\n--- workflow 2: the board run ---');

const boardRows = run('use the demo board', [{}]);
expect('demo board rows', boardRows.length, 6);
const analysis = run('read the board', boardRows)[0];
expect('rows read', analysis.rows_read, 6);
expect('ready for shipping email', analysis.to_ship.length, 2);
expect('  ...only ever emailed once is skipped',
  analysis.to_ship.every((r) => r['Order key'] !== 'etsy|2190'), 'true');
expect('open rows left alone',
  analysis.to_ship.every((r) => ['In production', 'New order', 'Delivered'].indexOf(r.Stage) < 0), 'true');
expect('shipped before confirmation', analysis.unconfirmed.length, 1);
expect('  ...and it is the square order', analysis.unconfirmed[0]['Order key'], 'square|ORD-9081');

// --- the never-shipped-unconfirmed hold
const held = run('STOP: never shipped unconfirmed', [analysis]);
expect('held row is the unconfirmed one', held[0]['Order key'], 'square|ORD-9081');
expect('hold says why', held[0]._reason.indexOf('Confirmation sent is blank') >= 0, 'true');

// --- each shipper, through tracking resolution
const shippers = run('split the shippers', [analysis]);
expect('one item per order', shippers.length, 2);

const withTracking = shippers.filter((r) => r._tracking_pasted)[0];
const pasted = run('tracking from the board', [withTracking])[0];
expect('tracking source', pasted._tracking_source, 'board');
expect('tracking found from the row', pasted._tracking_found, 'true');
expect('carrier kept', pasted.carrier, 'UPS');
expect('number kept', pasted.tracking, '1Z999AA10123456784');

const shipMail = run('compose the shipping email', [pasted])[0];
expect('ship email has the tracking', shipMail.customer_text.indexOf('1Z999AA10123456784') >= 0, 'true');
expect('ship email says the carrier', shipMail.customer_text.indexOf('UPS') >= 0, 'true');
expect('anchors computed: shelf per-metre rule (2/m over 1.2 m)',
  shipMail.customer_html.indexOf('3 anchors') >= 0, 'true');
expect('anchors computed: bracket kit fixed rule',
  shipMail.customer_html.indexOf('8 anchors') >= 0, 'true');
expect('manual link comes from the product rule',
  shipMail.customer_html.indexOf('https://example.com/manuals/oak-shelf-120.pdf') >= 0, 'true');

// a free-standing piece (dining table) says so instead of quoting anchors, and a
// two-bracket order scales the fixed rule by quantity
const tableRow = boardRows.filter((r) => r['Order key'] === 'shopify|5102')[0];
const shippedTable = Object.assign({}, tableRow, { Stage: 'Shipped',
  'Tracking no.': 'TRK-TBL-0001', Carrier: 'FedEx', 'Shipped date': '2026-09-20' });
const tableMail = run('compose the shipping email', [shippedTable])[0];
expect('free-standing piece says so',
  tableMail.customer_html.indexOf('free-standing — no wall anchors needed') >= 0, 'true');
expect('fixed rule scales with quantity (2 bracket kits = 16 anchors)',
  tableMail.customer_html.indexOf('16 anchors') >= 0, 'true');

const previewShip = run('STOP: preview - shipping email not sent', [shipMail])[0];
expect('preview carries the email', previewShip.customer_subject.indexOf('2218') >= 0, 'true');

const markShip = run('row: mark shipped', [pasted])[0];
expect('ship record matches order key', markShip['Order key'], 'etsy|2218');
expect('ship record stamps sent time', /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(markShip['Ship email sent']), 'true');
expect('ship record writes the number', markShip['Tracking no.'], '1Z999AA10123456784');

const noTrackingRow = shippers.filter((r) => !r._tracking_pasted)[0];
const noTrack = run('no tracking available', [noTrackingRow])[0];
expect('no tracking found', noTrack._tracking_found, 'false');
expect('  ...reason names the gap', noTrack._reason.indexOf('no tracking number on the row') >= 0, 'true');
const heldTrack = run('STOP: shipped - no tracking', [noTrack])[0];
expect('held at the tracking gate', heldTrack._outcome, 'held');

// idempotency: once a row is marked, the next run leaves it alone
const nextRun = boardRows.map((r) => Object.assign({}, r));
const etsyRow = nextRun.filter((r) => r['Order key'] === 'etsy|2218')[0];
etsyRow['Ship email sent'] = markShip['Ship email sent'];
const nextAnalysis = run('read the board', nextRun)[0];
expect('already-emailed order not re-emailed',
  nextAnalysis.to_ship.every((r) => r['Order key'] !== 'etsy|2218'), 'true');

// quiet board: every row terminal or already done -> nothing to do
const calm = run('read the board',
  boardRows.map((r) => Object.assign({}, r, { Stage: 'Delivered' })))[0];
expect('nothing to ship on a quiet board', calm._has_to_ship, 'false');
expect('nothing unconfirmed on a quiet board', calm._has_unconfirmed, 'false');

console.log('\n--- the confirmation email, as the customer would read it ---\n');
console.log(shopify.compose.customer_text);

console.log('\n--- the shipping email, as the customer would read it ---\n');
console.log(shipMail.customer_text);

console.log('\n' + (failures ? failures + ' CHECK(S) FAILED' : 'all checks passed'));
process.exitCode = failures ? 1 : 0;
