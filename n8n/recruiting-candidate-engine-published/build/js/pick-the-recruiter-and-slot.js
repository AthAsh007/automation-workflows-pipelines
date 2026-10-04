// Chooses who the interview is with and when. Both answers are deterministic, because a
// booking that lands in the wrong recruiter's calendar is worse than no booking.
//
// The recruiter is the one on the JOB ORDER, not a round-robin. A candidate who was texted
// about Dana's forklift role and booked with someone else has to be re-explained to two
// people, and the client hears about it.
const cfg = $('config').first().json;
const ev = $input.first().json || {};

const recruiterEmail = String(ev.recruiter_email || '').toLowerCase();
const calendarId = (cfg.recruiter_calendars || {})[recruiterEmail] || recruiterEmail;

const tz = ev.candidate_timezone || cfg.default_timezone;
const minutes = Number(cfg.interview_minutes) || 30;
const leadHours = Number(cfg.booking_lead_hours) || 18;
const windowDays = Number(cfg.booking_window_days) || 5;
const hours = (cfg.booking_hours || [9, 10, 11, 13, 14, 15, 16]).map(Number);

function partsIn(date, zone) {
  try {
    const f = new Intl.DateTimeFormat('en-US', {
      timeZone: zone, hour: 'numeric', hour12: false, weekday: 'short'
    });
    const p = f.formatToParts(date);
    return {
      hour: Number((p.find((x) => x.type === 'hour') || {}).value) % 24,
      weekday: (p.find((x) => x.type === 'weekday') || {}).value
    };
  } catch (e) {
    return { hour: date.getUTCHours(), weekday: 'Mon' };
  }
}

// Walk forward hour by hour from the lead time. The first slot that is a weekday, inside
// the recruiter's booking hours, wins. Proposing rather than booking blind is deliberate:
// this is a candidate-side hold, and the free/busy check happens in the calendar node,
// which will refuse a genuine clash.
const earliest = new Date(Date.now() + leadHours * 3600 * 1000);
let slot = null;
for (let h = 0; h < windowDays * 24; h++) {
  const t = new Date(earliest.getTime() + h * 3600 * 1000);
  const p = partsIn(t, tz);
  if (p.weekday === 'Sat' || p.weekday === 'Sun') continue;
  if (hours.indexOf(p.hour) === -1) continue;
  t.setUTCMinutes(0, 0, 0);
  slot = t;
  break;
}

if (!slot) slot = new Date(earliest.getTime() + 24 * 3600 * 1000);

const ends = new Date(slot.getTime() + minutes * 60 * 1000);
const qual = ev.qualification || {};

const when = (() => {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: tz, weekday: 'long', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit'
    }).format(slot) + ' (' + tz.split('/').pop().replace('_', ' ') + ')';
  } catch (e) { return slot.toISOString(); }
})();

return [{
  json: Object.assign({}, ev, {
    booking: {
      recruiter_email: recruiterEmail,
      recruiter_name: ev.recruiter_name || 'the recruiting team',
      calendar_id: calendarId,
      calendar_provider: cfg.calendar_provider,
      starts_at: slot.toISOString(),
      ends_at: ends.toISOString(),
      timezone: tz,
      human_time: when,
      summary: 'Interview: ' + (ev.candidate_name || 'candidate') + ' — '
        + (ev.job_title || 'role'),
      description: [
        (ev.candidate_name || 'Candidate') + ' — ' + (ev.job_title || 'role'),
        '',
        'Qualified by AI screening on ' + new Date().toISOString().slice(0, 10) + '.',
        'Score ' + qual.score + '/' + qual.pass_mark + '. ' + (qual.reason || ''),
        '',
        'Strengths: ' + ((ev._highlights || []).join(', ') || 'none recorded'),
        'Gaps: ' + ((ev._gaps || []).join(', ') || 'none recorded'),
        '',
        'Phone: ' + (ev.from_number || 'unknown'),
        ev.call_summary ? ('\nCall summary:\n' + ev.call_summary) : '',
        ev.recording_url ? ('\nRecording: ' + ev.recording_url) : ''
      ].filter(Boolean).join('\n'),
      attendees: [recruiterEmail].filter(Boolean)
    },
    _recruiter_missing: !recruiterEmail,
    _booking_warning: !recruiterEmail
      ? 'The job order carried no recruiter email, so there is no calendar to book into. '
        + 'The candidate is still marked qualified and the recruiter notification still '
        + 'goes out — it just has to be booked by hand.'
      : ''
  })
}];
