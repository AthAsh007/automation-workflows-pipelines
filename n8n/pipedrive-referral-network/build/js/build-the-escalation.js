// The management notification, kept separate from the rep-facing summary on purpose.
//
// A manager does not need the forty routine activities the guard scheduled. They need the
// two deals that are worth more than the threshold and have gone quiet, and the ones where
// a rep is sitting on an overdue task. Sending both audiences the same message is how both
// stop reading it.
const cfg = $('config').first().json;
const s = $json;

const lines = [];
lines.push('*Referral network — management escalation*');
if (s.high_priority_stalled) {
  lines.push(s.high_priority_stalled + ' high-value deal(s) stalled past their stage threshold');
}
if (s.escalated) {
  lines.push(s.escalated + ' deal(s) with an activity overdue by more than ' +
    cfg.overdue_days + ' days');
}
lines.push('');
(s.escalation_rows || []).slice(0, 15).forEach(function (r) { lines.push('• ' + r); });
if ((s.escalation_rows || []).length > 15) {
  lines.push('… and ' + (s.escalation_rows.length - 15) + ' more in the run summary');
}
lines.push('');
lines.push('Coverage: ' + s.coverage_pct_after + '% of ' + s.open_deals +
  ' open deals have a next activity.');

return [{ json: Object.assign({}, s, { _escalation_body: { text: lines.join('\n') } }) }];
