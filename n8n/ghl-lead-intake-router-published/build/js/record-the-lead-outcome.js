// Every lead that leaves the loop body passes through here, whichever way it went: waiting,
// stopped, previewed or sent. One flat record per lead, which the loop collects for the run
// report. A stop written to GoHighLevel (a reply or an opt-out) arrives as the API response, so
// its decision is read back from `check replies and opt-outs`.
const j = $input.first().json || {};
let o = j;
let stopWrite = '';
if (!j._outcome) {
  o = $('check replies and opt-outs').first().json;
  const tag = $('[cred] GoHighLevel - tag the stopped lead').first().json || {};
  const msg = (e) => String((e && (e.message || e.description)) || e).slice(0, 160);
  const errors = [tag.error, j.error].filter(Boolean).map(msg)
    .filter((m, i, all) => all.indexOf(m) === i);
  stopWrite = errors.length ? 'failed: ' + errors.join('; ') : 'written';
}

return [{
  json: {
    contact_key: o.contact_key,
    name: o.name,
    owner: o.owner,
    stage: o.stage,
    touch: o.touch,
    channel: o.channel || '',
    outcome: o._outcome,
    reason_key: o.reason_key || o._outcome,
    reason: o._reason || '',
    text_source: o.text_source || '',
    fallback_reason: o.fallback_reason || '',
    subject: o.subject || '',
    body: o.body || '',
    to: o.to || '',
    would_write: o.would_write || [],
    write_back_failed: o.write_back_failed === true,
    write_back_errors: o.write_back_errors || [],
    stop_write: stopWrite || (o._stop_writes ? 'preview, not written' : ''),
    local_time: o.local_time || '',
    _demo: o._demo === true
  }
}];
