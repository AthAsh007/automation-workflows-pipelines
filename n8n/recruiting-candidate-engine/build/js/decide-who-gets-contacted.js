// THE GATE. Nothing is enrolled that does not pass every check here, and every rejection
// is recorded with the reason next to the name rather than dropped.
//
// This node's $input is the engagement history (opt-outs and recent attempts, one item);
// the candidates come from the scored node. That way a Supabase outage produces an empty
// history and a run that stops, not a run that contacts everybody.
const cfg = $('config').first().json;
const job = $('the job spec').first().json;
const scored = $('score against the job order').all().map((i) => i.json)
  .filter((c) => c && c.ats_candidate_id);

const hist = $input.first().json || {};
const optOuts = new Set((hist.opt_outs || []).map((o) =>
  String(typeof o === 'string' ? o : o.phone_e164 || '')).filter(Boolean));
// phone -> ISO timestamp of the last outbound touch, from any campaign
const lastTouch = hist.last_touch || {};
// phones already live in another campaign
const activeElsewhere = new Set((hist.active_phones || []).map(String));
// ats ids already enrolled in THIS campaign (a re-delivered webhook, or a second run)
const alreadyEnrolled = new Set((hist.enrolled_ats_ids || []).map(String));

const now = Date.now();
const minGapMs = (Number(cfg.min_hours_between_touches) || 0) * 3600 * 1000;

const held = [];
const eligible = [];

for (const c of scored) {
  const hold = (reason) => { held.push(Object.assign({}, c, { hold_reason: reason })); };

  // Order matters. The cheapest and most legally consequential checks come first, and
  // opt-out comes before everything including the score — an opted-out number is never
  // reconsidered because the job is a good fit.
  if (!c.phone_e164) { hold('no usable mobile number' + (c._phone_note ? ' — ' + c._phone_note : '')); continue; }
  if (optOuts.has(c.phone_e164)) { hold('opted out — never contact'); continue; }
  if (alreadyEnrolled.has(String(c.ats_candidate_id))) { hold('already enrolled in this campaign'); continue; }
  if (activeElsewhere.has(c.phone_e164)) { hold('already being worked by another live campaign'); continue; }

  const last = lastTouch[c.phone_e164];
  if (last && minGapMs > 0) {
    const age = now - new Date(last).getTime();
    if (Number.isFinite(age) && age < minGapMs) {
      hold('contacted ' + Math.round(age / 3600000) + 'h ago, inside the '
        + cfg.min_hours_between_touches + 'h cooldown');
      continue;
    }
  }

  if (!c._above_floor) {
    hold('match score ' + c.match_score + ' below the floor of ' + cfg.min_match_score);
    continue;
  }

  eligible.push(c);
}

// Already sorted by score. Take the top N and hold the rest with a reason that says they
// are not rejected, only queued — a second push for the same job picks them up.
const topN = Number(cfg.enroll_top_n) || 25;
const enrolled = eligible.slice(0, topN);
for (const c of eligible.slice(topN)) {
  held.push(Object.assign({}, c, {
    hold_reason: 'eligible, outside the top ' + topN + ' this run — rank ' + c._rank
  }));
}

const firstStep = (cfg.sequence || [])[0] || { step: 1, channel: 'sms', delay_hours: 0 };

const summary = {
  _stage: 'gate',
  job_title: job.title,
  ats_job_id: job.ats_job_id,
  pool: scored.length,
  eligible: eligible.length,
  enrolled: enrolled.length,
  held: held.length,
  held_by_reason: held.reduce((acc, h) => {
    const k = String(h.hold_reason).replace(/\d+/g, 'N').split(' — ')[0];
    acc[k] = (acc[k] || 0) + 1; return acc;
  }, {}),
  history_source: hist._source || 'unknown'
};

if (!enrolled.length) {
  return [{ json: Object.assign({ _has_enrollments: false, held: held }, summary) }];
}

return enrolled.map((c) => ({
  json: Object.assign({}, c, {
    _has_enrollments: true,
    _summary: summary,
    _held: held,
    // The first touch is scheduled, not sent. Workflow 2 owns every send, which is what
    // keeps quiet hours and the daily cap in one place instead of two.
    step: 0,
    attempts_made: 0,
    status: 'pending',
    next_attempt_at: new Date(now + (Number(firstStep.delay_hours) || 0) * 3600000).toISOString(),
    campaign_idempotency_key: job.idempotency_key,
    // Per-enrollment key, so re-running this workflow for the same job on the same day
    // updates rather than duplicates.
    enrollment_key: ['enr', cfg.client_slug, job.ats_job_id, c.ats_candidate_id].join(':')
  })
}));
