// An opt-out arrived and there is no database to record it in.
//
// This is the one STOP node in the engine that is genuinely uncomfortable, and it is
// written that way on purpose. Every other unconfigured integration degrades harmlessly —
// a missing Twilio key means nothing sends. A missing opt-out record means the request was
// received and forgotten, which is the failure that gets a staffing agency a TCPA letter.
//
// It cannot bite in practice: with no database there is no queue, so nothing was scheduled
// to send to them in the first place. But the moment a database exists, this branch stops
// being reachable, and until then the node says out loud what was not stored.
const cfg = $('config').first().json;
const j = $input.first().json || {};

return [{
  json: {
    _outcome: 'OPT-OUT NOT PERSISTED — no database configured',
    _severity: 'would be serious in production',
    phone_e164: j.phone_e164,
    reason: j.reason,
    matched_text: j.matched_text,

    would_have_called: 'stop_all_outreach(' + (cfg.client_id || 'null') + ', '
      + j.phone_e164 + ')',
    which_would: [
      'insert the number into opt_outs, keyed on the phone so it covers every ATS record '
        + 'that person has',
      'set next_attempt_at = null on every enrollment for that number, in every campaign',
      'both in one transaction, so there is no window where the opt-out is recorded but a '
        + 'text is still queued'
    ],

    _safe_because: 'With no database there is no queue, so nothing was scheduled to send to '
      + 'this number and nothing will. The gap is real but it is not currently reachable.',
    _next_step: 'Fill in SUPABASE_URL and SUPABASE_SERVICE_KEY. This branch is unreachable '
      + 'from that point on.'
  }
}];
