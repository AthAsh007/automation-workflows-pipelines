// The state machine. For every enrollment the database said was due, this decides which
// rung of the ladder is next, whether it is allowed to happen right now, and what exactly
// would be sent.
//
// Three properties this node is responsible for:
//
//   Quiet hours are evaluated in the CANDIDATE's timezone. A 9am campaign in New York is a
//   6am campaign in Los Angeles, and TCPA does not care which office set the schedule.
//
//   Nothing is sent from here. This node produces intent only; the send happens two nodes
//   later, behind the mode gate. That separation is what lets the whole runner be watched
//   in preview against real due rows.
//
//   The idempotency key is computed BEFORE the send, from facts that do not change on a
//   retry. If n8n dies between Twilio accepting the message and the attempt row being
//   written, the next run recomputes the same key, the insert conflicts, and the candidate
//   is not texted twice.
const cfg = $('config').first().json;
const now = new Date();

const rows = $input.all().map((i) => i.json)
  .filter((r) => r && r.enrollment_id && !r._no_due_rows);

// Anything outside plain ASCII flips a whole SMS to UCS-2. Written as a character-code
// scan rather than a regex so there is no escape sequence to get mangled in transit.
function hasNonAscii(s) {
  const str = String(s || '');
  for (let i = 0; i < str.length; i++) if (str.charCodeAt(i) > 127) return true;
  return false;
}

// Local wall-clock hour and weekday in an arbitrary IANA zone, without a date library.
// Intl is present in both the n8n Code sandbox and plain node, which keeps simulate.js
// honest about what will actually happen in production.
function localParts(iso, tz) {
  const d = iso ? new Date(iso) : new Date();
  try {
    const f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hour: 'numeric', hour12: false, weekday: 'short'
    });
    const parts = f.formatToParts(d);
    const hour = Number((parts.find((p) => p.type === 'hour') || {}).value);
    const weekday = (parts.find((p) => p.type === 'weekday') || {}).value;
    return { hour: Number.isFinite(hour) ? hour % 24 : d.getUTCHours(), weekday: weekday };
  } catch (e) {
    // An unknown timezone string must not take the run down. Fall back and flag it.
    return { hour: d.getUTCHours(), weekday: 'Mon', _tz_error: String(tz) };
  }
}

function isQuiet(hour) {
  const s = Number(cfg.quiet_hours_start);
  const e = Number(cfg.quiet_hours_end);
  return s > e ? (hour >= s || hour < e)    // 21:00 -> 08:00 wraps midnight
               : (hour >= s && hour < e);
}

// The next moment this candidate may legally be contacted.
function nextAllowed(tz) {
  for (let h = 1; h <= 24 * 8; h++) {
    const t = new Date(now.getTime() + h * 3600 * 1000);
    const p = localParts(t.toISOString(), tz);
    const weekend = p.weekday === 'Sat' || p.weekday === 'Sun';
    if (!isQuiet(p.hour) && (cfg.send_on_weekends || !weekend)) {
      // Land on the hour, so a deferred batch does not fire at 08:03:17 like a robot.
      t.setUTCMinutes(0, 0, 0);
      return t.toISOString();
    }
  }
  return new Date(now.getTime() + 12 * 3600 * 1000).toISOString();
}

// Deterministic key. The same enrollment, channel and step give the same key forever.
// FNV-1a rather than a crypto import, because it only has to be stable and collision-safe
// across one client's attempts, and this runs in a sandbox with no require().
function keyFor(parts) {
  const s = parts.join('|');
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    h1 = Math.imul(h1 ^ s.charCodeAt(i), 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ s.charCodeAt(i), 0x85ebca6b) >>> 0;
  }
  return 'att_' + h1.toString(16) + h2.toString(16);
}

function render(tpl, vars) {
  return String(tpl || '')
    .replace(/\{\{\s*(\w+)\s*\}\}/g, function (m, k) {
      return (vars[k] === undefined || vars[k] === null) ? '' : String(vars[k]);
    })
    .replace(/\s+/g, ' ')
    .trim();
}

const out = [];
const deferred = [];
let plannedSends = 0;
const cap = Number(cfg.daily_send_cap) || 0;

