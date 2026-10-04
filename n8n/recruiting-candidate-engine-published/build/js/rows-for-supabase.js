// Builds the three upsert payloads the launch writes, in the order the foreign keys need:
// job order, then candidates, then enrollments.
//
// Every payload is an ARRAY sent in ONE request. Twenty-five candidates is one round trip
// with `Prefer: resolution=merge-duplicates`, not twenty-five — which matters less for 25
// than it does for the nightly 20,000-row candidate sync that uses this same shape.
const cfg = $('config').first().json;
const job = $('the job spec').first().json;
const rows = $input.all().map((i) => i.json).filter((r) => r && r._has_enrollments);

const first = rows[0] || {};
const summary = first._summary || {};
const held = first._held || [];

const job_order = {
  client_id: cfg.client_id || null,
  ats_job_id: job.ats_job_id,
  title: job.title,
  description: job.description,
  required_skills: job.required_skills,
  nice_to_have: job.nice_to_have,
  city: job.city,
  state: job.state,
  pay_rate: job.pay_rate,
  shift: job.shift,
  employment_type: job.employment_type,
  recruiter_name: job.recruiter_name,
  recruiter_email: job.recruiter_email,
  status: 'open',
  raw: job.raw
};

const campaign = {
  client_id: cfg.client_id || null,
  name: job.campaign_name,
  // The ladder is COPIED onto the campaign, not referenced. Editing SEQUENCE in config
  // next week must not change the behaviour of a campaign already half way through.
  sequence: cfg.sequence,
  qualification: cfg.qualify,
  status: 'active',
  idempotency_key: job.idempotency_key
};

const candidates = rows.map((c) => ({
  client_id: cfg.client_id || null,
  ats_candidate_id: c.ats_candidate_id,
  first_name: c.first_name,
  last_name: c.last_name,
  email: c.email || null,
  phone_e164: c.phone_e164,
  title: c.title,
  skills: c.skills,
  city: c.city,
  state: c.state,
  timezone: c.timezone || cfg.default_timezone,
  ats_status: c.ats_status,
  last_ats_sync_at: new Date().toISOString()
}));

// The enrollment rows cannot be built yet — campaign_id and candidate_id are uuids Supabase
// has not minted. They are carried as natural keys and resolved by the next node from what
// the two upserts returned. Doing it this way rather than with 25 lookup calls is the
// difference between a launch that takes two seconds and one that takes ninety.
const enrollments = rows.map((c) => ({
  client_id: cfg.client_id || null,
  _ats_candidate_id: c.ats_candidate_id,
  _campaign_key: job.idempotency_key,
  _ats_job_id: job.ats_job_id,
  status: 'pending',
  match_score: c.match_score,
  match_reasons: c.match_reasons,
  step: 0,
  attempts_made: 0,
  next_attempt_at: c.next_attempt_at
}));

return [{
  json: {
    _write: cfg.supabase_enabled && !cfg.dry_run_db,
    job_order: job_order,
    campaign: campaign,
    candidates: candidates,
    enrollments: enrollments,
    held: held.map((h) => ({
      ats_candidate_id: h.ats_candidate_id,
      name: h.full_name,
      phone: h.phone_e164,
      match_score: h.match_score,
      hold_reason: h.hold_reason
    })),
    summary: summary
  }
}];
