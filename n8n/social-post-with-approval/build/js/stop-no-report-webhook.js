// The weekly report was built, but REPORT_WEBHOOK_URL is blank, so it was posted nowhere.
//
// The whole report is in this node's input — open it. Nothing is logged, so it is built again
// on the next poll inside the report hour; with no destination that costs nothing.
const cfg = $('config').first().json;
const s = $json;

return [{
  json: {
    _stopped: 'no report webhook',
    _mode: cfg.mode,
    _report: s._report_text,
    _reason: '[SKIPPED] weekly report built (' + s._week + ') but REPORT_WEBHOOK_URL is blank',
    _at: new Date().toISOString()
  }
}];
