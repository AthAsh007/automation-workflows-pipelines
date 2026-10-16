// STOP: not the weekly report hour.
//
// This fires on 167 of every 168 runs, and that is the design. One hourly trigger drives
// both halves of this workflow, which is what keeps a single `config` node authoritative
// over both — two triggers would need two config nodes, and two config nodes drift.
const cfg = $('config').first().json;

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

return [{
  json: {
    report_due: false,
    _note: 'The weekly report runs ' + DAYS[cfg.report_day] + ' at ' +
      String(cfg.report_hour).padStart(2, '0') + ':00 in this instance\'s timezone. ' +
      'Replies were still worked on this run.'
  }
}];
