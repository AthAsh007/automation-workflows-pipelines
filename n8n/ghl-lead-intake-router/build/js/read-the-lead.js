// One lead out of whatever arrived. A website form, a forwarded email and a phone note all
// name their fields differently, so rather than hard-code one shape the parser detects the
// source and digs the same facts out of each. Anything it cannot read is rejected WITH A
// REASON, never half-read.
//
// Output per item: the common lead, `contact_key` (the dedupe key), `_ok` and `_problems`.

const cfg = $('config').first().json;
const T = (v) => String(v == null ? '' : v).trim();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^[+(]?[0-9][0-9\s().-]{6,}$/;
const SOURCE_LABELS = { website: 'Website form', email: 'Forwarded email', phone: 'Phone note' };

function toObject(x) {
  if (!x) return null;
  if (typeof x === 'string') { try { return JSON.parse(x); } catch (e) { return null; } }
  return (typeof x === 'object') ? x : null;
}

// One flat bag of lower-cased, punctuation-free keys, however deeply the source nested them.
// body/data/fields wrappers disappear, which is the point.
function flatten(obj, depth, out) {
  out = out || {};
  if (!obj || typeof obj !== 'object' || depth > 3) return out;
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, depth + 1, out);
    else out[String(k).toLowerCase().replace(/[^a-z0-9]/g, '')] = Array.isArray(v) ? v.join(', ') : v;
  }
  return out;
}

function detect(f) {
  const has = (...n) => n.some((x) => f[x] !== undefined && T(f[x]) !== '');
  if (has('takenby', 'callername', 'callerphone', 'callnote', 'callnotes')) return 'phone';
  if (has('from') && (has('subject') || has('text') || has('body'))) return 'email';
  if (has('yourname', 'youremail', 'yourphone', 'yourmessage', 'name', 'email', 'message')) return 'website';
  const vals = Object.keys(f).map((k) => T(f[k])).filter(Boolean);
  if (vals.some((v) => EMAIL_RE.test(v))) return 'website';
  return '';
}

function readOne(json) {
  const j = toObject(json) || {};
  const lead = toObject(j.lead) || j;
  const f = flatten(lead, 0);
  const source = detect(f);

  const pick = (...names) => {
    for (const n of names) {
      const v = f[n];
      if (v !== undefined && v !== null && T(v) !== '') return T(v);
    }
    return '';
  };
  const values = Object.keys(f).map((k) => T(f[k])).filter((v) => v !== '');
  const scan = (test, exclude) => {
    for (const v of values) {
      if ((exclude || []).indexOf(v) >= 0) continue;
      if (test(v)) return v;
    }
    return '';
  };

  let name = '', email = '', phone = '', company = '', message = '', subject = '', honeypot = '';

  if (source === 'website') {
    name = pick('yourname', 'name', 'fullname', 'contactname', 'firstname');
    email = pick('youremail', 'email', 'emailaddress', 'contactemail');
    phone = pick('yourphone', 'phone', 'telephone', 'tel', 'mobile', 'contactnumber');
    company = pick('company', 'companyname', 'business', 'businessname', 'organisation', 'organization');
    message = pick('yourmessage', 'message', 'comments', 'enquiry', 'enquirydetails', 'details', 'notes', 'howcanwehelp');
    honeypot = pick('honeypot', 'hp', 'website2', 'url2', 'nickname');
  } else if (source === 'email') {
    const fromRaw = pick('from', 'sender', 'replyto');
    const m = fromRaw.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/);
    if (m) { name = T(m[1]); email = T(m[2]); } else { email = fromRaw; name = ''; }
    subject = pick('subject', 'title');
    message = [subject, pick('text', 'body', 'plain', 'message', 'snippet')].filter(Boolean).join('\n\n');
    company = pick('company', 'organisation', 'organization');
  } else if (source === 'phone') {
    name = pick('callername', 'caller', 'contactname', 'name');
    phone = pick('callerphone', 'phone', 'number', 'telephone', 'mobile');
    company = pick('company', 'business');
    message = pick('note', 'callnote', 'callnotes', 'message', 'summary', 'details');
  }

  // Shape fallbacks, applied to every source: an unknown form still gets its message
  // through, and a number typed anywhere is still found.
  if (!email) email = scan((v) => EMAIL_RE.test(v), []);
  if (!phone) phone = scan((v) => PHONE_RE.test(v) && v.replace(/[^0-9]/g, '').length >= 7, [email]);
  if (!message) {
    const taken = [email, phone, name, company, subject, honeypot];
    message = values.filter((v) => taken.indexOf(v) < 0 && v.length > 25)
      .sort((a, b) => b.length - a.length)[0] || '';
  }
  if (!email && EMAIL_RE.test(name)) { email = name.toLowerCase(); name = ''; }
  email = email.toLowerCase();

  // What they actually want, decided by keywords in what they wrote. This is a rule, not a
  // model — the honest gap the README names, and the first thing to replace for a client.
  const hay = (subject + ' ' + message).toLowerCase();
  let wants = 'general';
  if (/\b(support|broken|not working|issue|problem|fix|error|urgent)\b/.test(hay)) wants = 'support';
  else if (/\b(quote|quotation|price|pricing|cost|how much|estimate|budget)\b/.test(hay)) wants = 'quote';
  else if (/\b(demo|trial|walkthrough|show me)\b/.test(hay)) wants = 'demo';

  const parts = name.split(/\s+/).filter(Boolean);
  const digits = phone.replace(/[^0-9]/g, '');
  const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

  const problems = [];
  if (honeypot) problems.push('honeypot field was filled in');
  if (!source) problems.push('did not match a website form, a forwarded email or a phone note');
  if (email && !EMAIL_RE.test(email)) problems.push('email address is not valid');
  if (cfg.require_contact && !email && !phone) problems.push('no email address and no phone number to reach them on');
  if (!name && !company && !message) problems.push('nothing in it but a way to get in touch');
  if (cfg.require_message && !message) problems.push('no message');

  const summary = [
    SOURCE_LABELS[source] || 'Lead',
    'from ' + (name || company || 'someone') + (name && company ? ' (' + company + ')' : ''),
    '— wants ' + wants
  ].join(' ');

  return {
    _ok: problems.length === 0,
    _problems: problems,
    contact_key: email || digits || slug(name + ' ' + company),
    source,
    source_label: SOURCE_LABELS[source] || '',
    name,
    first_name: parts[0] || '',
    last_name: parts.slice(1).join(' '),
    email,
    phone,
    company,
    message: message.slice(0, 4000),
    subject,
    wants,
    summary,
    received: new Date().toISOString()
  };
}

return $input.all().map((item) => ({ json: readOne(item.json) }));
