// The publish did not succeed, and it is not being retried.
//
// FAILED means a 4xx with a reason — read it, fix the cause, run again.
// DUPLICATE means it is already on the page. Stop.
// UNKNOWN means look at the page with your own eyes before doing anything at all, because
// this is the one state where running again can double-post.
//
// There is no automatic retry anywhere in this branch, on purpose.
const cfg = $('config').first().json;
const s = $json;

return [{
  json: Object.assign({}, s, {
    _stopped: 'publish failed',
    _mode: cfg.mode,
    _reason: '[' + s._outcome + '] ' + s._reason,
    _at: new Date().toISOString()
  })
}];
