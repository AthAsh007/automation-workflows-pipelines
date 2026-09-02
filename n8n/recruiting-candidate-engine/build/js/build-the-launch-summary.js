// The Slack message. Written so a recruiting manager who knows nothing about n8n can read
// it in five seconds and tell whether the morning went well.
const cfg = $('config').first().json;
const p = $('rows for supabase').first().json;
const s = p.summary || {};
const held = p.held || [];

const byReason = Object.entries(s.held_by_reason || {})
  .sort((a, b) => b[1] - a[1])
  .map(([reason, n]) => '• ' + n + ' — ' + reason);

const enrolled = (p.candidates || []).length;
const top = (p.enrollments || []).slice(0, 3).map((e, i) => {
  const c = (p.candidates || [])[i] || {};
  return '  ' + (i + 1) + '. ' + ((c.first_name + ' ' + c.last_name).trim() || c.ats_candidate_id)
    + ' (' + e.match_score + ') — ' + (e.match_reasons || []).slice(0, 2).join(', ');
});

const modeLabel = cfg.mode === 'live' ? '' : '  [' + cfg.mode.toUpperCase() + ']';

const lines = [
  '*Candidate engine — campaign launched*' + modeLabel,
  (p.campaign && p.campaign.name) || 'campaign',
  '',
  'Pool scored: ' + (s.pool || 0) + '   Enrolled: ' + enrolled + '   Held: ' + held.length,
  ''
];
if (top.length) lines.push('Top matches:', ...top, '');
if (byReason.length) lines.push('Held back:', ...byReason, '');
lines.push('First touches are scheduled. The outreach runner sends them on its next pass.');

// Anything a human needs to act on, rather than just read.
const attention = [];
if (!cfg.supabase_enabled) attention.push('Supabase not configured — nothing was persisted.');
if (!cfg.twilio_enabled) attention.push('Twilio not configured — the scheduled touches cannot send.');
if (!cfg.ats_enabled) attention.push('ATS not connected — this ran against the sample pool.');
const noPhone = held.filter((h) => String(h.hold_reason).startsWith('no usable mobile')).length;
if (noPhone > 2) {
  attention.push(noPhone + ' candidates had no usable mobile — check the phone field mapping.');
}
if (attention.length) lines.push('', '*Needs attention*', ...attention.map((a) => '• ' + a));

return [{
  json: {
    _outcome: 'campaign launched',
    enrolled: enrolled,
    held: held.length,
    pool: s.pool || 0,
    needs_attention: attention,
    slack_text: lines.join('\n'),
    // Slack's incoming-webhook shape. One field, so swapping Slack for Teams is one node.
    slack_payload: { text: lines.join('\n') }
  }
}];
