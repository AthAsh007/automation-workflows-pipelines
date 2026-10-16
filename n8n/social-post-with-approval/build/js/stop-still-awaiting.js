// The draft is still open. Nobody has replied yet.
//
// Deliberately does nothing else — no reminder, no nudge, no escalation. A reviewer who has
// not answered has not answered; pinging them from a workflow that publishes on the word
// "post" trains people to type it quickly.
const cfg = $('config').first().json;
const s = $json;

return [{
  json: Object.assign({}, s, {
    _stopped: 'still awaiting approval',
    _mode: cfg.mode,
    _reason: '[WAITING] ' + s._reason,
    _at: new Date().toISOString()
  })
}];
