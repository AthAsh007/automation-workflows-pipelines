// Folds the four Airtable reads into ONE item shaped {students, brands, inboxes, pitches}.
//
// Everything downstream reads this shape and never touches an Airtable response directly,
// so the demo roster and the real base are interchangeable from here on.
const cfg = $('config').first().json;

const S = cfg.student_fields;
const B = cfg.brand_fields;
const P = cfg.pitch_fields;
const I = cfg.inbox_fields;

const failures = [];
function records(payload, what) {
  if (!payload || payload.error || !Array.isArray(payload.records)) {
    failures.push(what + ': ' + ((payload && payload.error &&
      (payload.error.message || payload.error)) || 'no response'));
    return [];
  }
  return payload.records;
}

function map(rows, fields) {
  return rows.map(function (r) {
    const f = r.fields || {};
    const out = { _record_id: r.id };
    Object.keys(fields).forEach(function (key) { out[key] = f[fields[key]]; });
    return out;
  });
}

const students = map(records($('[cred] Airtable - students').first().json, 'students'), S);
const brands = map(records($('[cred] Airtable - brand targets').first().json, 'brands'), B);
const inboxes = map(records($('[cred] Airtable - inboxes').first().json, 'inboxes'), I);
const pitches = map(records($('[cred] Airtable - the pitch log').first().json, 'pitches'), P);

// An empty read that did not error is a real state — a roster with nobody active. An empty
// read that DID error must never look like one, because the difference is between "nothing
// to send today" and "we stopped sending and nobody noticed".
if (failures.length && students.length === 0) {
  throw new Error('Airtable returned nothing usable (' + failures.join('; ') +
    '). Refusing to report an empty roster as a quiet day.');
}

return [{
  json: {
    source: 'airtable',
    read_at: new Date().toISOString(),
    failures: failures,
    students: students.filter(function (s) {
      return cfg.active_student_states.indexOf(String(s.status || '')) !== -1;
    }),
    brands: brands.filter(function (b) {
      return cfg.open_brand_states.indexOf(String(b.status || '')) !== -1;
    }),
    inboxes: inboxes,
    pitches: pitches
  }
}];
