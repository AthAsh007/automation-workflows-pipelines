// Every candidate from every ATS becomes the same object here. Two things matter:
//
//   1. The phone becomes E.164 or it becomes null. "(614) 555-0142", "614.555.0142" and
//      "+16145550142" are one number, and if they are not normalised on the way in then
//      the opt-out table cannot match them and somebody who texted STOP gets texted again.
//   2. A dedupe key is computed here rather than left to the database, so the run can
//      report "the same person is in your ATS four times" instead of silently collapsing it.
const cfg = $('config').first().json;
const map = (cfg.ats_fields && cfg.ats_fields.candidate) || {};
const exclude = (cfg.ats_exclude_statuses || []).map((s) => String(s).toLowerCase());

const dig = (obj, path) => {
  if (!path) return undefined;
  return String(path).split('.').reduce(
    (o, k) => (o === null || o === undefined ? undefined : o[k]), obj);
};
const str = (v) => (v === null || v === undefined ? '' : String(v).trim());

const asList = (v) => {
  if (!v) return [];
  const flat = Array.isArray(v) ? v : String(v).split(/[,;|]/);
  return flat
    .map((x) => (x && typeof x === 'object' ? (x.name || x.label || x.value || '') : x))
    .map((x) => str(x).toLowerCase())
    .filter((x) => x.length > 1);
};

// North American numbers. Anything else is left alone and flagged, because guessing a
// country code is how you call a stranger in another timezone at 3am.
function toE164(value) {
  const raw = str(value);
  if (!raw) return { phone: null, why: 'no number on the record' };
  if (/^\+[1-9]\d{7,14}$/.test(raw.replace(/[\s()-]/g, ''))) {
    return { phone: raw.replace(/[\s()-]/g, ''), why: '' };
  }
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 11 && digits[0] === '1') return { phone: '+' + digits, why: '' };
  if (digits.length === 10) {
    // NANP: area code and exchange both start 2-9. Catches 000-000-0000 placeholders.
    if (digits[0] < '2' || digits[3] < '2') {
      return { phone: null, why: 'not a valid North American number: ' + raw };
    }
    return { phone: '+1' + digits, why: '' };
  }
  if (digits.length > 11) return { phone: null, why: 'looks international, left for review: ' + raw };
  return { phone: null, why: 'unusable number: ' + raw };
}

const items = $input.all().map((i) => i.json).filter((r) => r && !r._empty_placeholder);

// Some ATS search endpoints return {data:[...]}, some return the array, some paginate into
// {results:[...]}. Flatten whichever arrived.
let rows = [];
for (const it of items) {
  if (Array.isArray(it.data)) rows = rows.concat(it.data);
  else if (Array.isArray(it.results)) rows = rows.concat(it.results);
  else if (Array.isArray(it.candidates)) rows = rows.concat(it.candidates);
  else rows.push(it);
}

const seen = new Map();
const out = [];
const skipped = { no_id: 0, no_phone: 0, excluded_status: 0, duplicate_in_ats: 0 };

for (const r of rows) {
  const ats_candidate_id = str(dig(r, map.id) || r.id || r.candidate_id);
  if (!ats_candidate_id) { skipped.no_id++; continue; }

  const first_name = str(dig(r, map.first_name) || r.first_name);
  const last_name = str(dig(r, map.last_name) || r.last_name);
  const status = str(dig(r, map.status) || r.status);

  if (status && exclude.indexOf(status.toLowerCase()) !== -1) {
    skipped.excluded_status++;
    continue;   // Placed / Do Not Contact. Dropped here, never scored, never stored as eligible.
  }

  // Mobile first: an SMS to a landline is a guaranteed Twilio 30003 and a wasted segment.
  const primary = toE164(dig(r, map.phone) || r.mobile);
  const fallback = primary.phone ? primary : toE164(dig(r, map.phone_alt) || r.phone);
  const phone_e164 = primary.phone || fallback.phone;
  const phone_note = phone_e164 ? '' : (primary.why || fallback.why);

  const candidate = {
    ats_candidate_id: ats_candidate_id,
    first_name: first_name,
    last_name: last_name,
    full_name: (first_name + ' ' + last_name).trim() || ('candidate ' + ats_candidate_id),
    email: str(dig(r, map.email) || r.email).toLowerCase(),
    phone_e164: phone_e164,
    _phone_note: phone_note,
    title: str(dig(r, map.title) || r.title),
    skills: asList(dig(r, map.skills) || r.skills),
    city: str(dig(r, map.city)),
    state: str(dig(r, map.state)).toUpperCase().slice(0, 2),
    timezone: str(r.timezone) || cfg.default_timezone,
    ats_status: status,
    _source_row: ats_candidate_id
  };

  if (!phone_e164) skipped.no_phone++;

  // Duplicate defence #3, and the only one that runs before anything is written: the same
  // human under two ATS ids. Keep the record with the most on it rather than the first seen.
  const key = phone_e164 || ('email:' + candidate.email) || ('name:' + candidate.full_name.toLowerCase());
  if (phone_e164 || candidate.email) {
    const prior = seen.get(key);
    if (prior) {
      skipped.duplicate_in_ats++;
      prior._duplicate_ats_ids = (prior._duplicate_ats_ids || []).concat(ats_candidate_id);
      const weight = (c) => (c.skills.length ? 2 : 0) + (c.email ? 1 : 0) + (c.title ? 1 : 0);
      if (weight(candidate) > weight(prior)) {
        candidate._duplicate_ats_ids = prior._duplicate_ats_ids;
        out[out.indexOf(prior)] = candidate;
        seen.set(key, candidate);
      }
      continue;
    }
    seen.set(key, candidate);
  }
  out.push(candidate);
}

if (!out.length) {
  return [{ json: { _no_candidates: true, _skipped: skipped, _rows_from_ats: rows.length } }];
}

return out.map((c) => ({
  json: Object.assign(c, {
    _no_candidates: false,
    _skipped: skipped,
    _rows_from_ats: rows.length,
    _unique_people: out.length
  })
}));
