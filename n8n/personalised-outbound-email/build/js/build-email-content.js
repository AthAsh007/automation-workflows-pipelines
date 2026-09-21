// Build the email from the two .txt files in the client's deliverable folder.
// Everything here is extraction and formatting — no facts are invented. If a section
// cannot be parsed it is dropped, never guessed at, because this goes to a stranger.
//
// Two rules the whole file follows:
//
//   1. Nothing assumes a direction count. One PDF in the folder produces an email that
//      says "the direction" throughout; three produce "the three directions". Counts come
//      from the files actually in the repo folder, never from a hardcoded word.
//   2. Nothing echoes our own CRM notes back at the client. The notes files quote the
//      tracker's diagnosis and pitch angle to explain the design to us; a sentence that
//      opens on one of those quotes is internal, and is dropped rather than sent.
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

// Counting words read better than digits in prose. Past six we print the number; no
// folder has ever had that many and "seven directions" would be a bug anyway.
const NUMBER_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six'];
const numWord = (k) => NUMBER_WORDS[k] || String(k);
const cap = (s) => String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1);
const plural = (k, one, many) => (k === 1 ? one : many);

// "will vs. trust vs. CPF nominations" used to split after "vs." because "CPF" is
// capitalised, and a client got a sentence that started mid-list. A period closing one of
// these, or closing a single initial, is never the end of a sentence.
const ABBREVIATION = /(?:^|[\s(“"])(?:vs|etc|approx|no|al|fig|e\.g|i\.e|mr|mrs|ms|dr|prof|st|jr|sr|inc|ltd|llp|llc|plc|pte|co|dept|est)\.$/i;
const INITIAL = /(?:^|\s)[A-Z]\.$/;

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
    else if (c === '“') quoted = true;
    else if (c === '”') quoted = false;
    else if (c === '.' || c === '!' || c === '?') {
      if (c === '.' && (ABBREVIATION.test(buf) || INITIAL.test(buf))) continue;
      let j = i + 1;
      while (j < s.length && '")”'.indexOf(s[j]) !== -1) {   // closer belongs to this sentence
        if (s[j] === ')') paren = Math.max(0, paren - 1); else quoted = false;
        buf += s[j];
        j++;
      }
      i = j - 1;
      // A '?' inside a quoted page heading is not the end of the sentence, so only
      // break when what follows actually starts a new one.
      const rest = s.slice(j).replace(/^\s+/, '');
      if (paren === 0 && !quoted && (rest === '' || /^[A-Z“"(]/.test(rest))) {
        out.push(buf.trim());
        buf = '';
      }
    }
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
};

// Cutting at a raw character offset can land inside a quote or a bracket and post an
// unbalanced fragment to a stranger. Back off to the last point where everything that
// was opened has been closed.
const safeTruncate = (s, maxChars) => {
  let paren = 0, quoted = false, lastSafe = -1;
  for (let i = 0; i < s.length && i < maxChars; i++) {
    const c = s[i];
    if (c === '(') paren++;
    else if (c === ')') paren = Math.max(0, paren - 1);
    else if (c === '"') quoted = !quoted;
    else if (c === '“') quoted = true;
    else if (c === '”') quoted = false;
    else if (c === ' ' && paren === 0 && !quoted) lastSafe = i;
  }
  const cut = lastSafe > 40 ? lastSafe : maxChars;
  return s.slice(0, cut).replace(/[\s,;:.—-]+$/, '') + '…';
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
  if (maxChars && out.length > maxChars) out = safeTruncate(out, maxChars);
  return out;
};

// The notes files explain the design by quoting the tracker back at themselves:
//   "Estate-planning lead magnets" is executed literally: a sticky "Free Guide" card...
// The client never saw the tracker, so a sentence opening on that quote reads as our
// internal file. Drop it — and drop the sentence after it too when that one points back
// at what was just removed, or the reader is left hunting for a missing antecedent.
const OPENS_WITH_QUOTE = /^["“]/;
const BACK_REFERENCE = /\b(it|its|they|their|them|this|that|these|those)\b/i;
const opensWithBackReference = (sentence) =>
  BACK_REFERENCE.test(sentence.split(/\s+/).slice(0, 10).join(' '));

// Some notes quote the tracker mid-sentence rather than opening on it —
//   The pitch is "SEO + CRO for conveyancing quote requests."
// — which put our sales plan for the client into the client's own email. Passing the
// internal strings in lets a sentence be recognised as ours wherever the quote sits.
const clientSentences = (block, n, maxChars, internal) => {
  const clean = tidy(block);
  if (!clean) return '';
  const needles = (internal || [])
    .map((s) => tidy(s).replace(/\.$/, '').toLowerCase())
    .filter((s) => s.length > 15);
  const kept = [];
  let droppedPrev = false;
  for (const sentence of splitSentences(clean)) {
    const lower = sentence.toLowerCase();
    const isOurs = OPENS_WITH_QUOTE.test(sentence)
      || needles.some((x) => lower.indexOf(x) !== -1);
    if (isOurs) { droppedPrev = true; continue; }
    if (droppedPrev && opensWithBackReference(sentence)) continue;
    droppedPrev = false;
    kept.push(sentence);
    if (kept.length >= n) break;
  }
  return firstSentences(kept.join(' '), n, maxChars);
};

// Not every section opens with prose. harbor-law.example's begins with a rule of dashes and a
// numbered list, and lifting that verbatim put "------ 1." in the client's email. Strip
// the rules, then require what is left to actually read as a sentence — an empty card is
// honest, a line of punctuation is not.
const stripRules = (block) => String(block || '').split('\n')
  .filter((l) => !/^[\s\-—_=*#.·•]+$/.test(l))
  .join('\n');
const looksLikeProse = (s) => /^[A-Z“"(]/.test(s) && s.split(/\s+/).length >= 8;

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
// Two generations of notes template are in the repo and they label things differently:
// "(CSV column)" in 36 folders, "(tracker column)" in 49; "Design directions delivered"
// in 34, "Design direction" in 51. Match on the label with any parenthetical stripped, so
// both read the same and nothing depends on which template a folder was written against.
const labelValue = (text, re) => {
  for (const line of text.split('\n')) {
    const t = line.trim();
    const idx = t.indexOf(':');
    if (idx < 1) continue;
    const label = t.slice(0, idx).replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
    if (re.test(label)) return tidy(t.slice(idx + 1));
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

// A standalone ALL-CAPS heading: "THE TWO DIRECTIONS", "THE DIRECTIONS", "DIRECTIONS".
// Deliberately case-SENSITIVE and anchored at the end, so the header field
// "Design direction: legacy-editorial" near the top cannot be mistaken for the heading —
// that mistake makes the whole brief look like the directions section.
const DIRECTIONS_HEADING = /^[A-Z][A-Z ]*\bDIRECTIONS?$/;

const rawDiagnosis = unquote(labelValue(notesRaw, /^facelift\s*\/\s*cro diagnosis$/i))
  || unquote(base.diagnosis);
// Parsed for the run log only. The pitch angle is how we plan to sell to them; it is
// never rendered into anything the client receives.
const pitchAngle = unquote(labelValue(notesRaw, /^best pitch angle$/i)) || unquote(base.pitch_angle);

// The repo folder is the ground truth: a direction the client can be shown is one we hold
// a file for. The notes may declare their own list, and that is trusted for naming and
// order only — any slug with no file behind it is dropped, so the prose and the
// attachments can never disagree about how many directions there are.
const repoDirections = base.directions || [];
const declaredDirections = labelValue(notesRaw, /^(design )?directions?( delivered)?$/i)
  .split(',').map((s) => tidy(s)).filter(Boolean)
  .filter((d) => repoDirections.indexOf(d) !== -1);

const directions = declaredDirections.length ? declaredDirections : repoDirections;

// Anything the tracker gave us, in the words we wrote it in. A sentence in the notes
// that repeats one of these is describing the job to ourselves, not to the client.
const INTERNAL = [pitchAngle, rawDiagnosis];

const directionsSection = sectionBody(notesRaw, DIRECTIONS_HEADING);
const diagnosisSection  = sectionBody(notesRaw, /^HOW THE (DIAGNOSIS IS ADDRESSED|REDESIGN)/i);
const pitchSection      = sectionBody(notesRaw, /^HOW THE PITCH ANGLE IS EXECUTED/i);

// Inside the directions section each paragraph opens with the slug. The older template
// writes "<slug>: <description>", the newer one just "<slug> <description>", so accept a
// colon, a dash, or plain whitespace after the slug.
const describeDirection = (slug) => {
  const lower = slug.toLowerCase();
  for (const para of directionsSection.split(/\n\s*\n/)) {
    const t = tidy(para);
    if (t.toLowerCase().indexOf(lower) !== 0) continue;
    const rest = t.slice(slug.length).replace(/^\s*[:—-]\s*/, ' ').trim();
    if (rest) return firstSentences(rest, 2, 300);
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

// 51 of the 87 folders are single-direction and their template has no directions section
// at all, so the card would render as a bare name with nothing under it. For those, the
// redesign IS the direction, and "HOW THE DIAGNOSIS IS ADDRESSED" describes it — lift the
// first client-safe sentences from there instead. Only ever for a single direction: with
// two, that section describes both and would mislabel one as the other.
let blurbFromDiagnosis = false;
if (directionCards.length === 1 && !directionCards[0].blurb) {
  const fallback = clientSentences(stripRules(diagnosisSection), 2, 300, INTERNAL);
  if (fallback && looksLikeProse(fallback)) {
    directionCards[0].blurb = fallback;
    blurbFromDiagnosis = true;
  }
}

// Every count-aware sentence below is derived from this one number.
const dirCount = directionCards.length;
const dirsHeading = dirCount === 1 ? 'The direction' : 'The ' + numWord(dirCount) + ' directions';

// Don't print the diagnosis section twice when a single-direction card already used it.
const whyRaw = clientSentences(stripRules(pitchSection), 2, 320, INTERNAL)
  || (blurbFromDiagnosis ? '' : clientSentences(stripRules(diagnosisSection), 2, 320, INTERNAL));
const whyParagraph = looksLikeProse(whyRaw) ? whyRaw : '';

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

// Headings must count what actually rendered, not what we hoped to render. A file with one
// GEO item under a heading reading "Two AI-answer fixes" is the tell that nobody read the
// email before it went out.
const seoHeading = cap(numWord(seoTips.length)) + ' SEO ' + plural(seoTips.length, 'fix', 'fixes') + ' we noticed';
const geoHeading = cap(numWord(geoTips.length)) + ' AI-answer (GEO) ' + plural(geoTips.length, 'fix', 'fixes');

// "the two scans above" means the SEO block and the GEO block, not the tip count. Either
// can be missing, so the sentence adapts rather than claiming a scan we did not show.
const scanCount = (seoTips.length ? 1 : 0) + (geoTips.length ? 1 : 0);

// ---------------------------------------------------------------- copy
const business = base.business_display || base.business;
// The sheet's Email Title / Email Content win over anything we build. A human who
// wrote copy into those cells meant it, and this workflow must not overwrite them.
// There is no live site and no client-facing link. The designs travel as attachments,
// so the copy points at the attachments and at how to reach us, nothing else.
// Plan the attachments here, because the copy has to describe what is actually going to
// be in the email. PDFs are claimed first, then the PNG previews take whatever is left.
// The budget is on the raw bytes; base64 adds about 37% on the wire.
const previews = base.previews || {};

// Each format is all-or-nothing. Sending a preview of every direction but a PDF of only
// one reads as carelessness, so a group that does not fit whole is left out whole.
// This walks `directions` — the same list the copy describes, never base.directions — so
// the attachments and the prose can never disagree about how many there are.
const groupFor = (key, nameKey, bytesKey) => directions
  .map((d) => previews[d] || {})
  .filter((pv) => pv[key] && pv[nameKey])
  .map((pv) => ({ url: pv[key], filename: pv[nameKey], bytes: Number(pv[bytesKey]) || 0 }));

const attachments = [];
let attachBytes = 0;

const planGroup = (group, wanted) => {
  if (!wanted || !group.length) return false;
  if (group.length !== directions.length) return false;   // incomplete set
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

// "of each direction" is noise when there is only one of them.
const ofEach   = dirCount === 1 ? '' : ' of each direction';
const tooLarge = dirCount === 1
  ? 'The print-quality PDF is too large to email - say the word and we will get it to you.'
  : 'The print-quality PDFs are too large to email - say the word and we will get them to you.';

const whatsYouGot =
  pdfsAttached && pngsAttached
    ? 'Attached: the print-quality PDF' + ofEach + ', plus a full-page preview.'
  : pdfsAttached
    ? 'Attached: the print-quality PDF' + ofEach + '.'
  : pngsAttached
    ? 'Attached: a full-page preview' + ofEach + '. ' + tooLarge
    : (dirCount === 1
        ? 'The direction is described below. '
        : cap(numWord(dirCount)) + ' directions are described below. ')
      + plural(dirCount, 'The file is', 'The files are')
      + ' too large to email - say the word and we will get '
      + plural(dirCount, 'it', 'them') + ' to you.';

const pickClause = dirCount === 1
  ? 'If it looks close, say the word and we will take it from there.'
  : 'If one of the ' + numWord(dirCount) + ' directions is close, tell us which and we '
    + 'will take it from there.';

const scanClause = scanCount === 0 ? ''
  : ' And the ' + (scanCount === 1 ? 'scan' : numWord(scanCount) + ' scans') + ' above '
    + (scanCount === 1 ? 'is' : 'are') + ' a few minutes of what a full SEO and GEO review '
    + 'covers, so if you want the whole picture of where the site stands, just ask.';

const nextSteps = 'Nothing to sign and nothing owed - these are sample redesigns, built '
  + 'from your public site on our own time, not a commissioned job. ' + pickClause + scanClause;

const declineLine = dirCount === 1
  ? 'If it is not right, replying "not for us" is a perfectly good answer and we will not follow up.'
  : dirCount === 2
    ? 'If neither direction is right, replying "not for us" is a perfectly good answer and we will not follow up.'
    : 'If none of them is right, replying "not for us" is a perfectly good answer and we will not follow up.';

// Tokens SUBJECT_TEMPLATE may use: {business}, {n} -> "one"/"two", {s} -> "" or "s".
// A template using none of them still works untouched.
const builtSubject = tidy(String(cfg.subject_template || '')
  .split('{business}').join(business)
  .split('{n}').join(numWord(dirCount))
  .split('{s}').join(plural(dirCount, '', 's'))).slice(0, 120);
const subject = base._has_custom_subject ? tidy(base.existing_title).slice(0, 200) : builtSubject;

// The tracker's diagnosis is written for us, in our shorthand. Expand the in-house terms
// and join the note-taking semicolons into one clause; if what is left still reads like a
// note rather than a sentence, drop it and open on the plainer line instead. Nothing is
// reworded beyond this - the meaning is the lead researcher's, not ours.
const JARGON = [
  [/\bCROs?\b/g, 'conversion'], [/\bUX\b/g, 'experience'], [/\bUI\b/g, 'interface'],
  [/\bCTAs\b/g, 'calls to action'], [/\bCTA\b/g, 'call to action'],
  [/\bIA\b/g, 'site structure'], [/\bLCP\b/g, 'load speed'], [/\bSERPs?\b/g, 'search results']
];
const humaniseDiagnosis = (raw) => {
  let s = tidy(raw).replace(/\.$/, '');
  if (!s) return '';
  for (const [re, to] of JARGON) s = s.replace(re, to);
  s = s.replace(/\s*&\s*/g, ' and ');
  const parts = s.split(/\s*;\s*/).map((x) => tidy(x)).filter(Boolean);
  s = parts.length > 1
    ? parts.slice(0, -1).join(', ') + ', and ' + parts[parts.length - 1]
    : (parts[0] || '');
  // Still shorthand, a placeholder, or too long to read as one clause: leave it out.
  if (s.length < 12 || s.length > 220) return '';
  if (/[+>|]|\bTBD\b|\bN\/A\b/i.test(s)) return '';
  return s;
};
const diagnosis = humaniseDiagnosis(rawDiagnosis);

const fixThat = dirCount === 1
  ? 'The redesign sets out to fix that.'
  : dirCount === 2
    ? 'Both directions set out to fix that.'
    : 'All ' + numWord(dirCount) + ' directions set out to fix that.';

const belowLine = dirCount === 1
  ? 'One direction, below.'
  : dirCount === 2
    ? 'Two directions, both below.'
    : cap(numWord(dirCount)) + ' directions, all below.';

const intro = diagnosis
  ? 'We redesigned ' + base.domain + ' as a sample - unasked, on our own time, to show what '
    + 'it could look like. What stood out on the current site: ' + diagnosis
    + '. ' + fixThat
  : 'We redesigned ' + base.domain + ' as a sample - unasked, on our own time, to show what '
    + 'it could look like. ' + belowLine;

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

const preheader =
  (dirCount === 1 ? 'A sample redesign of ' : cap(numWord(dirCount)) + ' sample redesigns of ')
  + base.domain
  + (scanCount ? ', plus a quick SEO and AI-answer scan.' : '.');

const body =
  '<p style="margin:0 0 24px;font:700 16px/1 ' + FONT + ';letter-spacing:.02em;color:' + INK + '">Acme<span style="font-weight:400;color:' + MUTED + '"> &middot; website growth</span></p>' +
  p(esc(base.greeting)) +
  p(esc(intro)) +
  p(esc(whatsYouGot), 'color:' + MUTED) +
  rule +
  h(dirsHeading) +
  directionsHtml +
  (whyParagraph ? p(esc(whyParagraph), 'color:' + MUTED) : '') +
  (seoTips.length ? h(seoHeading) + tipsHtml(seoTips) : '') +
  (geoTips.length ? h(geoHeading) + tipsHtml(geoTips) : '') +
  rule +
  h('What happens next') +
  p(esc(nextSteps)) +
  button(cfg.booking_url, 'Book 15 minutes') +
  p(esc(declineLine), 'color:' + MUTED + ';font-size:13px') +
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
  dirsHeading.toUpperCase(), ''
];
for (const d of directionCards) {
  textParts.push('* ' + d.name + (d.blurb ? ' - ' + d.blurb : ''));
}
textParts.push('');
if (whyParagraph) textParts.push(whyParagraph, '');
if (seoTips.length) {
  textParts.push(seoHeading.toUpperCase(), '');
  seoTips.forEach((t, i) => textParts.push((i + 1) + '. ' + t.headline, t.body ? '   ' + t.body : '', ''));
}
if (geoTips.length) {
  textParts.push(geoHeading.toUpperCase(), '');
  geoTips.forEach((t, i) => textParts.push((i + 1) + '. ' + t.headline, t.body ? '   ' + t.body : '', ''));
}
textParts.push(
  'WHAT HAPPENS NEXT', '',
  nextSteps, '',
  declineLine, '',
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
    // The intro as it actually appears inside `text`, already wrapped to 78 columns.
    // "apply polish" swaps the new intro into both bodies, and an exact match on the
    // unwrapped `intro` never lands in the plain-text one.
    _intro_wrapped: customBody ? '' : wrap(intro, 78),
    _attachment_names: attachNames,
    _attachments: attachments,
    _attachment_bytes: attachBytes,
    _parsed: {
      diagnosis,
      diagnosis_raw: rawDiagnosis,
      pitch_angle: pitchAngle,
      directions: directionCards.map((d) => d.name),
      blurb_list: directionCards.map((d) => d.blurb).filter(Boolean),
      why: whyParagraph,
      direction_count: dirCount,
      blurbs: directionCards.filter((d) => d.blurb).length,
      blurb_from_diagnosis: blurbFromDiagnosis,
      seo_tips: seoTips.length,
      geo_tips: geoTips.length,
      notes_bytes: notesRaw.length,
      seo_bytes: seoRaw.length
    }
  })
}];
