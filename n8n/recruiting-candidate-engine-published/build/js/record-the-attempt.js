// Turns send results into two things: an append-only attempt row for every touch, and the
// enrollment updates that move the state machine forward.
//
// The retry policy lives here, in one place, and it is three rules:
//
//   sent       -> advance a rung, schedule the next touch at the ladder's delay
//   transient  -> stay on this rung, come back with exponential backoff and jitter
//   permanent  -> stop. The number is wrong or the carrier will never deliver, and
//                 retrying it costs money and manufactures a fake "attempted 6 times"
//
// Jitter matters more than it looks. Without it, 300 enrollments that all failed on a
// Twilio blip retry in the same second, hit the same rate limit, and fail together again.
const cfg = $('config').first().json;
const results = $input.all().map((i) => i.json).filter((r) => r && r.enrollment_id);

// Deferrals were decided upstream and still have to be written, or the row stays due and
// the runner reconsiders it every fifteen minutes forever.
const decided = $('decide the next touch').all().map((i) => i.json);
const deferrals = (decided[0] && decided[0]._deferred) || [];

const seq = cfg.sequence || [];
const now = Date.now();

// 5min, 20min, 80min, 5h20, capped at 6h, plus up to 25% jitter.
function backoff(attempt) {
  const base = 5 * 60 * 1000 * Math.pow(4, Math.max(0, attempt));
  const capped = Math.min(base, 6 * 3600 * 1000);
  return new Date(now + capped * (1 + Math.random() * 0.25)).toISOString();
}

const attempts = [];
const enrollmentUpdates = [];
const optOuts = [];
const counts = { sent: 0, transient: 0, permanent: 0, carrier_opt_out: 0 };

for (const r of results) {
  const retry_count = Number(r.attempts_made) || 0;

  attempts.push({
    client_id: r.client_id || cfg.client_id || null,
    enrollment_id: r.enrollment_id,
    candidate_id: r.candidate_id,
    channel: r.channel,
    step: r.step,
    direction: 'outbound',
    provider: r.provider,
    provider_sid: r.provider_sid,
    status: r.outcome === 'sent'
      ? (r.channel === 'voice' ? 'queued' : 'sent')
      : (r.outcome === 'permanent' ? 'failed' : 'failed'),
    error_code: r.error_code,
    error_message: r.error_message,
    body: r.channel === 'sms' ? r.body : (r.agent_note || 'AI voice screening call'),
    retry_count: retry_count,
    sent_at: new Date(now).toISOString(),
    // Computed before the send, in `decide the next touch`. A unique-violation on this
    // insert is not an error — it means another execution already sent this exact touch.
    idempotency_key: r.idempotency_key
  });

  // Twilio's own suppression list answered. Nobody told our webhook, so this is the only
  // moment we find out, and it has to become a real opt-out rather than a failed send.
  if (r._carrier_opt_out) {
    counts.carrier_opt_out++;
    optOuts.push({
      client_id: r.client_id || cfg.client_id || null,
      phone_e164: r.real_to,
      channel: 'all',
      reason: 'carrier-level STOP (Twilio 21610)',
      source: 'twilio_21610'
    });
    enrollmentUpdates.push({
      id: r.enrollment_id, status: 'opted_out',
      next_attempt_at: null, lease_token: null, lease_expires_at: null,
      last_attempt_at: new Date(now).toISOString(),
      _why: 'carrier opt-out'
    });
    continue;
  }

  if (r.outcome === 'sent') {
    counts.sent++;
    const nextIndex = (Number(r.step_index) || 0) + 1;
    const nextRung = seq[nextIndex];
    enrollmentUpdates.push({
      id: r.enrollment_id,
      status: 'active',
      step: nextIndex,
      attempts_made: retry_count + 1,
      last_attempt_at: new Date(now).toISOString(),
      // No next rung means the ladder is done. A null due time takes the row out of the
      // queue without needing a separate "finished" flag anywhere.
      next_attempt_at: nextRung
        ? new Date(now + (Number(nextRung.delay_hours) || 0) * 3600 * 1000).toISOString()
        : null,
      lease_token: null,
      lease_expires_at: null,
      _why: nextRung ? ('sent step ' + r.step + ', next in ' + nextRung.delay_hours + 'h')
                     : ('sent step ' + r.step + ', ladder complete')
    });
    continue;
  }

  if (r.outcome === 'permanent') {
    counts.permanent++;
    enrollmentUpdates.push({
      id: r.enrollment_id,
      status: 'undeliverable',
      attempts_made: retry_count + 1,
      last_attempt_at: new Date(now).toISOString(),
      next_attempt_at: null,
      lease_token: null,
      lease_expires_at: null,
      _why: 'permanent failure ' + r.error_code + ' — will never deliver'
    });
    continue;
  }

  // Transient. Same rung, later. After enough tries it stops being transient.
  counts.transient++;
  const MAX_RETRIES = 4;
  const exhausted = retry_count >= MAX_RETRIES;
  enrollmentUpdates.push({
    id: r.enrollment_id,
    status: exhausted ? 'undeliverable' : 'active',
    attempts_made: retry_count + 1,
    last_attempt_at: new Date(now).toISOString(),
    next_attempt_at: exhausted ? null : backoff(retry_count),
    lease_token: null,
    lease_expires_at: null,
    _why: exhausted
      ? ('gave up after ' + (retry_count + 1) + ' transient failures (' + r.error_code + ')')
      : ('transient ' + (r.error_code || 'error') + ', retry ' + (retry_count + 1)
         + ' of ' + MAX_RETRIES)
  });
}

// Quiet hours, weekends and the daily cap. Rescheduled, and the lease released so another
// runner can pick them up the moment they come due.
for (const d of deferrals) {
  enrollmentUpdates.push({
    id: d.enrollment_id,
    status: d.status || undefined,
    next_attempt_at: d.next_attempt_at,
    lease_token: null,
    lease_expires_at: null,
    _why: d.reason
  });
}

return [{
  json: {
    _write: cfg.supabase_enabled && !cfg.dry_run_db,
    attempts: attempts,
    enrollment_updates: enrollmentUpdates.map((u) => {
      const clean = {};
      for (const k of Object.keys(u)) {
        if (k.charAt(0) !== '_' && u[k] !== undefined) clean[k] = u[k];
      }
      return clean;
    }),
    opt_outs: optOuts,
    explanations: enrollmentUpdates.map((u) => ({ id: u.id, action: u._why })),
    counts: counts,
    deferred: deferrals.length
  }
}];
