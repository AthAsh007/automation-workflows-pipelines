// The acknowledgement, and the internal heads-up that goes with it. Plain, quick to
// read on a phone, and it asks the three questions so the next email from them has
// everything needed to quote.
const cfg = $('config').first().json;
const e = $input.first().json;

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const firstName = String(e.contact || '').trim().split(/\s+/)[0];
const greeting = firstName && /^[A-Za-z'-]{2,}$/.test(firstName) ? 'Hi ' + firstName + ',' : 'Hello,';

const INK = '#1b1d21', MUTED = '#5c6470', LINE = '#e4e7eb', ACCENT = '#1a6b4a';
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const p = (html, extra) => '<p style="margin:0 0 16px;font:400 15px/1.6 ' + FONT +
  ';color:' + INK + ';' + (extra || '') + '">' + html + '</p>';

const questionsHtml = '<ol style="margin:0 0 18px;padding-left:20px;font:400 15px/1.7 ' + FONT +
  ';color:' + INK + '">' +
  (cfg.questions || []).map((q) => '<li style="margin:0 0 8px">' + esc(q) + '</li>').join('') +
  '</ol>';

const signOff = [
  cfg.company_name,
  cfg.phone ? 'Tel ' + cfg.phone : '',
  cfg.website
].filter(Boolean);

const customerSubject = 'Thanks for your enquiry — a few quick questions (' + e.ref + ')';

const customerHtml =
  '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f6f7f8;margin:0;padding:24px 12px"><tr><td align="center">' +
  '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="580" style="max-width:580px;width:100%;background:#ffffff;border:1px solid ' + LINE + ';border-radius:10px">' +
  '<tr><td style="padding:28px 30px">' +
  p('<strong style="font-size:16px">' + esc(cfg.company_name) + '</strong>', 'margin-bottom:22px;color:' + MUTED) +
  p(esc(greeting)) +
  p('Thanks for getting in touch. Your enquiry is with ' + esc(e.owner) +
    ', who looks after ' + esc(e.area) + ', and we have it logged as <strong>' + esc(e.ref) + '</strong>.') +
  p('So we can put a proper price together rather than a vague one, could you answer these three?') +
  questionsHtml +
  p('Reply to this email and it comes straight back to us. Once we have those answers we will send a written quote.') +
  p(signOff.map(esc).join('<br>'), 'margin-top:24px;color:' + MUTED + ';font-size:14px') +
  '</td></tr></table></td></tr></table>';

const customerText = [
  greeting, '',
  'Thanks for getting in touch. Your enquiry is with ' + e.owner + ', who looks after ' +
    e.area + ', and we have it logged as ' + e.ref + '.', '',
  'So we can put a proper price together rather than a vague one, could you answer these three?', ''
].concat((cfg.questions || []).map((q, i) => (i + 1) + '. ' + q))
 .concat(['',
  'Reply to this email and it comes straight back to us. Once we have those answers we',
  'will send a written quote.', ''
 ]).concat(signOff).join('\n');

// The internal note. Everything needed to act, nothing else.
const ownerSubject = '[' + e.area + '] New enquiry — ' + (e.company || e.contact || e.email) +
  ' (' + e.ref + ')';

const rows = [
  ['Company', e.company], ['Contact', e.contact], ['Email', e.email], ['Phone', e.phone],
  ['Postcode', e.postcode], ['Area', e.area], ['Premises', e.premises]
].filter(([, v]) => String(v || '').trim() !== '');

const ownerHtml =
  '<div style="font:400 15px/1.6 ' + FONT + ';color:' + INK + '">' +
  '<p style="margin:0 0 14px"><strong>' + esc(e.ref) + '</strong> — yours to quote. ' +
  'The customer already has the three standard questions.</p>' +
  '<table cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px">' +
  rows.map(([k, v]) => '<tr><td style="padding:3px 16px 3px 0;color:' + MUTED + '">' + esc(k) +
    '</td><td style="padding:3px 0">' + esc(v) + '</td></tr>').join('') +
  '</table>' +
  (e.message ? '<p style="margin:0 0 6px;color:' + MUTED + '">What they wrote</p>' +
    '<div style="padding:12px 14px;background:#f6f7f8;border-left:3px solid ' + ACCENT +
    ';white-space:pre-wrap">' + esc(e.message) + '</div>' : '') +
  '</div>';

const ownerText = [
  e.ref + ' — yours to quote. The customer already has the three standard questions.', ''
].concat(rows.map(([k, v]) => k + ': ' + v))
 .concat(e.message ? ['', 'What they wrote:', e.message] : []).join('\n');

return [{
  json: Object.assign({}, e, {
    // In preview mode no reply actually goes out, so the sheet must not claim one did.
    stage: cfg.send_enabled ? cfg.stage_after_reply : cfg.stage_on_arrival,
    customer_subject: customerSubject,
    customer_html: customerHtml,
    customer_text: customerText,
    owner_subject: ownerSubject,
    owner_html: ownerHtml,
    owner_text: ownerText
  })
}];
