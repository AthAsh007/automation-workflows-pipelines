// The Pipedrive read failed, or was cut short. This is NOT a quiet day, and it must never
// look like one.
//
// Without this branch the guard's worst failure is invisible: a 401 or a rate limit comes
// back as an empty list, the rule finds "no uncovered deals", and the summary says the
// pipeline is fully covered. So a failed read gets its own message, naming the call that
// failed and what Pipedrive said, and the run then ends as a FAILED execution so n8n's
// own error workflow (if you have one) sees it too.
const cfg = $('config').first().json;
const p = $json;
const failures = p.failures || ['unknown read failure'];

const lines = [];
lines.push(':x: *Pipedrive read FAILED — the rule was not checked today*');
failures.forEach(function (f) { lines.push('• ' + f); });
lines.push('');
lines.push('Nothing was created, escalated or reported. This is not a clean pipeline — it is ' +
  'a pipeline nobody looked at. Check the API token and COMPANY_DOMAIN in config, then run ' +
  'it again.');
if (p.pages) {
  lines.push('Pages read before it stopped: deals ' + (p.pages.deals || 0) + ', activities ' +
    (p.pages.activities || 0) + '.');
}

return [{
  json: {
    read_ok: false,
    failures: failures,
    read_at: p.read_at,
    mode: cfg.mode,
    _failure_body: { text: lines.join('\n') },
    summary: lines.join('\n')
  }
}];
