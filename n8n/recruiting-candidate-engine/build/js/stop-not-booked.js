// Qualified, but nothing was put in a calendar. Three reasons, and the node says which.
//
// It is deliberately NOT an error branch. A qualified candidate with no booking is still a
// qualified candidate the recruiter must hear about within minutes, so this path carries
// on to the notification and the ATS write-back exactly like the booked path does.
const cfg = $('config').first().json;
const ev = $input.first().json || {};
const b = ev.booking || {};

const why = !cfg.calendar_enabled
  ? 'CALENDAR_PROVIDER is set to "none".'
  : (ev._recruiter_missing
    ? 'The job order carried no recruiter email, so there is no calendar to book into. '
      + 'Check ATS_FIELDS.job.recruiter_mail for this vendor.'
    : (!cfg.writeback_enabled
      ? 'This run is ' + cfg.mode + '. Only a live run creates a real calendar event.'
      : 'The calendar node did not return an event.'));

return [{
  json: Object.assign({}, ev, {
    _outcome: 'qualified — not booked',
    why: why,
    proposed_slot: b.starts_at
      ? { starts_at: b.starts_at, human_time: b.human_time, recruiter: b.recruiter_email }
      : null,
    _next_step: 'The recruiter is still notified and the ATS note is still written. The '
      + 'slot above is the one the engine would have taken, so booking it by hand takes a '
      + 'few seconds rather than a conversation.'
  })
}];
