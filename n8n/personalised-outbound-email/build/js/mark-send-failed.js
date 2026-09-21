// The SMTP node's error output hands on its error, not the lead, so re-attach the lead
// the same way "mark sent" does. "send this one?" is the last node the full lead passed
// through untouched.
//
// The row is deliberately NOT written back as Contacted. Task Progress and Contact Status
// fall to the "no deliverables" settings, which ship blank and therefore leave both
// columns alone, so the lead keeps its place in the pipeline and the next run picks it up
// again. All that changes is a note saying why, and the next action.
const lead = $('send this one?').first().json;
const err = $input.first().json || {};

const message = String(
  (err.error && (err.error.message || err.error)) || err.message || 'SMTP send failed'
).replace(/\s+/g, ' ').trim().slice(0, 200);

return [{
  json: Object.assign({}, lead, {
    _outcome: 'send_failed',
    _skip_reason: 'send failed - ' + message
  })
}];
