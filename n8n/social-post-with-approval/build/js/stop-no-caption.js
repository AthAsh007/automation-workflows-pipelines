// The caption did not pass, so nothing is delivered.
//
// A caption is held for a stated reason — too long, too short, a banned phrase, the wrong
// number of hashtags, or no model configured to write one. It is never trimmed, rewritten
// or delivered with a warning attached. A reviewer handed a draft plus an apology approves
// the draft.
const cfg = $('config').first().json;
const s = $json;

return [{
  json: Object.assign({}, { _slug: s.slug, _slot: s.slot, _words: s._caption_words, _source: s._caption_source, _problems: s._problems }, {
    _stopped: 'caption held',
    _mode: cfg.mode,
    _reason: '[HELD] ' + (s._problems || []).join('; '),
    _at: new Date().toISOString()
  })
}];
