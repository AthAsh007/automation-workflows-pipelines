// What is in the channel is not what was approved.
//
// The message was edited, its image is gone, or the caption no longer matches the
// fingerprint written when it was delivered. An approval is given for specific words next
// to a specific picture; once either changes, the approval does not carry over.
//
// Nothing is published and nothing is repaired automatically. Cancel the draft and run
// workflow 01 again.
const cfg = $('config').first().json;
const s = $json;

return [{
  json: Object.assign({}, s, {
    _stopped: 'the approved draft changed',
    _mode: cfg.mode,
    _reason: '[BLOCKED] ' + (s._problems || []).join('; '),
    _at: new Date().toISOString()
  })
}];
