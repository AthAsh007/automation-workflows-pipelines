// Composes the personalised shipping + installation email for one shipped order. Every
// number in it is computed here from PRODUCT_RULES and the row's own line items — the
// anchor counts and manual links are rules in config, not prose. If a rule is missing,
// that line says the guide travels with the shipment instead of inventing a link.
function esc(v) {
  return String(v == null ? '' : v).replace(/[<>&"]/g, function (c) {
    return { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c];
  });
}
function fmtDate(d) {
  const months = ['January','February','March','April','May','June','July','August',
    'September','October','November','December'];
  const p = String(d || '').split('-');
  if (p.length !== 3) return d || '';
  return (months[Number(p[1]) - 1] || p[1]) + ' ' + Number(p[2]) + ', ' + p[0];
}
function parseItems(raw) {
  try {
    const arr = JSON.parse(raw || '[]');
    return Array.isArray(arr) ? arr : [];
  } catch (e) { return []; }
}
function anchorsFor(rule, qty, line) {
  const a = rule.anchors || { mode: 'none' };
  if (a.mode === 'none') return { text: 'free-standing — no wall anchors needed', n: 0 };
  if (a.mode === 'fixed') return { text: (Number(a.qty) || 0) * qty + ' anchors',
                                   n: (Number(a.qty) || 0) * qty };
  if (a.mode === 'per_metre') {
    const m = parseFloat(line.dim_m);
    if (!(m > 0)) return { text: 'anchors sized to the length (rule is per metre)', n: -1 };
    const total = m * qty;
    const n = Math.ceil(total * (Number(a.qty) || 0));
    return { text: n + ' anchors (2 per metre over ' + total + ' m)', n: n };
  }
  return { text: '', n: -1 };
}

const cfg = $('config').first().json;
const cols = cfg.columns || {};
const h = (k) => cols[k] || k;
const item = $input.first().json;
const rules = (cfg.product_rules || []).reduce(function (m, r) {
  m[String(r.sku).trim().toLowerCase()] = r;
  return m;
}, {});

const lines = parseItems(item[h('items')]);
const built = lines.map(function (li) {
  const rule = rules[String(li.sku || '').trim().toLowerCase()];
  const qty = Math.max(1, Number(li.qty) || 1);
  if (!rule) return { name: li.name || li.sku, qty: qty,
                      anchor: 'installation guide travels with the shipment',
                      manual: '', note: '' };
  const a = anchorsFor(rule, qty, li);
  return { name: rule.name || li.name, qty: qty, anchor: a.text, manual: rule.manual || '',
           note: rule.note || '' };
});

const anchorRows = built.filter((b) => b.anchor).map(function (b) {
  return '<tr><td style="padding:6px 0">' + esc(b.name) + ' &times; ' + b.qty +
         '</td><td style="padding:6px 0;text-align:right">' + esc(b.anchor) + '</td></tr>';
}).join('');
const manuals = built.map((b) => b.manual).filter((m) => m)
  .filter(function (m, idx, arr) { return arr.indexOf(m) === idx; });
const manualLines = manuals.map(function (m) {
  return '<li><a href="' + esc(m) + '">' + esc(m) + '</a></li>';
}).join('');

const tracking = String(item[h('tracking')] || '').trim();
const carrier = String(item[h('carrier')] || '').trim();
const orderNo = String(item[h('order_id')] || '').trim();

const subject = (cfg.ship_subject || 'Your {company} order {order} has shipped')
  .replace('{company}', cfg.company_name)
  .replace('{order}', orderNo);

const html =
  '<p>Hi ' + esc(item[h('customer')] || 'there') + ',</p>' +
  '<p>Good news — your order has left the workshop' +
  (carrier ? ' with ' + esc(carrier) : '') + '.</p>' +
  '<p><strong>Tracking:</strong> ' + esc(tracking) +
  (carrier ? ' (' + esc(carrier) + ')' : '') +
  (String(item[h('ship_date')] || '').trim()
    ? ' &middot; shipped ' + esc(fmtDate(item[h('ship_date')])) : '') + '</p>' +
  '<h3>What you need for installation</h3>' +
  '<table>' + anchorRows + '</table>' +
  (manualLines ? '<h3>Installation manuals</h3><ul>' + manualLines + '</ul>' : '') +
  '<p>If anything arrives damaged, photograph the packaging before you open it and ' +
  'email us within 48 hours.</p>' +
  '<p>— ' + esc(cfg.from_name || cfg.company_name) + '</p>';

const textLines = built.map(function (b) {
  return '  - ' + b.qty + 'x ' + b.name + ' — ' + b.anchor;
}).join('\n');
const text =
  'Hi ' + (item[h('customer')] || 'there') + ',\n\n' +
  'Good news — your order has left the workshop' +
  (carrier ? ' with ' + carrier : '') + '.\n' +
  'Tracking: ' + tracking + (carrier ? ' (' + carrier + ')' : '') +
  (String(item[h('ship_date')] || '').trim()
    ? ' — shipped ' + fmtDate(item[h('ship_date')]) : '') + '\n\n' +
  'What you need for installation:\n' + textLines + '\n' +
  (manuals.length ? '\nInstallation manuals:\n' +
    manuals.map(function (m) { return '  - ' + m; }).join('\n') + '\n' : '\n') +
  '\n— ' + (cfg.from_name || cfg.company_name);

return [{
  json: Object.assign({}, item, {
    customer_email: item[h('email')] || '',
    customer_subject: subject,
    customer_html: html,
    customer_text: text
  })
}];
