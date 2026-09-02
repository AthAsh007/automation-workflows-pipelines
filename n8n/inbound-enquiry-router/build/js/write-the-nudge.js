// The nudge to one owner. It names the enquiries, says how long each has been sitting,
// and gives a one-line next action - a reminder you can act on without opening a tab.
const cfg = $('config').first().json;
const g = $input.first().json;

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const INK = '#1b1d21', MUTED = '#5c6470', LINE = '#e4e7eb', WARN = '#b4531a';
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

const days = (h) => h >= 48 ? Math.floor(h / 24) + ' days' : h + ' hours';

const rowsHtml = g.items.map((it) =>
  '<tr>' +
  '<td style="padding:10px 14px 10px 0;border-top:1px solid ' + LINE + ';font:600 14px/1.5 ' + FONT + ';color:' + INK + '">' +
    esc(it.company) + '<br><span style="font-weight:400;color:' + MUTED + '">' + esc(it.ref) +
    (it.postcode ? ' &middot; ' + esc(it.postcode) : '') + '</span></td>' +
  '<td style="padding:10px 14px 10px 0;border-top:1px solid ' + LINE + ';font:400 14px/1.5 ' + FONT + ';color:' + WARN + ';white-space:nowrap">' +
    esc(days(it.quiet_hours)) + '</td>' +
  '<td style="padding:10px 0;border-top:1px solid ' + LINE + ';font:400 14px/1.5 ' + FONT + ';color:' + MUTED + '">' +
    esc(it.stage) + (it.next_action ? '<br>' + esc(it.next_action) : '') + '</td>' +
  '</tr>').join('');

const html =
  '<div style="font:400 15px/1.6 ' + FONT + ';color:' + INK + ';max-width:600px">' +
  '<p style="margin:0 0 4px"><strong>' + esc(g.owner) + '</strong>, ' + g.items.length +
  (g.items.length === 1 ? ' enquiry has' : ' enquiries have') + ' had no movement for over ' +
  esc(String(cfg.chase_after_hours)) + ' hours.</p>' +
  '<p style="margin:0 0 18px;color:' + MUTED + '">Chase it, quote it, or mark it lost in the sheet — any of the three clears it from this list.</p>' +
  '<table cellpadding="0" cellspacing="0" border="0" width="100%">' + rowsHtml + '</table>' +
  '</div>';

const text = [
  g.owner + ', ' + g.items.length + (g.items.length === 1 ? ' enquiry has' : ' enquiries have') +
    ' had no movement for over ' + cfg.chase_after_hours + ' hours.',
  'Chase it, quote it, or mark it lost in the sheet - any of the three clears it from this list.',
  ''
].concat(g.items.map((it) =>
  '- ' + it.company + ' (' + it.ref + (it.postcode ? ', ' + it.postcode : '') + ')' +
  '\n  quiet for ' + days(it.quiet_hours) + ', stage: ' + it.stage +
  (it.next_action ? '\n  next: ' + it.next_action : '')
)).join('\n');

return [{
  json: Object.assign({}, g, {
    nudge_subject: g.items.length + (g.items.length === 1 ? ' enquiry needs' : ' enquiries need') +
      ' a chase — ' + g.owner,
    nudge_html: html,
    nudge_text: text
  })
}];
