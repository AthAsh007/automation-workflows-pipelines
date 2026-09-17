// The compliance requirement, enforced rather than documented.
//
// "Do not create fields for identifiable patient medical information, diagnoses,
//  medications, screening responses, medical records or other patient PHI."
//
// Two different things can go wrong, and they deserve two different reactions:
//
//   1. The CRM already contains a field whose NAME looks like PHI. That is not this
//      workflow's doing. It is reported, loudly, in every run summary — and the field is
//      added to a blocklist so nothing here ever reads it.
//
//   2. This workflow is CONFIGURED to read one of those fields. That is our mistake, and
//      the run stops. A misconfiguration that quietly copies a diagnosis into a dashboard
//      is exactly the failure the client wrote the requirement to prevent.
//
// Aggregate recruitment results — counts of referrals, screens, enrolments — are in scope
// and are not caught by this: a number of patients is not a patient.
const cfg = $('config').first().json;
const pipeline = $json;

const words = cfg.forbidden_field_words || [];
const fields = pipeline.deal_fields || [];

function looksLikePhi(name) {
  const n = String(name || '').toLowerCase();
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    // Short keys like 'dob', 'mrn', 'phi' and 'ssn' are matched as whole words, so a field
    // called "Method of introduction" is not flagged for containing "dob"... it does not,
    // but "Doctor of birth cohort" style names and abbreviations inside longer words are a
    // real source of false positives, and a check that cries wolf gets switched off.
    const whole = w.length <= 4;
    const hit = whole
      ? new RegExp('(^|[^a-z])' + w + '([^a-z]|$)').test(n)
      : n.indexOf(w) !== -1;
    if (hit) return w;
  }
  return '';
}

const violations = [];
const blocked = {};
fields.forEach(function (f) {
  const word = looksLikePhi(f.name);
  if (word) {
    blocked[f.key] = true;
    violations.push({ key: f.key, name: f.name, matched: word });
  }
});

// The second check: is this workflow pointed at one of them?
const misconfigured = [];
(cfg.touched_fields || []).forEach(function (t) {
  const field = fields.filter(function (f) { return f.key === t.key; })[0];
  const name = field ? field.name : '';
  const word = looksLikePhi(name || t.name);
  if (word) {
    misconfigured.push(t.role + '.' + t.name + ' -> "' + (name || t.key) +
      '" (matched "' + word + '")');
  }
});

if (misconfigured.length) {
  throw new Error(
    'PHI boundary: this workflow is configured to read ' + misconfigured.length +
    ' field(s) that look like patient clinical data — ' + misconfigured.join('; ') +
    '. Pipedrive is the physician/practice CRM, not the patient database. Fix ' +
    'RESULT_FIELDS / CONTEXT_FIELDS in config before running again.');
}

// Which result fields are actually captured. A blank key is reported as "not captured",
// never as a zero — a zero is a finding, an absence is a gap in the CRM setup.
const resultFields = {};
const notCaptured = [];
Object.keys(cfg.result_fields || {}).forEach(function (name) {
  const key = String(cfg.result_fields[name] || '').trim();
  if (!key) { notCaptured.push(name); return; }
  if (blocked[key]) { notCaptured.push(name + ' (blocked: field name looks like PHI)'); return; }
  resultFields[name] = key;
});

return [{
  json: Object.assign({}, pipeline, {
    phi_violations: violations,
    phi_blocked_keys: Object.keys(blocked),
    result_field_keys: resultFields,
    results_not_captured: notCaptured,
    phi_ok: true
  })
}];
