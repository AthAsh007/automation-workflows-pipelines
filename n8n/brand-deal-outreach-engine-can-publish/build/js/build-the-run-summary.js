// One message for the team, and a per-pitch record for whoever has to argue with it.
//
// The numbers that matter here are not "how many did we send". They are: how many were
// held and why, how many inboxes are healthy, and whether the log matched the sends. All
// three are the difference between 10,000 pitches a month and 10,000 pitches a month that
// keep landing.
const cfg = $('config').first().json;
const items = $input.all().map(function (i) { return i.json; });

const quiet = items.filter(function (j) { return j._has_work === false; })[0];
const pitches = items.filter(function (j) { return j._has_work !== false && j.pitch_id; });

const totals = (pitches[0] && pitches[0]._totals) || {};
const sent = pitches.filter(function (p) { return p.sent === true; });
const failed = pitches.filter(function (p) { return p.send_state === 'failed'; });
const held = pitches.filter(function (p) { return p.send_state === 'held'; });
const preview = pitches.filter(function (p) { return p.send_state === 'preview'; });

// Why things were held, grouped. A list of 180 reasons is not readable; six counts are.
const holdCounts = {};
held.forEach(function (p) {
  (p.audit_holds && p.audit_holds.length ? p.audit_holds : [p.send_reason || 'held'])
    .forEach(function (h) {
      // Group on the shape of the reason, not its detail, so "template tell: X" and
      // "template tell: Y" land in one bucket.
      const key = String(h).split(':')[0].split('—')[0].trim();
      holdCounts[key] = (holdCounts[key] || 0) + 1;
    });
});

const inboxReport = (pitches[0] && pitches[0].inbox_report) || [];
const blockedInboxes = inboxReport.filter(function (i) { return i.blocked; });

const logGap = pitches.filter(function (p) { return p.log_gap === true; }).length > 0;
const logReason = (pitches.filter(function (p) { return p.log_reason; })[0] || {}).log_reason;

const mode = cfg.forced_preview ? 'PREVIEW (forced — demo roster)'
  : cfg.preview_only ? 'PREVIEW — nothing sent'
  : cfg.test_send ? 'TEST — sent, redirected to ' + cfg.test_email
  : 'LIVE';

const lines = [];
lines.push('*Brand deal outreach* — ' + mode);
if (quiet) {
  lines.push(quiet.headline);
} else {
  lines.push(pitches.length + ' pitches written · ' + sent.length + ' sent · ' +
    held.length + ' held · ' + preview.length + ' preview');
  if (failed.length) lines.push(':warning: ' + failed.length + ' rejected by the campaign');
  lines.push('inboxes: ' + (totals.inboxes_healthy || 0) + ' of ' +
    (totals.inboxes_total || 0) + ' healthy');
  if (blockedInboxes.length) {
    lines.push('  ' + blockedInboxes.map(function (i) {
      return i.inbox + ' — ' + i.blocked;
    }).join('\n  '));
  }
  if (Object.keys(holdCounts).length) {
    lines.push('held because:');
    Object.keys(holdCounts).sort(function (a, b) {
      return holdCounts[b] - holdCounts[a];
    }).forEach(function (k) { lines.push('  ' + holdCounts[k] + ' × ' + k); });
  }
  if (logGap) lines.push(':rotating_light: log gap — ' + logReason);
}

// Per student, because that is how the money works: $50 per student per month.
const byStudent = {};
pitches.forEach(function (p) {
  const k = p.student || 'unknown';
  if (!byStudent[k]) byStudent[k] = { student: k, written: 0, sent: 0, held: 0 };
  byStudent[k].written++;
  if (p.sent) byStudent[k].sent++;
  if (p.send_state === 'held') byStudent[k].held++;
});

return [{
  json: {
    mode: cfg.mode,
    source: quiet ? quiet.source : (pitches[0] && pitches[0]._roster
      && pitches[0]._roster.source),
    written: pitches.length,
    sent: sent.length,
    held: held.length,
    preview: preview.length,
    failed: failed.length,
    hold_reasons: holdCounts,
    inboxes_healthy: totals.inboxes_healthy || 0,
    inboxes_total: totals.inboxes_total || 0,
    blocked_inboxes: blockedInboxes,
    log_gap: logGap,
    log_reason: logReason || '',
    by_student: Object.keys(byStudent).map(function (k) { return byStudent[k]; }),
    pitches: pitches.map(function (p) {
      return { pitch_id: p.pitch_id, student: p.student, brand: p.brand,
        contact: p.contact, email: p.email, inbox: p.inbox, subject: p.subject,
        words: p.word_count, facts: p.fact_count, state: p.send_state,
        reason: p.send_reason || '' };
    }),
    summary: lines.join('\n'),
    _alert_body: { text: lines.join('\n') }
  }
}];
