// After the shipping email really went out (test or live): record what happened on the
// row so the next run leaves it alone. Headings only, matched on 'Order key'.
function nowText() {
  const d = new Date();
  const p = (n) => (n < 10 ? '0' : '') + n;
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' +
         p(d.getHours()) + ':' + p(d.getMinutes());
}
const cfg = $('config').first().json;
const cols = cfg.columns || {};
const h = (k) => cols[k] || k;
const item = $input.first().json;
const out = {};
out[h('order_key')] = String(item[h('order_key')] != null ? item[h('order_key')] : '');
out[h('carrier')] = String(item.carrier || '');
out[h('tracking')] = String(item.tracking || '');
out[h('ship_date')] = String(item.ship_date || '');
out[h('ship_email_sent')] = nowText();
return [{ json: out }];
