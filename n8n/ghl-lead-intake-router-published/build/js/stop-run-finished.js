// The end of every run that had leads due. This node's output is the run report, whether or not
// it was also posted to chat or logged to a sheet, so the execution list always says what
// happened: open it to read who was touched, who is waiting, who stopped and why.
const cfg = $('config').first().json;
const r = $('build the run report').first().json;
return [{
  json: {
    _outcome: 'run finished',
    _reason: cfg.mode === 'live' ? 'touches sent where due' : 'preview run, nothing was sent or written',
    posted_to_chat: cfg.report_enabled === true,
    logged_to_sheet: cfg.log_enabled === true,
    summary: r.summary,
    sent: r.sent, previewed: r.previewed, waiting: r.waiting, stopped: r.stopped, failed: r.failed,
    ai_written: r.ai_written, template_written: r.template_written,
    stopped_by_reason: r.stopped_by_reason,
    touches: r.touches,
    waiting_leads: r.waiting_leads,
    stopped_leads: r.stopped_leads,
    failed_leads: r.failed_leads
  }
}];
