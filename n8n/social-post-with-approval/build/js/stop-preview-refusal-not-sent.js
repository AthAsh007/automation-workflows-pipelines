// The edit was refused, and this run cannot reply in the channel (PREVIEW).
//
// In a live or test run the bot answers the edit with these reasons and logs the refusal so it
// is answered once. The original draft is untouched either way.
const cfg = $('config').first().json;
const s = $json;

return [{
  json: {
    _stopped: 'preview - refusal not sent',
    _mode: cfg.mode,
    _slug: s._slug,
    _problems: s._problems,
    _would_send: s._refusal_message,
    _reason: '[PREVIEW] ' + s._reason,
    _at: new Date().toISOString()
  }
}];
