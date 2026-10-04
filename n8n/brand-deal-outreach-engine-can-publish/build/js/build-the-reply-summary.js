// The hourly reply summary. Short, because it fires every hour and a long one stops being
// read by Tuesday.
const cfg = $('config').first().json;
const items = $input.all().map(function (i) { return i.json; });

const quiet = items.filter(function (j) { return j._has_replies === false; })[0];
const replies = items.filter(function (j) { return j._has_replies !== false && j.reply_id; });

const counts = (replies[0] && replies[0]._counts) || {};
const handovers = replies.filter(function (r) { return r.route === 'handover'; });
const unclear = replies.filter(function (r) { return r.reply_class === 'unclear'; });
const suppressions = (replies[0] && replies[0]._suppression_adds) || [];
const logGap = replies.filter(function (r) { return r.log_gap === true; }).length > 0;
const logReason = (replies.filter(function (r) { return r.log_reason; })[0] || {}).log_reason;

const lines = [];
if (quiet) {
  lines.push('*Replies* — ' + quiet.headline);
} else {
  lines.push('*Replies* — ' + replies.length + ' in this window');
  lines.push(Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; })
    .map(function (k) { return counts[k] + ' ' + k; }).join(' · '));
  if (handovers.length) {
    lines.push(':bell: ' + handovers.length + ' need a person now' +
      (unclear.length ? ' (' + unclear.length + ' the classifier could not place)' : ''));
  }
  if (suppressions.length) {
    lines.push(suppressions.length + ' added to suppression');
  }
  if (logGap) lines.push(':rotating_light: log gap — ' + logReason);
}

return [{
  json: {
    mode: cfg.mode,
    source: quiet ? quiet.source : (replies[0] && replies[0].source),
    replies: replies.length,
    counts: counts,
    handovers: handovers.map(function (r) {
      return { student: r.student, brand: r.brand, contact: r.from_name, from: r.from,
        klass: r.reply_class, subject: r.subject,
        excerpt: String(r.text || '').slice(0, 240), next_step: r.next_step };
    }),
    suppressions: suppressions,
    log_gap: logGap,
    log_reason: logReason || '',
    summary: lines.join('\n'),
    _has_handovers: handovers.length > 0,
    _alert_body: { text: lines.join('\n') }
  }
}];
