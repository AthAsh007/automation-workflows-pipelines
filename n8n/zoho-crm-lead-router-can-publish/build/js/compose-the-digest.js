// The weekly-shaped summary of one sweep: what was created, what was escalated, what is
// stalled, and what the run could not see.
//
// A report that only lists successes is how a pipeline gets trusted while quietly rotting.
// The counts that matter here are the ones nobody wants: escalated and stalled.
const cfg = $('config').first().json;
const deals = $('check every deal').all().map((i) => i.json || {});

const by = (v) => deals.filter((d) => d.verdict === v);
const stalled = deals.filter((d) => d.stalled && d.verdict !== 'skip');
const truncated = deals.some((d) => d._truncated);

const line = (d) => '• ' + d.name + ' — ' + d.stage + ' (' + (d.owner || 'unassigned') + ')';

const text = [
  'Pipeline sweep — ' + new Date().toISOString().slice(0, 10),
  '',
  'Open deals checked: ' + deals.filter((d) => d.verdict !== 'skip').length,
  'Next action created: ' + by('create').length,
  'Escalated (overdue, not stacked): ' + by('escalate').length,
  'Already compliant: ' + by('ok').length,
  'Stalled: ' + stalled.length,
  ''
];

if (by('escalate').length) {
  text.push('Overdue — these need a person, not a task:');
  by('escalate').forEach((d) => text.push(line(d) + ' — ' + d.next_step));
  text.push('');
}
if (stalled.length) {
  text.push('Untouched too long for their stage:');
  stalled.forEach((d) => text.push(line(d) + ' — ' + d.days_since_touch + ' days'));
  text.push('');
}
if (truncated) {
  text.push('NOTE: more deals matched than DEAL_PAGE_LIMIT allows. Some were not swept.');
  text.push('');
}
if (deals.some((d) => d._demo)) {
  text.push('NOTE: this ran on the built-in demo pipeline. No Zoho account was read.');
}

return [{
  json: {
    _outcome: 'digest composed',
    created: by('create').length,
    escalated: by('escalate').length,
    compliant: by('ok').length,
    stalled: stalled.length,
    truncated,
    _send: cfg.notify_enabled && cfg.notify_on_digest,
    text: text.join('\n'),
    _notify: {
      url: cfg.notify_webhook_url,
      body: { text: text.join('\n') }
    }
  }
}];
