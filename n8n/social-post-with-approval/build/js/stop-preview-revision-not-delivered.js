// The edit passed every caption rule, but this run cannot deliver anything (PREVIEW).
//
// In a live or test run the revised draft goes back to the channel here, with the original
// image, as a new draft that needs its own `post`. Open this node's input to see the exact
// message that would have been sent.
const cfg = $('config').first().json;
const s = $json;

return [{
  json: {
    _stopped: 'preview - revision not delivered',
    _mode: cfg.mode,
    _slug: s._slug,
    _would_send: s._message,
    _reason: '[PREVIEW] ' + s._reason + '. Not delivered: the workflow is in ' + cfg.mode
      + ' mode.',
    _at: new Date().toISOString()
  }
}];
