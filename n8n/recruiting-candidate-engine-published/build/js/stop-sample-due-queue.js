// Supabase is not connected, so there is no queue to read. In demo mode the runner
// substitutes a handful of due rows shaped exactly like `v_due_attempts` returns them —
// which is what lets the state machine, the quiet-hours logic and the message rendering all
// be watched working before a database exists.
//
// The four rows are deliberately at four different rungs of the ladder and in three
// different timezones, because that is what makes the interesting behaviour visible.
const cfg = $('config').first().json;

if (!cfg.demo_mode) {
  return [{
    json: {
      _no_due_rows: true,
      _outcome: 'Supabase not configured',
      _next_step: 'Fill in SUPABASE_URL and SUPABASE_SERVICE_KEY in the config node. Until '
        + 'then the runner has no queue to read and sends nothing, which is the correct '
        + 'behaviour rather than an error.'
    }
  }];
}

const seq = cfg.sequence;
const base = {
  client_id: '00000000-0000-0000-0000-000000000001',
  campaign_id: '00000000-0000-0000-0000-0000000000c1',
  job_order_id: '00000000-0000-0000-0000-0000000000j1',
  client_slug: cfg.client_slug,
  quiet_hours_start: cfg.quiet_hours_start,
  quiet_hours_end: cfg.quiet_hours_end,
  daily_send_cap: cfg.daily_send_cap,
  job_title: 'Forklift Operator',
  job_city: 'Calder City',
  job_state: 'MW',
  pay_rate: 22.5,
  shift: '1st shift, Mon-Fri',
  recruiter_name: 'Dana Reyes',
  recruiter_email: 'dana.reyes@example.com',
  sequence: seq,
  qualification: cfg.qualify,
  status: 'active'
};

const ago = (h) => new Date(Date.now() - h * 3600 * 1000).toISOString();

return [
  // Step 0: never contacted. Gets touch 1, an SMS.
  { json: Object.assign({}, base, {
      enrollment_id: 'e0000000-0000-0000-0000-000000000001',
      candidate_id: 'c0000000-0000-0000-0000-000000000001',
      first_name: 'Marcus', last_name: 'Ellison', phone_e164: '+16145550142',
      email: 'marcus.ellison@example.com', candidate_timezone: 'America/New_York',
      step: 0, attempts_made: 0, match_score: 74, next_attempt_at: ago(1) }) },

  // Step 1: had one text, no reply. Gets the follow-up.
  { json: Object.assign({}, base, {
      enrollment_id: 'e0000000-0000-0000-0000-000000000002',
      candidate_id: 'c0000000-0000-0000-0000-000000000002',
      first_name: 'Danielle', last_name: 'Okafor', phone_e164: '+16145550177',
      email: 'd.okafor@example.com', candidate_timezone: 'America/New_York',
      step: 1, attempts_made: 1, match_score: 68, next_attempt_at: ago(2) }) },

  // Step 2: two texts, silence. This one escalates to a Retell voice call.
  { json: Object.assign({}, base, {
      enrollment_id: 'e0000000-0000-0000-0000-000000000003',
      candidate_id: 'c0000000-0000-0000-0000-000000000003',
      first_name: 'Andre', last_name: 'Whitlock', phone_e164: '+16145550199',
      email: 'a.whitlock@example.com', candidate_timezone: 'America/New_York',
      step: 2, attempts_made: 2, match_score: 61, next_attempt_at: ago(3) }) },

  // In Los Angeles. At 08:30 Eastern it is 05:30 for them — deferred, not sent.
  { json: Object.assign({}, base, {
      enrollment_id: 'e0000000-0000-0000-0000-000000000004',
      candidate_id: 'c0000000-0000-0000-0000-000000000004',
      first_name: 'Renata', last_name: 'Voss', phone_e164: '+13135550164',
      email: 'r.voss@example.com', candidate_timezone: 'America/Los_Angeles',
      step: 0, attempts_made: 0, match_score: 55, next_attempt_at: ago(1) }) },

  // Finished the whole ladder and never replied. Becomes `exhausted`, which is an outcome,
  // not a failure.
  { json: Object.assign({}, base, {
      enrollment_id: 'e0000000-0000-0000-0000-000000000005',
      candidate_id: 'c0000000-0000-0000-0000-000000000005',
      first_name: 'Owen', last_name: 'Castellanos', phone_e164: '+16145550133',
      email: 'o.cast@example.com', candidate_timezone: 'America/New_York',
      step: 4, attempts_made: 4, match_score: 44, next_attempt_at: ago(24) }) }
];
