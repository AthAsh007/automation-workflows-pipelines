// No database configured, so the attempts and the state changes this run decided were not
// written anywhere.
//
// In a demo that is exactly right and nothing is lost, because nothing was sent either.
// In a LIVE run it would be serious: messages would go out and the engine would forget it
// sent them, so the same person is texted again on the next pass. That cannot actually
// happen — `sending?` is gated on the same config and a run with no database never reaches
// a provider — but the warning says so plainly rather than leaving it to be inferred.
const cfg = $('config').first().json;
const j = $input.first().json || {};

const attempts = j.attempts || [];
const updates = j.enrollment_updates || [];

return [{
  json: {
    _outcome: 'not persisted — no database configured',
    _why: cfg.supabase_enabled
      ? 'DRY_RUN_DB is true: reads happen, writes do not.'
      : 'SUPABASE_URL and SUPABASE_SERVICE_KEY are blank in the config node.',

    would_have_written: {
      contact_attempts: attempts.length,
      enrollment_updates: updates.length,
      opt_outs: (j.opt_outs || []).length
    },

    // The whole decision, readable. This is the node to open on a screen-share to show
    // what the state machine did without a database behind it.
    attempts: attempts.map((a) => ({
      channel: a.channel, step: a.step, status: a.status,
      body: a.body, idempotency_key: a.idempotency_key
    })),
    state_changes: j.explanations || [],
    counts: j.counts || {},
    deferred: j.deferred || 0,

    _next_step: 'Fill in SUPABASE_URL and SUPABASE_SERVICE_KEY to persist. Until then the '
      + 'runner is a read-only simulation of itself: it decides correctly and forgets.'
  }
}];
