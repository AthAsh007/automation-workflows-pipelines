// STOP: the pitch log was not written.
//
// This is a reportable state, not a quiet one. The brief treats same-day logging as part of
// the job, so a run that sent pitches and could not log them is called out in the summary
// with the count — it is a reconciliation the person working the inbox has to do by hand
// tomorrow.
//
// In preview nothing was sent either, so there is nothing to reconcile.
const cfg = $('config').first().json;
const items = $input.all();
const sent = items.filter(function (i) { return i.json.sent === true; }).length;

// Both the gap and its reason are read off what the run actually did, not off the mode it
// was configured in. A run that sent mail has a reconciliation to do whatever TEST_RUN said.
const gap = sent > 0;

return items.map(function (item) {
  return { json: Object.assign({}, item.json, {
    logged: false,
    log_gap: gap,
    log_reason: gap
      ? 'Airtable is not configured — ' + sent +
        ' sent pitch(es) are NOT in the dashboard and must be reconciled by hand'
      : 'nothing was sent, so there is nothing to log'
  }) };
});
