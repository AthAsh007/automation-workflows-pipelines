// "Report weekly — clean numbers so students and the team can see progress."
//
// One block per student, because that is how the engagement is sold: $50 per student per
// month, two months each. A student who cannot see their own numbers has no way to judge
// whether the two months were worth it, and that judgement is the renewal.
//
// Three rules run through it:
//
//   Held pitches are shown, not hidden. They are the cost of the quality gates, and a
//   client who cannot see that number cannot decide whether the gates are set right.
//
//   Rates are computed against what was SENT, never against what was written. A reply rate
//   that quietly divides by the bigger number flatters the run and is wrong.
//
//   A student below their pro-rata target is named. The point of a weekly report is to
//   catch that on the Monday, not at the end of the engagement.
const cfg = $('config').first().json;
const log = $json;

const DAY = 86400000;
const now = Date.now();
const windowStart = now - Number(cfg.report_window_days || 7) * DAY;

function stamp(s) {
  if (!s) return null;
  const ms = Date.parse(String(s));
  return isNaN(ms) ? null : ms;
}
function pct(a, b) { return b ? Math.round((a / b) * 1000) / 10 : 0; }

const rows = (log.pitches || []).filter(function (p) {
  const at = stamp(p.sent_at) || stamp(p.reply_at);
  return at === null ? String(p.state || '').toLowerCase() === 'held' : at >= windowStart;
});

const byStudent = {};
const holdReasons = {};

rows.forEach(function (p) {
  const k = p.student || p.student_id || 'unknown';
  if (!byStudent[k]) {
    byStudent[k] = { student: k, written: 0, sent: 0, held: 0, replies: 0, interested: 0,
      booked: 0, value: 0, unsubscribes: 0 };
  }
  const s = byStudent[k];
  s.written++;
  const held = String(p.state || '').toLowerCase() === 'held';
  if (held) {
    s.held++;
    const key = String(p.hold_reason || 'held').split(':')[0].split('—')[0].trim();
    holdReasons[key] = (holdReasons[key] || 0) + 1;
  } else if (p.sent_at) {
    s.sent++;
  }
  if (p.reply_class && p.reply_class !== 'auto-reply' && p.reply_class !== 'bounce') {
    s.replies++;
    if (p.reply_class === 'interested') s.interested++;
    if (p.reply_class === 'unsubscribe') s.unsubscribes++;
  }
  if (p.booked_at) { s.booked++; s.value += Number(p.deal_value || 0); }
});

const students = Object.keys(byStudent).map(function (k) {
  const s = byStudent[k];
  s.reply_rate = pct(s.replies, s.sent);
  s.interest_rate = pct(s.interested, s.sent);
  s.unsub_rate = pct(s.unsubscribes, s.sent);
  return s;
}).sort(function (a, b) { return b.sent - a.sent; });

const totals = students.reduce(function (a, s) {
  a.written += s.written; a.sent += s.sent; a.held += s.held; a.replies += s.replies;
  a.interested += s.interested; a.booked += s.booked; a.value += s.value;
  a.unsubscribes += s.unsubscribes;
  return a;
}, { written: 0, sent: 0, held: 0, replies: 0, interested: 0, booked: 0, value: 0,
     unsubscribes: 0 });

// Working days in the window, so the target is pro-rata rather than a monthly figure
// compared against a week.
let workingDays = 0;
for (let d = 0; d < Number(cfg.report_window_days || 7); d++) {
  const day = new Date(now - d * DAY).getDay();
  if (day !== 0 && day !== 6) workingDays++;
}
const targetPerStudent = Number(cfg.pitches_per_student_per_day || 25) * workingDays;
const behind = students.filter(function (s) { return s.sent < targetPerStudent * 0.8; });

const lines = [];
lines.push('*Weekly outreach report* — last ' + cfg.report_window_days + ' days (' +
  workingDays + ' working days)');
lines.push('');
lines.push('*Totals*');
lines.push('• ' + totals.sent + ' sent of ' + totals.written + ' written · ' +
  totals.held + ' held by the quality gates');
lines.push('• ' + totals.replies + ' replies (' + pct(totals.replies, totals.sent) +
  '%) · ' + totals.interested + ' interested (' + pct(totals.interested, totals.sent) + '%)');
lines.push('• ' + totals.booked + ' booked' +
  (totals.value ? ' · £' + totals.value.toLocaleString('en-GB') : ''));
lines.push('• ' + totals.unsubscribes + ' unsubscribes (' +
  pct(totals.unsubscribes, totals.sent) + '%)');
lines.push('');
lines.push('*By student* — target ' + targetPerStudent + ' sent each');
students.forEach(function (s) {
  lines.push('• *' + s.student + '* ' + s.sent + ' sent · ' + s.replies + ' replies (' +
    s.reply_rate + '%) · ' + s.interested + ' interested · ' + s.booked + ' booked' +
    (s.sent < targetPerStudent * 0.8 ? '  ⚠ behind target' : ''));
});

if (Object.keys(holdReasons).length) {
  lines.push('');
  lines.push('*Held because* — this is what the quality gates cost, and it is meant to be ' +
    'argued with');
  Object.keys(holdReasons).sort(function (a, b) { return holdReasons[b] - holdReasons[a]; })
    .slice(0, 6).forEach(function (k) {
      lines.push('• ' + holdReasons[k] + ' × ' + k);
    });
}

lines.push('');
lines.push('Source: ' + log.source + (log.source === 'demo'
  ? ' — fabricated log, no account connected' : ''));

return [{
  json: {
    window_days: Number(cfg.report_window_days || 7),
    working_days: workingDays,
    target_per_student: targetPerStudent,
    totals: totals,
    by_student: students,
    hold_reasons: holdReasons,
    behind: behind.map(function (s) { return s.student; }),
    source: log.source,
    report: lines.join('\n'),
    _report_body: { text: lines.join('\n') }
  }
}];
