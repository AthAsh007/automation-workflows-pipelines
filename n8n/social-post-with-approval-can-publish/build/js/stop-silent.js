// Today is not a day to draft on. Not a failure — the state machine said so, and the
// reason travels with the run so the execution list reads as an answer rather than a gap.
//
// This is where 'already posted today', 'a draft is already awaiting approval' and
// 'not a publishing day' all land.
const cfg = $('config').first().json;
const s = $('resolve todays state').first().json;

return [{
  json: Object.assign({}, { _today: s._today, _weekday: s._weekday_name, _log_rows: s._log_rows }, {
    _stopped: 'silent',
    _mode: cfg.mode,
    _reason: '[SILENT] ' + (s._reason || 'nothing to do today'),
    _at: new Date().toISOString()
  })
}];
