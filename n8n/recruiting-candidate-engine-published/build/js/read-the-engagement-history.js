// Shapes what Supabase returned into the one object the gate expects, so the gate does not
// care whether the history came from the database or from the demo stub.
//
// One request, not three: the HTTP node calls an RPC that returns
// { opt_outs, recent_touches, active_phones, enrolled_ats_ids } in a single round trip.
// Three separate REST calls would be three chances for a partial failure to produce a
// half-populated suppression list, which is worse than none.
const job = $('the job spec').first().json;
const raw = $input.first().json || {};
const body = Array.isArray(raw) ? (raw[0] || {}) : (raw.data || raw);

const arr = (v) => (Array.isArray(v) ? v : []);

// recent_touches arrives as [{phone_e164, last_attempt_at}]; the gate wants a lookup.
const last_touch = {};
for (const t of arr(body.recent_touches)) {
  const p = t && (t.phone_e164 || t.phone);
  if (p && t.last_attempt_at) last_touch[String(p)] = t.last_attempt_at;
}

const optOuts = arr(body.opt_outs).map((o) =>
  (typeof o === 'string' ? { phone_e164: o } : o)).filter((o) => o && o.phone_e164);

// A Supabase call that succeeded but returned nothing is a real answer (a brand new client
// genuinely has no opt-outs). A call that errored is not, and must not read as one.
const errored = !!(raw.error || raw.message || raw.code) && !body.opt_outs;

return [{
  json: {
    _source: errored ? 'supabase — ERRORED' : 'supabase',
    opt_outs: optOuts,
    last_touch: last_touch,
    active_phones: arr(body.active_phones).map(String),
    enrolled_ats_ids: arr(body.enrolled_ats_ids).map(String),
    _counts: {
      opt_outs: optOuts.length,
      recent_touches: Object.keys(last_touch).length,
      active_elsewhere: arr(body.active_phones).length,
      already_enrolled: arr(body.enrolled_ats_ids).length
    },
    _job: job.ats_job_id,
    _warning: errored
      ? 'The engagement history query failed (' + (raw.message || raw.error || raw.code)
        + '). The gate is running with an EMPTY suppression list — treat this run as '
        + 'preview and investigate before going live.'
      : ''
  }
}];
