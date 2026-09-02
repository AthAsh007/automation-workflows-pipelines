// The loop's done output carries every item that went back into it, so this is the
// only place with a whole-run view. Counts first, then the per-row detail.
const cfg = $('config').first().json;
const items = $input.all().map((i) => i.json);

const selection = (() => {
  try { return $('pick sendable rows').first().json._summary || {}; } catch (e) { return {}; }
})();

const sent = items.filter((i) => i._outcome === 'sent');
const tested = items.filter((i) => i._outcome === 'test_send');
const previewed = items.filter((i) => i._outcome === 'preview');
const missing = items.filter((i) => i._outcome === 'no_deliverables');

const lines = [];
lines.push('Acme outreach - ' + new Date().toISOString().slice(0, 16).replace('T', ' '));
lines.push(
  cfg.mode === 'live' ? 'MODE: LIVE - real recipients, and the sheet is written'
  : cfg.mode === 'test' ? 'MODE: TEST RUN - every email redirected to ' + cfg.test_email + ', sheet untouched'
  : 'MODE: PREVIEW - nothing sent, nothing written. Set TEST_EMAIL to actually send.');
lines.push('');
lines.push('Rows read: ' + (selection.rows_read ?? '?') +
           '  eligible: ' + (selection.eligible ?? '?') +
           '  picked: ' + (selection.selected ?? items.length) +
           (selection.cap ? '  (cap ' + selection.cap + ' - ' + selection.cap_reason + ')' : ''));
lines.push('Sent: ' + sent.length + '   Test-sent: ' + tested.length +
           '   Previewed: ' + previewed.length + '   No deliverables: ' + missing.length);

if (selection.skipped) {
  const skips = Object.entries(selection.skipped).filter(([, n]) => n > 0);
  if (skips.length) {
    lines.push('');
    lines.push('Not picked:');
    for (const [reason, n] of skips) lines.push('  ' + reason.replace(/_/g, ' ') + ': ' + n);
  }
}

if (sent.length) {
  lines.push('');
  lines.push('Emailed:');
  for (const s of sent) lines.push('  #' + s._row_id + ' ' + s._business + ' <' + s._email + '>');
}
if (tested.length) {
  lines.push('');
  lines.push('Test-sent to ' + cfg.test_email + ', meant for:');
  for (const s2 of tested) lines.push('  #' + s2._row_id + ' ' + s2._business + ' <' + s2._email + '>');
}
if (previewed.length) {
  lines.push('');
  lines.push('Would have emailed:');
  for (const s of previewed) lines.push('  #' + s._row_id + ' ' + s._business + ' <' + s._email + '>');
}
if (missing.length) {
  lines.push('');
  lines.push('Nothing in the repo for:');
  for (const s of missing) lines.push('  #' + s._row_id + ' ' + s._domain + ' - ' + s._skip_reason);
}

return [{
  json: {
    text: lines.join('\n'),
    mode: cfg.mode,
    counts: { sent: sent.length, test_send: tested.length, preview: previewed.length,
              no_deliverables: missing.length },
    selection
  }
}];
