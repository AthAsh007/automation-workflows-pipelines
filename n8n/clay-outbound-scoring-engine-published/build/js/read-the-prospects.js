// Turns whatever Clay posted into one clean prospect per row. CLAY_FIELDS in config says which
// key names mean which field, so a renamed Clay column is a config edit, not a code change.
//
// Accepts one row per request (Clay's HTTP API column), an array of rows, or { rows: [...] }.
// Nothing is dropped here: a row with no name or no company is kept, marked unusable with the
// reason, and stopped further down where it can be seen.
const cfg = $('config').first().json;
const F = cfg.clay_fields || {};

const pick = (row, field) => {
  for (const k of F[field] || [field]) {
    const v = row[k];
    if (v !== undefined && v !== null && String(v).trim() !== '') return v;
  }
  return '';
};
const str = (v) => String(v === undefined || v === null ? '' : v).trim();
const lower = (v) => str(v).toLowerCase();

const cleanDomain = (v) => lower(v).replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
const cleanEmail = (v) => {
  const e = lower(v);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : '';
};
const toList = (v) => (Array.isArray(v) ? v : str(v).split(/[,;|]/)).map(lower).filter(Boolean);
const toNumber = (v) => {
  if (typeof v === 'number') return v;
  const m = str(v).replace(/,/g, '').match(/\d+/g);   // "201-500" -> the lower bound
  return m ? Number(m[0]) : null;
};

function seniorityFrom(title, given) {
  const g = lower(given);
  if (g) {
    if (/c[-\s]?level|chief|owner|founder|cxo/.test(g)) return 'c-level';
    if (/vp|vice/.test(g)) return 'vp';
    if (/director|head/.test(g)) return 'director';
    if (/manager|lead/.test(g)) return 'manager';
  }
  const t = ' ' + lower(title).replace(/[^a-z ]/g, ' ') + ' ';
  for (const rule of cfg.seniority_from_title || []) {
    if (rule.words.some((w) => t.includes(' ' + w + ' ') || t.includes(' ' + w))) return rule.seniority;
  }
  return 'individual';
}

// Unwrap every incoming payload into rows.
const rows = [];
for (const item of $input.all()) {
  const j = item.json || {};
  const payload = j.incoming || j;
  const body = payload.body !== undefined ? payload.body : payload;
  const list = Array.isArray(body) ? body : (Array.isArray(body.rows) ? body.rows : [body]);
  for (const r of list) rows.push({ row: r || {}, source: payload._source || 'Clay webhook' });
}

return rows.map(({ row, source }, i) => {
  let first = str(pick(row, 'first_name'));
  let last = str(pick(row, 'last_name'));
  const full = str(pick(row, 'full_name')) || [first, last].filter(Boolean).join(' ');
  if (!first && !last && full) {
    const parts = full.split(/\s+/);
    first = parts[0];
    last = parts.slice(1).join(' ');
  }
  const title = str(pick(row, 'title'));
  const p = {
    clay_row_id: str(pick(row, 'clay_row_id')) || 'row-' + (i + 1),
    first_name: first,
    last_name: last,
    full_name: full,
    title: title,
    seniority: seniorityFrom(title, pick(row, 'seniority')),
    email: cleanEmail(pick(row, 'email')),
    phone: str(pick(row, 'phone')),
    linkedin_url: str(pick(row, 'linkedin_url')),
    company: str(pick(row, 'company')),
    domain: cleanDomain(pick(row, 'domain')),
    employees: toNumber(pick(row, 'employees')),
    industry: str(pick(row, 'industry')),
    country: str(pick(row, 'country')),
    technologies: toList(pick(row, 'technologies')),
    ai_persona: str(pick(row, 'ai_persona')),
    _source: source
  };
  if (row._demo) p._demo = row._demo;

  const missing = [];
  if (!full) missing.push('no name');
  if (!p.company && !p.domain) missing.push('no company or domain');
  p._usable = missing.length === 0;
  p._hold = p._usable ? '' : 'not enough to score: ' + missing.join(', ');
  return { json: p };
});
