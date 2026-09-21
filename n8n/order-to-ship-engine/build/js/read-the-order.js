// Turns whatever the store posted into ONE common order object, whatever the store is.
// Shopify, Etsy and Square all name their fields differently, so the parser detects the
// source and digs the same facts out of each shape. An unknown shape is rejected with a
// reason, never half-read.
//
// Output: one item carrying `order` (the common shape) and `_ok` / `_problems`.
const CFG = () => $('config').first().json;

function esc(v) {
  return String(v == null ? '' : v).replace(/[<>&"]/g, function (c) {
    return { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c];
  });
}
function text(v) {
  return String(v == null ? '' : v).trim();
}

function cleanLines(lines, get) {
  const out = [];
  for (const li of (lines || [])) {
    const g = get(li);
    if (!g) continue;
    const qty = Math.max(1, Math.round(Number(g.qty) || 1));
    out.push({ sku: text(g.sku), name: text(g.name), qty: qty,
               dim_m: text(g.dim_m), spec: text(g.spec) });
  }
  return out;
}

function parse(raw, cfg) {
  const problems = [];
  const src = detect(raw);
  if (!src) {
    problems.push('did not match a Shopify, Etsy or Square order shape');
    return { _ok: false, _problems: problems, order: null };
  }

  let order = null;
  if (src === 'shopify') order = shopifyOrder(raw, cfg);
  if (src === 'etsy')    order = etsyOrder(raw, cfg);
  if (src === 'square')  order = squareOrder(raw, cfg);
  if (!order) {
    problems.push('could not read the order fields from the payload');
    return { _ok: false, _problems: problems, order: null };
  }

  // The rules for what a usable order is, in one place.
  if (!order.email || order.email.indexOf('@') < 0) problems.push('no usable customer email');
  if (!order.order_id) problems.push('no order number');
  if (!order.line_items || order.line_items.length === 0) problems.push('no line items');
  for (const li of order.line_items || []) {
    if (!li.sku) problems.push('a line item has no sku (map it in PRODUCT_RULES)');
  }
  const deposits = cfg.deposit_sources || [];
  if (deposits.indexOf(order.source) >= 0 && order.deposit_paid !== true) {
    problems.push('deposit not yet received (Square custom order waits for it)');
  }

  order.source_label = (cfg.source_labels || {})[order.source] || order.source;
  return { _ok: problems.length === 0, _problems: problems, order: order };
}

function detect(raw) {
  if (!raw || typeof raw !== 'object') return '';
  if (raw.line_items && (raw.email || (raw.customer && raw.customer.email))) return 'shopify';
  if (raw.receipt && raw.receipt.transactions) return 'etsy';
  if (raw.transactions && raw.buyer_email) return 'etsy';
  if (raw.payment || (raw.data && raw.data.object && raw.data.object.payment)) return 'square';
  if (raw.data && raw.data.object && raw.data.object.order) return 'square';
  if (raw.fulfillments || raw.tenders || raw.location_id) return 'square';
  return '';
}

function shopifyOrder(r, cfg) {
  const c = (r.customer || {});
  const name = text(c.first_name || c.name) + (text(c.last_name) ? ' ' + text(c.last_name) : '');
  return {
    source: 'shopify',
    order_id: text(r.id || r.name),
    placed: (text(r.created_at) || '').slice(0, 16).replace('T', ' '),
    customer_name: name || 'Shopify customer',
    email: text(r.email || c.email),
    line_items: cleanLines(r.line_items, (li) => ({
      sku: li.sku || li.variant_sku || li.product_id,
      name: li.title || li.name, qty: li.quantity, dim_m: '', spec: ''
    })),
    spec_summary: text(r.note),
    deposit_paid: true,
    raw_order_id: r.id
  };
}

function etsyOrder(r, cfg) {
  const receipt = r.receipt || {};
  const tx = receipt.transactions || r.transactions || [];
  const placed = Number(receipt.create_timestamp || r.create_timestamp);
  return {
    source: 'etsy',
    order_id: text(receipt.receipt_id || r.receipt_id),
    placed: placed ? new Date(placed * 1000).toISOString().slice(0, 16).replace('T', ' ')
                   : '',
    customer_name: text(receipt.name || r.name || 'Etsy customer'),
    email: text(receipt.buyer_email || r.buyer_email),
    line_items: cleanLines(tx, (li) => {
      const pd = (li.product_data && typeof li.product_data === 'object') ? li.product_data : {};
      return { sku: pd.sku || li.sku || li.product_id || li.listing_id,
               name: li.title || li.name, qty: li.quantity, dim_m: '', spec: '' };
    }),
    spec_summary: '',
    deposit_paid: true,
    raw_order_id: receipt.receipt_id
  };
}

function squareOrder(r, cfg) {
  // A Square 'payment.updated' webhook carries the payment; an 'order.created' webhook
  // (before the deposit lands) carries only the order. Both must read as square — the
  // deposit gate then holds the order.created one until the payment arrives.
  const pay = (r.payment) || (r.data && r.data.object && r.data.object.payment) || {};
  const ord = (r.data && r.data.object && r.data.object.order) || r.order || {};
  const items = ((pay.line_items && pay.line_items.length) ? pay.line_items
                                                          : (ord.line_items || []));
  const hasPay = Object.keys(pay).length > 0;
  return {
    source: 'square',
    order_id: text(pay.order_id || ord.id),
    placed: (text(pay.created_at || ord.created_at || '')).slice(0, 16).replace('T', ' '),
    customer_name: text(pay.buyer_name || ord.customer_name || 'Square customer'),
    email: text(pay.receipt_email || pay.buyer_email_address || ord.buyer_email_address),
    line_items: cleanLines(items, (li) => ({
      sku: li.sku || li.catalog_object_id || li.uid,
      name: li.name, qty: li.quantity, dim_m: '', spec: ''
    })),
    spec_summary: text(pay.note || ord.note || ''),
    deposit_paid: hasPay && ['COMPLETED', 'APPROVED', 'CAPTURED']
      .indexOf(text(pay.status).toUpperCase()) >= 0,
    raw_order_id: pay.id || ord.id
  };
}

// What n8n hands the Code node depends on how the webhook received the POST: sometimes
// the parsed body sits at the top of $json, sometimes under 'body', and occasionally as
// a JSON *string*. Try every candidate until one reads as an order, so the store's
// webhook is not at the mercy of n8n's wrapping. If nothing reads, the reason says which
// keys were actually seen — that is the debugging breadcrumb.
function toObject(x) {
  if (!x) return null;
  if (typeof x === 'string') {
    try { return JSON.parse(x); } catch (e) { return null; }
  }
  return (typeof x === 'object') ? x : null;
}

const cfg = CFG();
const incoming = toObject($input.first().json) || {};
const candidates = [incoming];
const body = toObject(incoming.body);
if (body) {
  candidates.push(body);
  const inner = toObject(body.body);
  if (inner) candidates.push(inner);
}

let parsed = null;
for (const c of candidates) {
  const p = parse(c, cfg);
  if (p.order && p.order.source) { parsed = p; break; }
  parsed = parsed || p;
}
if (!parsed) parsed = parse({}, cfg);

const order = parsed.order || {};
const seenKeys = Object.keys(incoming).join(',');
return [{
  json: Object.assign({
    order:     order,
    order_key: order.source ? (order.source + '|' + order.order_id) : '',
    _ok:       parsed._ok,
    _problems: parsed._problems.concat(
      order.source ? [] : ['webhook body keys seen: ' + (seenKeys || '(empty)')])
  }, order ? { _email: esc(order.email || '') } : {})
}];
