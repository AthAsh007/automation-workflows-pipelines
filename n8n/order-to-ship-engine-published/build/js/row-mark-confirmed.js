// Builds the sheet-update object AFTER the confirmation email really went out (test or
// live mode): the confirmation timestamp and the Confirmed stage. Reads the plan node
// rather than the mail node's output, because a send node does not guarantee it passes
// the order through. Only heading columns are emitted; matching is on 'Order key'.
function nowText() {
  const d = new Date();
  const p = (n) => (n < 10 ? '0' : '') + n;
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' +
         p(d.getHours()) + ':' + p(d.getMinutes());
}
const cfg = $('config').first().json;
const cols = cfg.columns || {};
const h = (k) => cols[k] || k;
const plan = $('plan the build').first().json;
const out = {};
out[h('order_key')] = plan.row[h('order_key')] != null ? plan.row[h('order_key')] : plan.order_key;
out[h('confirmation_sent')] = nowText();
out[h('stage')] = cfg.stage_confirmed || 'Confirmed';
return [{ json: out }];
