// The week, from the log: what went out, what did not, and what the gates cost.
//
// A pipeline with an approval gate fails quietly in a specific way: drafts start expiring
// unanswered, or edits keep getting refused, and the page simply posts less. None of that is an
// error, so nothing alerts. This report is where it shows up — as counts, once a week, next to
// what did go out and (if STATS_ENABLED) how it did.
//
// Approval time is measured from the FIRST `awaiting` row for a slug to its `posted` row, so a
// draft that was edited twice is counted honestly rather than from its last revision.

const cfg = $('config').first().json;
const d = $json;
const rows = d._week_rows || [];
const stats = d._stats || {};

const count = (s) => rows.filter((r) => r.status === s).length;
const posted = rows.filter((r) => r.status === 'posted');

const hours = [];
for (const p of posted) {
  const first = rows.filter((r) => r.slug === p.slug && r.status === 'awaiting')
    .map((r) => Date.parse(r.at)).filter((t) => !isNaN(t)).sort((a, b) => a - b)[0];
  const done = Date.parse(p.at);
  if (first && !isNaN(done) && done >= first) hours.push((done - first) / 3600000);
}
hours.sort((a, b) => a - b);
const median = hours.length ? Math.round(hours[Math.floor((hours.length - 1) / 2)] * 10) / 10 : null;

const lines = [];
lines.push('*LinkedIn weekly report* — week of ' + d._week + (cfg.using_demo_bank ? ' (demo log)' : ''));
lines.push('');
lines.push('*Published:* ' + posted.length
  + (median !== null ? '   *Median time to approval:* ' + median + 'h' : ''));
for (const p of posted) {
  const s = stats[p.urn];
  lines.push('• ' + p.slug + (p.pillar ? ' (' + p.pillar + ')' : '')
    + (p.urn ? ' — https://www.linkedin.com/feed/update/' + p.urn + '/' : '')
    + (s ? ' — ' + s.impressions + ' impressions, ' + s.clicks + ' clicks, ' + s.likes
      + ' reactions, ' + s.comments + ' comments' : ''));
}
lines.push('');
lines.push('*Not published:* ' + count('cancelled') + ' cancelled, ' + count('expired')
  + ' expired unanswered, ' + count('failed') + ' failed');
lines.push('*Edits:* ' + count('superseded') + ' accepted and re-delivered, ' + count('edit-refused')
  + ' refused by the caption rules');
if (count('alert')) lines.push('*LinkedIn refused the token ' + count('alert') + ' time(s) this week.*');
if (cfg.linkedin_token_days_left !== null && cfg.linkedin_token_days_left <= cfg.token_warn_days) {
  lines.push('*Token:* expires in ' + cfg.linkedin_token_days_left + ' day(s)');
}
if (d._stats_note) lines.push('_' + d._stats_note + '_');
if (count('expired') >= 2) {
  lines.push('');
  lines.push('Two or more drafts expired unanswered. Check that the approvers can see the channel.');
}

const text = lines.join('\n');

return [{
  json: {
    _week: d._week,
    _week_key: d._week_key,
    _report_text: text,
    _report_body: { text: text },
    _published: posted.length,
    _reason: 'weekly report for ' + d._week + ': ' + posted.length + ' published, '
      + count('expired') + ' expired, ' + count('cancelled') + ' cancelled'
  }
}];
