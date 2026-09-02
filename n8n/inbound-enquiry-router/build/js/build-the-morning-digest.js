// The at-a-glance email. Everything open, grouped by stage, oldest first, on one
// screen. This is the "what stage is everything at" answer without opening the sheet.
const cfg = $('config').first().json;
const a = $input.first().json;

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const INK = '#1b1d21', MUTED = '#5c6470', LINE = '#e4e7eb', WARN = '#b4531a', OK = '#1a6b4a';
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

const today = new Date().toISOString().slice(0, 10);
const board = a.board || {};
const ordered = (cfg.open_stages || []).concat(
  Object.keys(board).filter((s) => !(cfg.open_stages || []).includes(s)));

const tiles = ordered.filter((s) => board[s]).map((stage) => {
  const live = (cfg.open_stages || []).includes(stage);
  return '<td style="padding:0 10px 10px 0" valign="top">' +
    '<div style="min-width:104px;padding:12px 14px;border:1px solid ' + LINE + ';border-radius:8px">' +
    '<div style="font:700 22px/1 ' + FONT + ';color:' + (live ? INK : MUTED) + '">' + board[stage] + '</div>' +
    '<div style="margin-top:4px;font:400 12px/1.3 ' + FONT + ';color:' + MUTED + '">' + esc(stage) + '</div>' +
    '</div></td>';
}).join('');

const stalledRows = [].concat(...(a.groups || []).map((g) => g.items))
  .sort((x, y) => y.quiet_hours - x.quiet_hours);

const stalledHtml = stalledRows.length
  ? '<p style="margin:22px 0 8px;font:600 12px/1.4 ' + FONT + ';letter-spacing:.07em;text-transform:uppercase;color:' + MUTED + '">Gone quiet</p>' +
    '<table cellpadding="0" cellspacing="0" border="0" width="100%">' +
    stalledRows.map((it) =>
      '<tr><td style="padding:8px 12px 8px 0;border-top:1px solid ' + LINE + ';font:400 14px/1.5 ' + FONT + ';color:' + INK + '">' +
      esc(it.company) + ' <span style="color:' + MUTED + '">' + esc(it.ref) + '</span></td>' +
      '<td style="padding:8px 12px 8px 0;border-top:1px solid ' + LINE + ';font:400 14px/1.5 ' + FONT + ';color:' + MUTED + '">' + esc(it.owner) + '</td>' +
      '<td style="padding:8px 0;border-top:1px solid ' + LINE + ';font:400 14px/1.5 ' + FONT + ';color:' + WARN + ';white-space:nowrap">' +
      Math.floor(it.quiet_hours / 24) + 'd</td></tr>').join('') +
    '</table>'
  : '<p style="margin:22px 0 0;font:400 15px/1.6 ' + FONT + ';color:' + OK + '">Nothing has gone quiet. Everything open has been touched in the last ' + esc(String(a.cutoff_hours)) + ' hours.</p>';

const orphanHtml = (a.no_owner_email || []).length
  ? '<p style="margin:22px 0 8px;font:600 12px/1.4 ' + FONT + ';letter-spacing:.07em;text-transform:uppercase;color:' + WARN + '">No owner email — nobody was nudged</p>' +
    '<p style="margin:0;font:400 14px/1.6 ' + FONT + ';color:' + MUTED + '">' +
    a.no_owner_email.map((o) => esc(o.ref + ' ' + o.company + ' (' + o.owner + ')')).join('<br>') +
    '<br><br>Add their address to the area list in the config node.</p>'
  : '';

const html =
  '<div style="font:400 15px/1.6 ' + FONT + ';color:' + INK + ';max-width:640px">' +
  '<p style="margin:0 0 4px;font:600 17px/1.3 ' + FONT + '">Enquiries — ' + today + '</p>' +
  '<p style="margin:0 0 18px;color:' + MUTED + '">' + a.open_count + ' open, ' +
  a.stalled_count + ' gone quiet past ' + esc(String(a.cutoff_hours)) + ' hours.</p>' +
  '<table cellpadding="0" cellspacing="0" border="0"><tr>' + tiles + '</tr></table>' +
  stalledHtml + orphanHtml +
  '</div>';

const text = ['Enquiries - ' + today, '',
  a.open_count + ' open, ' + a.stalled_count + ' gone quiet past ' + a.cutoff_hours + ' hours.', '']
  .concat(ordered.filter((s) => board[s]).map((s) => '  ' + String(board[s]).padStart(3) + '  ' + s))
  .concat(stalledRows.length ? ['', 'GONE QUIET', ''].concat(stalledRows.map((it) =>
    '  ' + Math.floor(it.quiet_hours / 24) + 'd  ' + it.company + ' (' + it.ref + ') - ' + it.owner)) : ['', 'Nothing has gone quiet.'])
  .join('\n');

return [{
  json: {
    digest_subject: 'Enquiries — ' + a.open_count + ' open, ' + a.stalled_count + ' need chasing',
    digest_html: html,
    digest_text: text,
    _send_digest: cfg.digest_enabled && (cfg.digest_always || a.open_count > 0),
    board,
    open_count: a.open_count,
    stalled_count: a.stalled_count
  }
}];
