// Build the email from the two .txt files in the client's deliverable folder.
// Everything here is extraction and formatting — no facts are invented. If a section
// cannot be parsed it is dropped, never guessed at, because this goes to a stranger.
const cfg  = $('config').first().json;
const base = $('pick deliverable files').first().json;

const readText = (nodeName) => {
  try {
    const j = $(nodeName).first().json || {};
    const raw = typeof j.data === 'string' ? j.data : (typeof j === 'string' ? j : '');
    return raw.replace(/\r\n/g, '\n');
  } catch (e) {
    return '';
  }
};

const notesRaw = readText('[cred] GitHub - get pitch notes');
const seoRaw   = readText('[cred] GitHub - get seo geo tip');

// ---------------------------------------------------------------- small helpers
const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const tidy = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

// These files quote page titles and headings, so a naive split on "." lands inside
// a quotation and hands the client half a sentence. Track quote and paren depth.
const splitSentences = (s) => {
  const out = [];
  let buf = '', paren = 0, quoted = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    buf += c;
    if (c === '(') paren++;
    else if (c === ')') paren = Math.max(0, paren - 1);
    else if (c === '"') quoted = !quoted;
    else if (c === '\u201C') quoted = true;
    else if (c === '\u201D') quoted = false;
    else if (c === '.' || c === '!' || c === '?') {
      let j = i + 1;
      while (j < s.length && '")\u201D'.indexOf(s[j]) !== -1) {   // closer belongs to this sentence
        if (s[j] === ')') paren = Math.max(0, paren - 1); else quoted = false;
        buf += s[j];
        j++;
      }
      i = j - 1;
      // A '?' inside a quoted page heading is not the end of the sentence, so only
      // break when what follows actually starts a new one.
      const rest = s.slice(j).replace(/^\s+/, '');
      if (paren === 0 && !quoted && (rest === '' || /^[A-Z\u201C"(]/.test(rest))) {
        out.push(buf.trim());
        buf = '';
      }
    }
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
};

// Whole sentences up to a budget. Drops the second sentence rather than cutting it,
// and only ever ellipsis-truncates when a single sentence is longer than the budget.
const firstSentences = (s, n, maxChars) => {
  const clean = tidy(s);
  if (!clean) return '';
  const parts = splitSentences(clean);
  let out = '';
  for (const part of parts.slice(0, n)) {
    const next = out ? out + ' ' + part : part;
    if (out && maxChars && next.length > maxChars) break;
    out = next;
  }
  if (!out) out = parts[0] || clean;
  if (maxChars && out.length > maxChars) {
    out = out.slice(0, maxChars).replace(/[\s,;:.\u2014-]+\S*$/, '') + '\u2026';
  }
  return out;
};

// Plain-text bodies go out at a readable width; long unwrapped lines look broken
// in a lot of mail clients.
const wrap = (s, width) => {
  const cols = width || 78;
  const out = [];
  for (const para of String(s ?? '').split('\n')) {
    if (!para.trim()) { out.push(''); continue; }
    const m = para.match(/^(\s*)((?:\d+\.|[*-])\s+)?/);
    const indent = m[1] || '';
    const hang = indent + ' '.repeat((m[2] || '').length);   // list items get a hanging indent
    const words = para.trim().split(/\s+/);
    let line = indent + words[0];
    for (let i = 1; i < words.length; i++) {
      if ((line + ' ' + words[i]).length > cols) { out.push(line); line = hang + words[i]; }
      else line += ' ' + words[i];
    }
    out.push(line);
  }
  return out.join('\n');
};

const titleCase = (slug) => String(slug || '')
  .split(/[-_]/).filter(Boolean)
  .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
  .join(' ');

const unquote = (s) => tidy(s).replace(/^["“”']+|["“”']+$/g, '');

// ---------------------------------------------------------------- pitch notes
// Labels in these files carry slashes and brackets, so match a plain line prefix
// instead of escaping them into a pattern.
const afterLabel = (text, label) => {
  const needle = (label + ':').toLowerCase();
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (t.toLowerCase().startsWith(needle)) return tidy(t.slice(needle.length));
  }
  return '';
};

// A heading in these files is a line in ALL CAPS on its own.
const sectionBody = (text, headingRe) => {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => headingRe.test(l.trim()));
  if (start === -1) return '';
  const body = [];
  for (let i = start + 1; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t && t === t.toUpperCase() && /[A-Z]{4}/.test(t) && !/^\d/.test(t)) break;
    body.push(lines[i]);
  }
  return body.join('\n').trim();
};

const diagnosis  = unquote(afterLabel(notesRaw, 'Facelift / CRO Diagnosis (CSV column)')) || unquote(base.diagnosis);
const pitchAngle = unquote(afterLabel(notesRaw, 'Best Pitch Angle (CSV column)')) || unquote(base.pitch_angle);

const declaredDirections = afterLabel(notesRaw, 'Design directions delivered')
  .split(',').map((s) => tidy(s)).filter(Boolean);

const directions = (declaredDirections.length ? declaredDirections : base.directions) || [];

// Inside "THE TWO DIRECTIONS", each paragraph opens "<slug>: <description>".
const directionsSection = sectionBody(notesRaw, /^THE (TWO )?DIRECTIONS/i);
const describeDirection = (slug) => {
  const needle = (slug + ':').toLowerCase();
  for (const para of directionsSection.split(/\n\s*\n/)) {
    const t = tidy(para);
    if (t.toLowerCase().startsWith(needle)) return firstSentences(t.slice(needle.length), 2, 300);
  }
  return '';
};

const directionCards = directions
  .map((slug) => ({
    slug,
    name: titleCase(slug),
    blurb: describeDirection(slug),
    preview: (base.previews && base.previews[slug]) || {}
  }))
  .filter((d) => d.name);

const whyParagraph =
  firstSentences(sectionBody(notesRaw, /^HOW THE PITCH ANGLE IS EXECUTED/i), 2, 320) ||
  firstSentences(sectionBody(notesRaw, /^HOW THE DIAGNOSIS IS ADDRESSED/i), 2, 320);

// ---------------------------------------------------------------- SEO / GEO scan
const parseTips = (block) => {
  const out = [];
  let current = null;
  for (const line of block.split('\n')) {
    const m = line.match(/^\s*\d+\.\s+(.*)$/);
    if (m) {
      if (current) out.push(current);
      current = { headline: tidy(m[1]).replace(/\.$/, ''), body: [] };
    } else if (current && line.trim()) {
      current.body.push(line.trim());
    } else if (current && !line.trim() && current.body.length) {
      // blank line inside an item is fine; a numbered line ends it
    }
  }
  if (current) out.push(current);
  return out.map((t) => ({ headline: t.headline, body: firstSentences(t.body.join(' '), 2, 320) }))
            .filter((t) => t.headline);
};

const sliceBetween = (text, startRe, endRe) => {
  const lines = text.split('\n');
  const s = lines.findIndex((l) => startRe.test(l.trim()));
  if (s === -1) return '';
  let e = lines.length;
  for (let i = s + 1; i < lines.length; i++) {
    if (endRe.test(lines[i].trim())) { e = i; break; }
  }
  return lines.slice(s + 1, e).join('\n');
};

const seoTips = parseTips(sliceBetween(seoRaw, /^SEO\b/i, /^GEO\b/i)).slice(0, 2);
const geoTips = parseTips(sliceBetween(seoRaw, /^GEO\b/i, /^(These are the quick wins|A full SEO)/i)).slice(0, 2);

// ---------------------------------------------------------------- copy
const business = base.business_display || base.business;
// The sheet's Email Title / Email Content win over anything we build. A human who
// wrote copy into those cells meant it, and this workflow must not overwrite them.
// There is no live site and no client-facing link. The designs travel as attachments,
// so the copy points at the attachments and at how to reach us, nothing else.
// Plan the attachments here, because the copy has to describe what is actually going
// to be in the email. PNGs first - measured across the 43 client folders they are 2.3 MB
// median and 4.6 MB at worst, so they always fit - then PDFs while the budget allows.
// The budget is on the raw bytes; base64 adds about 37% on the wire.
const previews = base.previews || {};

// Each format is all-or-nothing. Sending a preview of both directions but a PDF of
// only one reads as carelessness, so a group that does not fit whole is left out whole.
const groupFor = (key, nameKey, bytesKey) => (base.directions || [])
  .map((d) => previews[d] || {})
  .filter((pv) => pv[key] && pv[nameKey])
  .map((pv) => ({ url: pv[key], filename: pv[nameKey], bytes: Number(pv[bytesKey]) || 0 }));

const attachments = [];
let attachBytes = 0;

const planGroup = (group, wanted) => {
  if (!wanted || !group.length) return false;
  if (group.length !== (base.directions || []).length) return false;   // incomplete set
  const size = group.reduce((n, f) => n + f.bytes, 0);
  if (attachBytes + size > cfg.attach_budget) return false;
  for (const f of group) {
    attachments.push({ url: f.url, filename: f.filename, bytes: f.bytes,
                       prop: 'attachment_' + attachments.length });
  }
  attachBytes += size;
  return true;
};

// PDFs first - they are the actual deliverable, and claiming the budget for them means
// a client whose PDFs fit but whose PDFs plus previews do not still gets the PDFs.
// The previews then take whatever is left; they are 2.3 MB median, 4.6 MB at worst.
const pdfsAttached = planGroup(groupFor('pdf', 'pdf_name', 'pdf_bytes'), cfg.attach_pdfs);
const pngsAttached = planGroup(
  groupFor('desktop_png', 'desktop_png_name', 'desktop_png_bytes'), cfg.attach_pngs);

const attachNames = attachments.map((a) => a.filename);

const whatsYouGot =
  pdfsAttached && pngsAttached
    ? 'Attached: the print-quality PDF of each direction, plus a full-page preview.'
  : pdfsAttached
    ? 'Attached: the print-quality PDF of each direction.'
  : pngsAttached
    ? 'Attached: a full-page preview of each direction. The print-quality PDFs are too '
      + 'large to email - say the word and we will get them to you.'
    : 'Both directions are described below. The files are too large to email - say the '
      + 'word and we will get them to you.';

const nextSteps = 'Nothing to sign and nothing owed - these are sample redesigns, built '
  + 'from your public site on our own time, not a commissioned job. If one of the two '
  + 'directions is close, tell us which and we will take it from there. And the two scans '
  + 'above are a few minutes of what a full SEO and GEO review covers, so if you want the '
  + 'whole picture of where the site stands, just ask.';

const builtSubject = tidy(cfg.subject_template.replace('{business}', business)).slice(0, 120);
const subject = base._has_custom_subject ? tidy(base.existing_title).slice(0, 200) : builtSubject;

const intro = diagnosis
  ? 'We redesigned ' + base.domain + ' as a sample - unasked, on our own time, to show what '
    + 'it could look like. What stood out on the current site: ' + diagnosis.replace(/\.$/, '')
    + '. Both directions set out to fix that.'
  : 'We redesigned ' + base.domain + ' as a sample - unasked, on our own time, to show what '
    + 'it could look like. Two directions, both below.';

// ---------------------------------------------------------------- HTML
const INK = '#16181d', MUTED = '#5b6472', LINE = '#e3e6ea', ACCENT = '#0b5fff', BG = '#f5f6f8';
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

const p = (html, extra) =>
  '<p style="margin:0 0 16px;font:400 15px/1.6 ' + FONT + ';color:' + INK + ';' + (extra || '') + '">' + html + '</p>';

const h = (text) =>
  '<p style="margin:28px 0 12px;font:600 12px/1.4 ' + FONT + ';letter-spacing:.08em;text-transform:uppercase;color:' + MUTED + '">' + esc(text) + '</p>';

const rule = '<div style="height:1px;background:' + LINE + ';margin:24px 0"></div>';

const button = (href, label) =>
  '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 8px"><tr><td bgcolor="' + ACCENT + '" style="border-radius:6px">' +
  '<a href="' + esc(href) + '" style="display:inline-block;padding:13px 26px;font:600 15px/1 ' + FONT + ';color:#ffffff;text-decoration:none;border-radius:6px">' + esc(label) + '</a>' +
  '</td></tr></table>';

const card = (inner) =>
  '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 12px;border:1px solid ' + LINE + ';border-radius:8px"><tr><td style="padding:16px 18px">' + inner + '</td></tr></table>';

const directionsHtml = directionCards.map((d) => card(
  '<p style="margin:0 0 6px;font:600 15px/1.4 ' + FONT + ';color:' + INK + '">' + esc(d.name) + '</p>' +
  (d.blurb ? '<p style="margin:0;font:400 14px/1.6 ' + FONT + ';color:' + MUTED + '">' + esc(d.blurb) + '</p>' : '')
)).join('');

const tipsHtml = (tips) => tips.map((t) =>
  '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 14px"><tr>' +
  '<td width="16" valign="top" style="font:600 15px/1.6 ' + FONT + ';color:' + ACCENT + '">&bull;</td>' +
  '<td valign="top">' +
  '<p style="margin:0 0 4px;font:600 14px/1.5 ' + FONT + ';color:' + INK + '">' + esc(t.headline) + '</p>' +
  (t.body ? '<p style="margin:0;font:400 14px/1.6 ' + FONT + ';color:' + MUTED + '">' + esc(t.body) + '</p>' : '') +
  '</td></tr></table>'
).join('');

const contactRow = (label, href, text) =>
  '<tr><td style="padding:2px 0;font:400 14px/1.7 ' + FONT + ';color:' + MUTED + '">' +
  '<span style="display:inline-block;min-width:88px;color:' + MUTED + '">' + esc(label) + '</span>' +
  '<a href="' + esc(href) + '" style="color:' + ACCENT + ';text-decoration:none">' + esc(text) + '</a>' +
  '</td></tr>';

const contactBlock =
  h('Reach us') +
  '<table role="presentation" cellpadding="0" cellspacing="0" border="0">' +
  contactRow('WhatsApp', cfg.whatsapp_link, cfg.whatsapp) +
  contactRow('Book a call', cfg.booking_url, '15 minutes, pick a slot') +
  contactRow('Website', cfg.site_url, cfg.site_url.replace(/^https?:\/\//, '').replace(/\/$/, '')) +
  '</table>';

const preheader = 'Two sample redesigns of ' + base.domain + ', plus a quick SEO and AI-answer scan.';

const body =
  '<p style="margin:0 0 24px;font:700 16px/1 ' + FONT + ';letter-spacing:.02em;color:' + INK + '">Acme<span style="font-weight:400;color:' + MUTED + '"> &middot; website growth</span></p>' +
  p(esc(base.greeting)) +
  p(esc(intro)) +
  p(esc(whatsYouGot), 'color:' + MUTED) +
  rule +
  h('The two directions') +
  directionsHtml +
  (whyParagraph ? p(esc(whyParagraph), 'color:' + MUTED) : '') +
  (seoTips.length ? h('Two SEO fixes we noticed') + tipsHtml(seoTips) : '') +
  (geoTips.length ? h('Two AI-answer (GEO) fixes') + tipsHtml(geoTips) : '') +
  rule +
  h('What happens next') +
  p(esc(nextSteps)) +
  button(cfg.booking_url, 'Book 15 minutes') +
  p('If neither direction is right, replying &quot;not for us&quot; is a perfectly good answer and we will not follow up.', 'color:' + MUTED + ';font-size:13px') +
  contactBlock;

const footer =
  '<div style="height:1px;background:' + LINE + ';margin:8px 0 18px"></div>' +
  '<p style="margin:0;font:400 14px/1.6 ' + FONT + ';color:' + INK + '">' + esc(cfg.signoff_name) + '<br>' +
  '<span style="color:' + MUTED + '">' + esc(cfg.signoff_role) + '</span></p>';

const shell = (inner) =>
  '<div style="display:none;max-height:0;overflow:hidden;opacity:0">' + esc(preheader) + '</div>' +
  '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:' + BG + ';margin:0;padding:24px 12px"><tr><td align="center">' +
  '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;background:#ffffff;border:1px solid ' + LINE + ';border-radius:10px">' +
  '<tr><td style="padding:28px 32px 8px">' + inner + '</td></tr>' +
  '<tr><td style="padding:0 32px 28px">' + footer + '</td></tr>' +
  '</table></td></tr></table>';

const html = shell(body);

// ---------------------------------------------------------------- plain text
const textParts = [
  base.greeting, '',
  intro, '',
  whatsYouGot, '',
  'THE TWO DIRECTIONS', ''
];
for (const d of directionCards) {
  textParts.push('* ' + d.name + (d.blurb ? ' - ' + d.blurb : ''));
}
textParts.push('');
if (whyParagraph) textParts.push(whyParagraph, '');
if (seoTips.length) {
  textParts.push('TWO SEO FIXES WE NOTICED', '');
  seoTips.forEach((t, i) => textParts.push((i + 1) + '. ' + t.headline, t.body ? '   ' + t.body : '', ''));
}
if (geoTips.length) {
  textParts.push('TWO AI-ANSWER (GEO) FIXES', '');
  geoTips.forEach((t, i) => textParts.push((i + 1) + '. ' + t.headline, t.body ? '   ' + t.body : '', ''));
}
textParts.push(
  'WHAT HAPPENS NEXT', '',
  nextSteps, '',
  'If neither direction is right, replying "not for us" is a perfectly good answer and '
    + 'we will not follow up.', '',
  'REACH US', '',
  'WhatsApp: ' + cfg.whatsapp,
  'Book a call: ' + cfg.booking_url,
  'Website: ' + cfg.site_url, '',
  cfg.signoff_name,
  cfg.signoff_role
);
const text = wrap(textParts.join('\n'), 78)
  .replace(/(?:\r?\n){3,}/g, '\n\n');

// ---------------------------------------------------------------- sheet-authored copy
// If someone typed a body into the sheet's Email Content cell, that is the email.
// It goes out in the same wrapper so it still looks like everything else we send,
// but not one word of it is rewritten.
const wordmark = '<p style="margin:0 0 24px;font:700 16px/1 ' + FONT +
  ';letter-spacing:.02em;color:' + INK + '">Acme<span style="font-weight:400;color:' +
  MUTED + '"> &middot; website growth</span></p>';

const linkify = (t) => esc(t).replace(
  /(https?:\/\/[^\s<]+)/g,
  '<a href="$1" style="color:' + ACCENT + '">$1</a>');

const customBody = base._has_custom_body ? String(base.existing_body).replace(/\r\n/g, '\n') : '';

const customHtml = customBody
  ? shell(wordmark + customBody.split(/\n\s*\n/)
      .filter((para) => para.trim())
      .map((para) => p(linkify(para.trim()).replace(/\n/g, '<br>')))
      .join(''))
  : '';

const copySource = customBody
  ? (base._has_custom_subject ? 'sheet' : 'sheet-body')
  : (base._has_custom_subject ? 'sheet-subject' : 'built');

return [{
  json: Object.assign({}, base, {
    subject,
    intro,
    html: customHtml || html,
    text: customBody ? wrap(customBody, 78) : text,
    // 'built' is the only source the AI polish step is allowed to touch.
    _copy_source: copySource,
    _attachment_names: attachNames,
    _attachments: attachments,
    _attachment_bytes: attachBytes,
    _parsed: {
      diagnosis,
      pitch_angle: pitchAngle,
      directions: directionCards.map((d) => d.name),
      seo_tips: seoTips.length,
      geo_tips: geoTips.length,
      notes_bytes: notesRaw.length,
      seo_bytes: seoRaw.length
    }
  })
}];
