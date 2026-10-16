// The caption will not fit in one Discord message, so the draft is held.
//
// Splitting it across two messages is worse than holding it: the watcher anchors on one
// message id, and a caption in two halves is one a reviewer approves having read the first.
const cfg = $('config').first().json;
const s = $json;

return [{
  json: Object.assign({}, { _slug: s.slug, _length: s._message_length, _limit: cfg.discord_message_limit }, {
    _stopped: 'message too long',
    _mode: cfg.mode,
    _reason: '[HELD] ' + (s._problems || []).join('; '),
    _at: new Date().toISOString()
  })
}];