for (const r of rows) {
  const seq = (Array.isArray(r.sequence) && r.sequence.length) ? r.sequence : cfg.sequence;
  const stepIndex = Number(r.step) || 0;

  // The ladder is finished and there was still silence. Terminal, and not a failure — most
  // people do not reply to a recruiter, and the row says `exhausted` rather than pretending
  // something went wrong.
  if (stepIndex >= seq.length) {
    deferred.push({
      enrollment_id: r.enrollment_id,
      action: 'exhaust',
      status: 'exhausted',
      next_attempt_at: null,
      reason: 'all ' + seq.length + ' touches sent, no reply'
    });
    continue;
  }

  const rung = seq[stepIndex];
  const tz = r.candidate_timezone || cfg.default_timezone;
  const p = localParts(null, tz);
  const weekend = p.weekday === 'Sat' || p.weekday === 'Sun';

  // DEMO_ANY_HOUR. Only ever true when DEMO_MODE is on, and DEMO_MODE forces preview, so
  // this cannot put a real message on a real phone at 3am — it just makes the walkthrough
  // filmable outside office hours.
  const skipQuiet = cfg.ignore_quiet_hours === true;

  if (!skipQuiet && (isQuiet(p.hour) || (!cfg.send_on_weekends && weekend))) {
    // Rescheduled, never dropped. The row stays in the queue with a new due time.
    deferred.push({
      enrollment_id: r.enrollment_id,
      action: 'defer',
      next_attempt_at: nextAllowed(tz),
      reason: isQuiet(p.hour)
        ? 'quiet hours - ' + p.hour + ':00 in ' + tz
        : 'weekend - ' + p.weekday + ' in ' + tz
    });
    continue;
  }

  if (cap && plannedSends >= cap) {
    deferred.push({
      enrollment_id: r.enrollment_id,
      action: 'defer',
      next_attempt_at: nextAllowed(tz),
      reason: 'daily send cap of ' + cap + ' reached'
    });
    continue;
  }

  const pay = Number(r.pay_rate);
  const clientName = r.client_slug
    ? (r.client_slug.charAt(0).toUpperCase() + r.client_slug.slice(1))
    : cfg.client_name;

  const vars = {
    first_name: r.first_name || 'there',
    last_name: r.last_name || '',
    job_title: r.job_title || 'a role',
    job_city: r.job_city || r.job_state || 'your area',
    recruiter_name: r.recruiter_name || 'the recruiting team',
    client_name: clientName,
    pay_phrase: (Number.isFinite(pay) && pay > 0) ? (' paying $' + pay.toFixed(2) + '/hr') : ''
  };

  const channel = rung.channel === 'voice' ? 'voice' : 'sms';
  const body = channel === 'sms' ? render(rung.template, vars) : '';

  const unicode = hasNonAscii(body);
  const perSegment = unicode ? 67 : 153;
  const segments = channel === 'sms' ? (Math.ceil(body.length / perSegment) || 1) : 0;

  const redirected = cfg.mode === 'test' && !!cfg.test_phone;

  out.push({
    enrollment_id: r.enrollment_id,
    client_id: r.client_id,
    campaign_id: r.campaign_id,
    candidate_id: r.candidate_id,
    job_order_id: r.job_order_id,

    to: redirected ? cfg.test_phone : r.phone_e164,
    real_to: r.phone_e164,
    _redirected: redirected,

    channel: channel,
    step: rung.step,
    step_index: stepIndex,
    body: redirected ? ('[TEST -> ' + r.phone_e164 + '] ' + body) : body,
    segments: segments,
    _long_sms: segments > 2,
    _has_unicode: unicode,

    // Everything the Retell agent is told. It is given facts and a job to do; it is never
    // given the decision, which is made from its structured answers in workflow 3.
    agent_note: rung.agent_note || '',
    retell_vars: {
      first_name: vars.first_name,
      job_title: vars.job_title,
      job_city: vars.job_city,
      pay_rate: vars.pay_phrase.replace('paying ', '').trim(),
      shift: r.shift || '',
      recruiter_name: vars.recruiter_name,
      company: clientName,
      note: rung.agent_note || ''
    },

    // Computed before the send. This is the whole duplicate-contact guarantee.
    idempotency_key: keyFor([r.enrollment_id, channel, String(rung.step)]),

    candidate_name: ((r.first_name || '') + ' ' + (r.last_name || '')).trim(),
    job_title: r.job_title,
    recruiter_email: r.recruiter_email,
    timezone: tz,
    local_hour: p.hour,
    match_score: r.match_score,
    attempts_made: Number(r.attempts_made) || 0,
    _tz_error: p._tz_error || ''
  });

  plannedSends++;
}

const deferredByReason = deferred.reduce(function (a, d) {
  const k = String(d.reason).replace(/\d+/g, 'N');
  a[k] = (a[k] || 0) + 1;
  return a;
}, {});

if (!out.length) {
  return [{
    json: {
      _has_work: false,
      due_rows: rows.length,
      deferred: deferred,
      deferred_by_reason: deferredByReason
    }
  }];
}

return out.map(function (o) {
  return {
    json: Object.assign(o, {
      _has_work: true,
      _due_rows: rows.length,
      _deferred: deferred,
      _deferred_by_reason: deferredByReason,
      _batch: out.length
    })
  };
});
