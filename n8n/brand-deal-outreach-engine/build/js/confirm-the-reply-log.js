// Did every reply reach the dashboard? Same check as the sender's, same reason.
//
// Auto-replies are excluded from the expected count, because they are deliberately not
// written back. Counting them would manufacture a permanent, meaningless log gap and the
// alert would be ignored inside a week.
const replies = $('decide the next step').all().map(function (i) { return i.json; });
const expected = replies.filter(function (r) { return r.writes_back; }).length;
const responses = $input.all().map(function (i) { return i.json || {}; });

let written = 0;
const errors = [];
responses.forEach(function (r) {
  if (Array.isArray(r.records)) { written += r.records.length; return; }
  errors.push((r.error && (r.error.message || r.error.type || r.error)) ||
    'batch returned no records');
});

const gap = expected - written;

return replies.map(function (r) {
  return { json: Object.assign({}, r, {
    logged: gap === 0,
    log_gap: gap > 0,
    log_written: written,
    log_expected: expected,
    log_reason: gap === 0 ? '' :
      gap + ' of ' + expected + ' replies did not reach the dashboard' +
      (errors.length ? ' (' + errors.join('; ') + ')' : '')
  }) };
});
