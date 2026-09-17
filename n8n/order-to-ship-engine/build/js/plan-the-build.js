// Plans the build for one new order: checks every line item against PRODUCT_RULES,
// works out the shipping window (working days only — never a promise on a weekend), and
// builds the board row. A sku with no rule is a GAP, not a guess: the email must not
// promise a date the rules cannot support.
function parseDate(s) {
  // '2026-09-02 09:41' or an ISO string.
  const t = String(s || '').trim();
  if (!t) return null;
  const d = new Date(t.indexOf('T') >= 0 ? t : t.replace(' ', 'T'));
  return isNaN(d.getTime()) ? null : d;
}
function addWorkdays(d, n) {
  let x = new Date(d.getTime());
  let left = n;
  while (left > 0) {
    x.setDate(x.getDate() + 1);
    const dow = x.getDay();
    if (dow !== 0 && dow !== 6) left--;
  }
  return x;
}
function fmt(d) {
  const p = (n) => (n < 10 ? '0' : '') + n;
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}
function esc(v) {
  return String(v == null ? '' : v).replace(/[<>&"]/g, function (c) {
    return { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c];
  });
}

const cfg = $('config').first().json;
const incoming = $input.first().json;
const order = incoming.order || {};
const rules = (cfg.product_rules || []).reduce(function (m, r) {
  m[String(r.sku).trim().toLowerCase()] = r;
  return m;
}, {});

const gaps = [];
const linePlan = (order.line_items || []).map(function (li) {
  const rule = rules[String(li.sku).trim().toLowerCase()];
  const base = { sku: li.sku, name: li.name || li.sku, qty: li.qty || 1,
                 dim_m: li.dim_m || '' };
  if (!rule) {
    gaps.push(li.sku || li.name || 'an unnamed item');
    return Object.assign(base, { lead_days: 0, known: false });
  }
  return Object.assign(base, {
    lead_days: Number(rule.lead_days) || 0,
    anchors: rule.anchors || { mode: 'none' },
    manual: rule.manual || '',
    note: rule.note || '',
    known: true
  });
});

let windowStart = null, windowEnd = null, maxLead = 0;
const placed = parseDate(order.placed) || new Date();
if (gaps.length === 0) {
  maxLead = linePlan.reduce(function (m, lp) { return Math.max(m, lp.lead_days); }, 0);
  const b0 = Number(cfg.window_start_days) || 0;
  const b1 = Number(cfg.window_end_days) || 0;
  windowStart = addWorkdays(placed, maxLead + b0);
  windowEnd = addWorkdays(placed, maxLead + Math.max(b1, b0));
}

const cols = cfg.columns || {};
const h = (k) => cols[k] || k;
const itemsJson = JSON.stringify((order.line_items || []).map(function (li) {
  return { sku: li.sku, name: li.name, qty: li.qty, dim_m: li.dim_m, spec: li.spec };
}));

const row = {};
const placedTime = String(order.placed || '').slice(11, 16);
row[h('order_key')] = incoming.order_key;
row[h('source')] = order.source_label || order.source || '';
row[h('order_id')] = order.order_id || '';
row[h('placed')] = fmt(placed) + (placedTime ? ' ' + placedTime : '');
row[h('customer')] = order.customer_name || '';
row[h('email')] = order.email || '';
row[h('items')] = itemsJson;
row[h('spec')] = order.spec_summary || '';
row[h('window_start')] = windowStart ? fmt(windowStart) : '';
row[h('window_end')] = windowEnd ? fmt(windowEnd) : '';
row[h('stage')] = cfg.stage_on_arrival || 'New order';
row[h('confirmation_sent')] = '';
row[h('carrier')] = '';
row[h('tracking')] = '';
row[h('ship_date')] = '';
row[h('ship_email_sent')] = '';
row[h('notes')] = '';

return [{
  json: Object.assign({}, incoming, {
    row: row,
    plan: {
      can_promise: gaps.length === 0,
      gaps: gaps,
      max_lead_days: maxLead,
      window_start: windowStart ? fmt(windowStart) : '',
      window_end: windowEnd ? fmt(windowEnd) : '',
      line_plan: linePlan
    },
    _can_promise: gaps.length === 0,
    _gate_pass: !(cfg.hold_unruly === true && gaps.length > 0)
  })
}];
