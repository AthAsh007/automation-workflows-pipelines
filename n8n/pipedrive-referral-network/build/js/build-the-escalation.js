// The management escalation, kept separate from the team summary on purpose.
//
// A manager does not need the forty routine activities the guard scheduled, and does not
// need the same deal every morning. They get the manager tier only — overdue past
// MANAGER_AFTER_DAYS business days, or high-value and stalled — and only what is NEW or due
// a reminder, grouped by rep so the conversation is "Dana, these three" rather than a list.
const cfg = $('config').first().json;
const s = $json;

const list = (s.manager_new || []).map(function (r) { return Object.assign({ kind: 'new' }, r); })
  .concat((s.manager_reminders || []).map(function (r) {
    return Object.assign({ kind: 'reminder' }, r);
  }));

const byOwner = {};
list.forEach(function (r) {
  const k = r.owner || 'Unassigned';
  (byOwner[k] = byOwner[k] || []).push(r);
});

const lines = [];
lines.push('*Referral network — management escalation*');
lines.push((s.manager_new || []).length + ' new · ' + (s.manager_reminders || []).length +
  ' still open since you were told · ' + (s.manager_already_told || []).length +
  ' told recently, not repeated');
Object.keys(byOwner).sort(function (a, b) { return byOwner[b].length - byOwner[a].length; })
  .forEach(function (owner) {
    lines.push('');
    lines.push('*' + owner + '* (' + byOwner[owner].length + ')');
    byOwner[owner].slice(0, 8).forEach(function (r) {
      lines.push('• ' + (r.kind === 'reminder' ? '[again, first told ' + r.first_escalated + '] ' : '') +
        r.organisation + ' (' + r.stage + ', ' + r.value + ') — ' + r.why);
    });
    if (byOwner[owner].length > 8) lines.push('  … and ' + (byOwner[owner].length - 8) + ' more');
  });
if ((s.resolved_since_escalation || []).length) {
  lines.push('');
  lines.push('Resolved since last told: ' + s.resolved_since_escalation.join(', '));
}
lines.push('');
lines.push('Coverage: ' + s.coverage_pct_after + '% of ' + s.open_deals +
  ' open deals have a next activity' + (s.trend ? ' (' + s.trend + ')' : '') + '.');

return [{ json: Object.assign({}, s, { _escalation_body: { text: lines.join('\n') } }) }];
