// Composes the personalised order-confirmation email. Every number in it is traceable:
// the shipping window comes from plan-the-build (order date + product lead rules), never
// invented here. If the rules cannot support a window, the email says the window is
// coming rather than quoting one.
function esc(v) {
  return String(v == null ? '' : v).replace(/[<>&"]/g, function (c) {
    return { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c];
  });
}
function prettyDate(d) {
  const months = ['January','February','March','April','May','June','July','August',
    'September','October','November','December'];
  const p = d.split('-');
  if (p.length !== 3) return d;
  const m = Number(p[1]) - 1;
  return (months[m] || p[1]) + ' ' + Number(p[2]) + ', ' + p[0];
}

const cfg = $('config').first().json;
const item = $input.first().json;
const order = item.order || {};
const plan = item.plan || {};

const lines = (plan.line_plan || []).map(function (lp) {
  const spec = (lp.spec ? ' — ' + esc(lp.spec) : '');
  return '<tr><td style="padding:6px 0">' + esc(lp.name) + spec + '</td>' +
         '<td style="padding:6px 0;text-align:right">x' + lp.qty + '</td></tr>';
}).join('');

const hasWindow = plan.can_promise && plan.window_start && plan.window_end;
const windowLine = hasWindow
  ? '<p>Your order is in the build queue. Based on current production lead times, it is ' +
    'due to ship <strong>between ' + prettyDate(plan.window_start) + ' and ' +
    prettyDate(plan.window_end) + '</strong>. We will email you the tracking the moment ' +
    'it leaves the workshop.</p>'
  : '<p>Your order is in the build queue. We will confirm your shipping window by email ' +
    'shortly, and send tracking the moment your piece leaves the workshop.</p>';

const subject = (cfg.confirm_subject || 'Your {company} order {order} — thank you')
  .replace('{company}', cfg.company_name)
  .replace('{order}', order.order_id || '');

const html =
  '<p>Hi ' + esc(order.customer_name || 'there') + ',</p>' +
  '<p>Thank you for your order with ' + esc(cfg.company_name) + '. Here is what we are ' +
  'making for you:</p>' +
  '<table>' + lines + '</table>' +
  windowLine +
  '<p>One of our makers will email you if anything about the spec needs a decision ' +
  'before we start.</p>' +
  '<p>— ' + esc(cfg.from_name || cfg.company_name) + '</p>';

const textLines = (plan.line_plan || []).map(function (lp) {
  return '  - ' + lp.qty + 'x ' + lp.name + (lp.spec ? ' (' + lp.spec + ')' : '');
}).join('\n');
const text =
  'Hi ' + (order.customer_name || 'there') + ',\n\n' +
  'Thank you for your order with ' + cfg.company_name + '. Here is what we are making ' +
  'for you:\n' + textLines + '\n' +
  (hasWindow
    ? 'It is due to ship between ' + prettyDate(plan.window_start) + ' and ' +
      prettyDate(plan.window_end) + '. We will email the tracking the moment it leaves ' +
      'the workshop.\n'
    : 'We will confirm your shipping window by email shortly.\n') +
  '\n— ' + (cfg.from_name || cfg.company_name);

return [{
  json: Object.assign({}, item, {
    customer_email: order.email || '',
    customer_subject: subject,
    customer_html: html,
    customer_text: text
  })
}];
