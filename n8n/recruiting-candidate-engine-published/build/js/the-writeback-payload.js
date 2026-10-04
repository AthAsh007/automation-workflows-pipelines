// Everything that goes back into the client's ATS, and the notification that goes to the
// recruiter.
//
// The write-back is QUEUED to the ats_writebacks table before it is attempted. That is the
// difference between a Bullhorn outage delaying a note and losing it: the row exists with
// status 'pending', a retry sweep picks it up, and the idempotency key means a note is
// never written twice however many times it is retried.
//
// A recruiter who works in Bullhorn all day will not open a Supabase dashboard. If the
// outcome is not in the ATS, it did not happen.
const cfg = $('config').first().json;
const ev = $input.first().json || {};
const q = ev.qualification || {};
const b = ev.booking || {};

const today = new Date().toISOString().slice(0, 10);
const atsId = ev.ats_candidate_id || ev.candidate_ats_id || '';

// Stable per candidate, per outcome, per day. A retry writes the same row; a genuinely new
// outcome tomorrow writes a new one.
const key = (action) => ['wb', cfg.client_slug, atsId, action, q.outcome || 'none', today].join(':');

const answered = (q.must || []).concat(q.scored || [])
  .filter((x) => x.value !== null)
  .map((x) => '  - ' + x.label + ': ' + JSON.stringify(x.value) + (x.passed ? '' : '  (miss)'));

const note = [
  'AI screening — ' + String(q.outcome || 'unknown').replace('_', ' ').toUpperCase(),
  '',
  'Role: ' + (ev.job_title || 'unknown'),
  'Channel: ' + (ev.source === 'retell_call' ? 'AI voice call' : 'SMS'),
  'Score: ' + q.score + ' / ' + q.pass_mark + '  (' + q.questions_answered + ' of '
    + q.questions_total + ' questions answered)',
  'Verdict: ' + (q.reason || ''),
  '',
  'Answers:',
  ...(answered.length ? answered : ['  - none recorded']),
  ''
];

if (b.starts_at) {
  note.push('Interview booked: ' + b.human_time + ' with ' + b.recruiter_name, '');
}
if (ev.call_summary) note.push('Call summary:', ev.call_summary, '');
if (ev.recording_url) note.push('Recording: ' + ev.recording_url);
if (ev.transcript) {
  note.push('', 'Transcript is stored against the attempt in the operating database.');
}

// The status a candidate moves to. Deliberately conservative: the engine advances people
// through screening states and never touches Placed, Submitted, or anything a human owns.
const STATUS_MAP = {
  qualified: 'Qualified - Interview Scheduled',
  needs_review: 'Screened - Needs Review',
  not_qualified: 'Screened - Not a Fit',
  no_answer: null
};
const newStatus = STATUS_MAP[q.outcome] || null;

const writebacks = [{
  client_id: cfg.client_id || null,
  ats_candidate_id: atsId,
  action: 'add_note',
  payload: { action: 'AI Screening', comments: note.join('\n').slice(0, 8000) },
  status: 'pending',
  idempotency_key: key('add_note')
}];

if (newStatus) {
  writebacks.push({
    client_id: cfg.client_id || null,
    ats_candidate_id: atsId,
    action: 'update_status',
    payload: { status: newStatus },
    status: 'pending',
    idempotency_key: key('update_status')
  });
}

// ---------------------------------------------------------------- the recruiter's message
const lines = [
  q.outcome === 'qualified'
    ? '*Qualified candidate ready* — ' + (ev.job_title || 'your role')
    : '*Candidate needs a look* — ' + (ev.job_title || 'your role'),
  '',
  (ev.candidate_name || 'Candidate') + '  ·  ' + (ev.from_number || 'no number')
    + '  ·  score ' + q.score + '/' + q.pass_mark,
  q.reason || ''
];

if ((ev._highlights || []).length) lines.push('', 'Strengths: ' + ev._highlights.join(', '));
if ((ev._gaps || []).length) lines.push('Gaps: ' + ev._gaps.join(', '));
if (b.starts_at) lines.push('', 'Booked: ' + b.human_time);
else if (ev._recruiter_missing) {
  lines.push('', 'No recruiter calendar on this job order — this one needs booking by hand.');
}
if (ev.call_summary) lines.push('', '> ' + ev.call_summary.slice(0, 400));
if (ev.recording_url) lines.push('', 'Recording: ' + ev.recording_url);

return [{
  json: Object.assign({}, ev, {
    _write: cfg.writeback_enabled,
    _why_not: cfg.writeback_enabled ? ''
      : 'Only a live run writes into the client ATS or a real calendar. This run is '
        + cfg.mode + '.',
    writebacks: writebacks,
    ats_note_preview: note.join('\n'),
    new_ats_status: newStatus,
    slack_payload: { text: lines.filter((l) => l !== undefined).join('\n') },
    recruiter_email_subject: (q.outcome === 'qualified' ? 'Qualified: ' : 'Needs review: ')
      + (ev.candidate_name || 'candidate') + ' — ' + (ev.job_title || 'role'),
    recruiter_email_body: lines.join('\n').replace(/\*/g, '')
  })
}];
