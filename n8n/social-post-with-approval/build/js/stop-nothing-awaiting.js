// Nothing is waiting on a human, so there is nothing to do.
//
// This is the normal state for most of the day: workflow 01 drafts once each morning and
// this workflow runs every few minutes, so the overwhelming majority of its executions end
// here. That is the design, not a fault — the alternative is a watcher process somebody has
// to keep alive across reboots.
const cfg = $('config').first().json;
const s = $json;

return [{
  json: Object.assign({}, s, {
    _stopped: 'nothing awaiting',
    _mode: cfg.mode,
    _reason: '[IDLE] ' + s._reason,
    _at: new Date().toISOString()
  })
}];
