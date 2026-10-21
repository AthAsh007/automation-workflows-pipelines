// The log says two drafts are open at once, or one has no message id.
//
// Workflow 01 only ever opens one, so the sheet was edited by hand or a write was cut off half
// way. Neither draft is published: guessing which one the reviewer meant is how the wrong post
// goes out. Close the wrong one with a `cancelled` row carrying its message id.
const cfg = $('config').first().json;
const s = $json;

return [{
  json: {
    _stopped: 'log conflict',
    _mode: cfg.mode,
    _slug: s._slug,
    _reason: '[BLOCKED] ' + s._reason,
    _at: new Date().toISOString()
  }
}];
