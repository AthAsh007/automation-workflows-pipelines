// One card out of whatever Trello posted. The payload may arrive as a raw Trello
// webhook, a form POST forwarded into n8n, or the demo cards above — this reader
// handles all three shapes and pulls the same facts out of each.
//
// Output per card: the extracted lead fields, `_ok` and `_problems`.

const cfg = $('config').first().json;
const T = (v) => String(v == null ? '' : v).trim();
const NAME_RE  = /^([A-Z][a-z]+(?:\s[A-Z][a-z]+)+)$/;
const PHONE_RE = /^\+?[0-9][0-9\s().-]{6,15}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Flatten a Trello webhook payload (action.data.card etc.) or a bare card object
// into something we can scan with simple string lookups.
function flatten(obj, depth, out) {
  out = out || {};
  if (!obj || typeof obj !== 'object' || depth > 4) return out;
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, depth + 1, out);
    else out[String(k).toLowerCase()] = Array.isArray(v) ? v.join(', ') : v;
  }
  return out;
}

function extractCard(json) {
  const j = json;
  if (j.action && j.data && j.data.card) return { raw: j.data.card, action: j.action, wrapper: j };
  if (j.data && j.data.card) return { raw: j.data.card, action: j.action || { type: 'unknown' }, wrapper: j };
  if (j.card) return { raw: j.card, action: { type: 'direct' }, wrapper: j };
  if (j.name) return { raw: j, action: { type: 'direct' }, wrapper: j };
  return { raw: {}, action: { type: 'unknown' }, wrapper: j };
}

function readOne(json) {
  const { raw, action } = extractCard(json);
  const f = flatten(raw, 0);

  // The human-entered text on the card — desc and name only. The flat fields contain
  // Trello system ids (long digit strings) that would look like phone numbers.
  const descText = T(raw.desc || f.desc || f.description || '') + ' ' + T(raw.name || f.name || '');

  // Pull phone: custom fields first, then named fields, then the description text only
  let phone = '';
  if (raw.customFieldItems && cfg.phone_field_ids && cfg.phone_field_ids.length) {
    for (const item of raw.customFieldItems) {
      if (cfg.phone_field_ids.indexOf(item.id) >= 0 && item.value && item.value.text) {
        phone = T(item.value.text);
        break;
      }
    }
  }
  if (!phone) {
    phone = T(f.phone || f.phonenumber || f.phonecontact || f['phone-number']);
  }
  if (!phone) {
    // Scan only the description and card name — not the entire payload, which
    // contains Trello system ids (long digit strings) that look like phone numbers.
    const descText = T(raw.desc || f.desc || f.description || '') + ' ' + T(raw.name || f.name || '');
    const phoneMatch = descText.match(/\+?\d{1,4}[\s.()\-]?\d{2,4}[\s.()\-]?\d{3,4}([\s.()\-]?\d{3,4})?/g);
    phone = phoneMatch ? phoneMatch[0].trim() : '';
  }

  // Name: try labels, desc, or field names
  let name = '';
  if (raw.labels && raw.labels.length) {
    for (const label of raw.labels) {
      if (label.name && NAME_RE.test(label.name)) { name = T(label.name); break; }
    }
  }
  if (!name) {
    name = T(f.name || f.customer || f.contactname || f.contact);
    const m = descText.match(/Customer:\s*([A-Z][a-z]+(?:\s[A-Z][a-z]+)+)/i);
    if (m) name = T(m[1]);
  }

  // Email, company, budget, timeline from the description text
  const email = T(f.email || (function() {
    const m = descText.match(/Email:\s*([^\s@]+@[^\s@]+\.[^\s@]{2,})/i);
    return m ? m[1] : '';
  })());

  const company = T(f.company || (function() {
    const m = descText.match(/Company:\s*([^\n]+)/i);
    return m ? m[1] : '';
  })());

  const budget = T((function() {
    const m = descText.match(/Budget:\s*([^\n]+)/i);
    return m ? m[1] : '';
  })());

  const timeline = T((function() {
    const m = descText.match(/Timeline:\s*([^\n]+)/i);
    return m ? m[1] : '';
  })());

  const cardName = T(raw.name || f.title || f.summary || f.subject || '');
  const cardUrl  = 'https://trello.com/c/' + (raw.shortLink || 'x') + '/' + (raw.idShort || '');

  const labels = (raw.labels || []).map((l) => T(l.name || l)).filter(Boolean);
  const isLead = !cfg.lead_label_prefix || labels.some((l) => l.toLowerCase().startsWith(cfg.lead_label_prefix.toLowerCase()));

  const problems = [];
  if (!phone)            problems.push('no phone number — cannot send SMS');
  if (!name && !company) problems.push('no name or company to personalise the message with');
  if (!isLead)           problems.push('card does not carry a lead label (' + (cfg.lead_label_prefix || 'lead') + ')');

  const summary = [
    'Card on "' + (f.boardname || (raw.board && raw.board.name) || 'Trello') + '"',
    'list "' + (f.listname || (raw.list && raw.list.name) || 'unknown') + '"',
    name ? 'for ' + name : '',
    phone ? '— has a number' : '— NO number to SMS'
  ].filter(Boolean).join(' ');

  return {
    _ok:         problems.length === 0,
    _problems:   problems,
    _card_id:    T(raw.id || f.id || ''),
    card_name:   cardName,
    card_url:    cardUrl,
    action_type: T(action.type || ''),
    contact_name: name,
    company:     company,
    phone:       phone,
    email:       email,
    budget:      budget,
    timeline:    timeline,
    labels:      labels,
    summary:     summary,
    received:    new Date().toISOString()
  };
}

return $input.all().map((item) => ({ json: readOne(item.json) }));
