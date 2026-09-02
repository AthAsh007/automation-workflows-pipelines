// The outcome was decided but nothing was written into the client's ATS.
//
// Only a LIVE run may write into a client's system. A preview or test run does everything
// else — qualifies, picks a slot, builds the note — and stops here with the note it would
// have written, which is exactly what you want on screen when a client asks what lands in
// their Bullhorn.
const cfg = $('config').first().json;
const j = $input.first().json || {};

return [{
  json: Object.assign({}, j, {
    _outcome: 'write-back skipped',
    _why: j._why_not || ('this run is ' + cfg.mode),
    would_have_written: (j.writebacks || []).map((w) => ({
      action: w.action,
      ats_candidate_id: w.ats_candidate_id,
      idempotency_key: w.idempotency_key
    })),
    the_note_it_would_write: j.ats_note_preview,
    the_status_it_would_set: j.new_ats_status,
    _next_step: 'Set TEST_RUN = false (and DEMO_MODE = false) to write for real. The rows '
      + 'are queued to ats_writebacks first, so an ATS outage delays them rather than '
      + 'losing them.'
  })
}];
