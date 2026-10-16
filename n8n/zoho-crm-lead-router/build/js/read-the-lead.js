// One node turning any intake shape into one lead shape. A website form posts flat fields,
// a forwarded email is a blob of text, a phone note is whatever somebody typed — and
// everything downstream reads the same six keys.
//
// This is the node that makes the rest of the workflow reusable. Add a fourth source by
// adding a branch here, not by copying the workflow.
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const PHONE_RE = /(\+?\d[\d\s().-]{7,}\d)/;

function firstMatch(text, re) {
  const m = String(text || '').match(re);
  return m ? m[0].trim() : '';
}

function wantsFrom(text) {
  const t = String(text || '').toLowerCase();
  if (/\b(support|broken|failing|error|bug|not working|issue)\b/.test(t)) return 'support';
  if (/\b(quote|pricing|price|cost|proposal)\b/.test(t)) return 'quote';
  if (/\b(demo|walkthrough|see it|trial)\b/.test(t)) return 'demo';
  return '';
}

function nameFrom(text) {
  const m = String(text || '').match(/(?:from|call from|caller)[:\s]+([A-Z][a-z]+ [A-Z][a-z]+)/i);
  if (m) return m[1];
  const n = String(text || '').match(/\b([A-Z][a-z]+ [A-Z][a-z]+)\b/);
  return n ? n[1] : '';
}

function companyFrom(text) {
  const m = String(text || '').match(/\bat ([A-Z][A-Za-z&.' -]{2,40}?)(?:[,.]|\s+\d|$)/);
  return m ? m[1].trim() : '';
}

return $input.all().map((item) => {
  const envelope = item.json || {};

  // `config` passes each incoming payload through under `lead`, so unwrap that first. A
  // webhook then nests the posted JSON one level further, under `body`. Both are unwrapped
  // here so the rest of this node never has to know which trigger fired.
  let raw = (envelope.lead && typeof envelope.lead === 'object') ? envelope.lead : envelope;
  if (raw.body && typeof raw.body === 'object' && !Array.isArray(raw.body)) raw = raw.body;

  const source = String(raw.source || 'unknown').toLowerCase();

  let name = '', email = '', phone = '', company = '', summary = '';

  if (source === 'website') {
    const f = raw.form || {};
    name = f.full_name || f.name || '';
    email = f.email || '';
    phone = f.phone || '';
    company = f.company || '';
    summary = f.message || '';
  } else if (source === 'email') {
    const body = raw.body || '';
    email = firstMatch(body, EMAIL_RE);
    phone = firstMatch(body, PHONE_RE);
    name = nameFrom(body);
    company = companyFrom(body);
    summary = String(raw.subject || '') + (body ? ' — ' + body.split('\n').pop() : '');
  } else {
    const note = raw.note || raw.body || raw.message || '';
    email = firstMatch(note, EMAIL_RE);
    phone = firstMatch(note, PHONE_RE);
    name = nameFrom(note);
    company = companyFrom(note);
    summary = note;
  }

  const parts = String(name || '').trim().split(/\s+/);
  const lastName = parts.length > 1 ? parts.slice(1).join(' ') : (parts[0] || '');
  const firstName = parts.length > 1 ? parts[0] : '';

  // Zoho's Leads module refuses a record with no Last_Name, and there is no point routing a
  // lead nobody can reply to. Both are checked here so the failure is one named STOP rather
  // than a 400 from Zoho three nodes later.
  const reachable = email !== '' || phone !== '';
  const named = lastName !== '';
  const looksLikeBot = /\b(seo services|guest post|backlink|crypto|loan offer)\b/i
    .test(String(summary));

  return {
    json: {
      _demo: raw._demo === true,
      _ok: reachable && named && !looksLikeBot,
      _why: !named ? 'no name to file it under'
        : !reachable ? 'no email and no phone — nobody could reply'
        : looksLikeBot ? 'reads as spam' : '',
      source,
      first_name: firstName,
      last_name: lastName,
      full_name: name,
      email,
      phone,
      company,
      summary: String(summary || '').trim().slice(0, 2000),
      wants: wantsFrom(summary)
    }
  };
});
