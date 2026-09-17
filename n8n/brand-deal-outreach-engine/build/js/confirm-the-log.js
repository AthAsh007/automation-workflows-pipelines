// Did every pitch actually reach the dashboard?
//
// Counts the records Airtable says it created and compares that with the number of pitches
// this run produced. A mismatch is reported as a LOG GAP, with the number — it is not
// treated as a successful run that happened to write less.
//
// This is the check that makes "accurate and same day" a property rather than an intention.
const pitches = $('what happened').all().map(function (i) { return i.json; });
const responses = $input.all().map(function (i) { return i.json || {}; });

let created = 0;
const errors = [];
responses.forEach(function (r) {
  if (Array.isArray(r.records)) { created += r.records.length; return; }
  errors.push((r.error && (r.error.message || r.error.type || r.error)) ||
    'batch returned no records');
});

const gap = pitches.length - created;

return pitches.map(function (p) {
  return { json: Object.assign({}, p, {
    logged: gap === 0,
    log_gap: gap > 0,
    log_written: created,
    log_expected: pitches.length,
    log_reason: gap === 0 ? '' :
      gap + ' of ' + pitches.length + ' pitches did not reach the dashboard' +
      (errors.length ? ' (' + errors.join('; ') + ')' : '')
  }) };
});
