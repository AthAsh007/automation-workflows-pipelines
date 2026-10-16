// Nothing in the bank can go out today.
//
// Either every row is published, or every remaining row is held by the layout, pillar or
// Thursday guard. Both are worth seeing: the first means somebody needs to write more
// posts, the second means the bank's ordering has drifted and needs a reshuffle rather
// than more content. `_holds` says which, per row.
const cfg = $('config').first().json;
const s = $json;

return [{
  json: Object.assign({}, { _holds: s._holds, _bank_size: s._bank_size, _ready_size: s._ready_size }, {
    _stopped: 'bank exhausted',
    _mode: cfg.mode,
    _reason: '[HELD] ' + s._reason,
    _at: new Date().toISOString()
  })
}];
