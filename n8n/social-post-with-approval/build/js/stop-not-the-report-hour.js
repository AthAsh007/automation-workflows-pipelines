// Not time for the weekly report, or it already went out this week.
//
// Fires on almost every poll, and that is the design: one 5-minute trigger drives both the
// approval check and the report, so one `config` node governs both. Two triggers would need
// two config nodes, and two config nodes drift.
const cfg = $('config').first().json;
const s = $json;

return [{
  json: {
    _stopped: 'not the report hour',
    _mode: cfg.mode,
    _reason: '[IDLE] ' + s._reason,
    _at: new Date().toISOString()
  }
}];
