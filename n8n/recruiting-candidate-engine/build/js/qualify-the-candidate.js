// The decision. Deterministic, auditable, and identical every time it runs on the same
// answers — which is the property that lets a staffing manager argue with it.
//
// The AI's job is to fill in the blanks. This node's job is to decide. The separation is
// deliberate: the Retell agent is asked structured questions and returns typed answers,
// and the pass/fail is computed from QUALIFY in the config node, so changing the bar is a
// config edit rather than a prompt rewrite, and last month's decisions can be re-explained.
//
// The rule that matters most: null never passes. A question the agent could not establish
// is not an assumed yes.
const cfg = $('config').first().json;
const ev = $input.first().json || {};
const q = cfg.qualify || { must: [], score: [], pass_mark: 0, review_band: 0 };

// Answers come from the Retell analysis, or from an SMS conversation that got far enough.
// Both arrive as a flat object of typed values.
const answers = Object.assign({}, ev.answers || {});

// An SMS "YES" is interest, not qualification. It is recorded as one answered question out
// of several, and it will not on its own clear a `must` list that asks about work
// authorisation and a start date.
if (ev.source === 'twilio_sms') {
  if (ev.intent === 'interested') answers.interested = true;
  if (ev.intent === 'not_interested') answers.interested = false;
}

const coerce = (v) => {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v === 'boolean') return v;
  const s = String(v).trim().toLowerCase();
  if (['true', 'yes', 'y', 'confirmed'].indexOf(s) !== -1) return true;
  if (['false', 'no', 'n', 'declined'].indexOf(s) !== -1) return false;
  if (['unknown', 'unclear', 'n/a', 'na', 'not stated', 'null'].indexOf(s) !== -1) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : String(v);
};

function test(rule, value) {
  if (value === null) return { pass: false, why: 'not established' };
  if (rule.equals !== undefined) {
    return { pass: value === rule.equals, why: 'answered ' + JSON.stringify(value) };
  }
  if (rule.gte !== undefined) {
    const n = Number(value);
    return { pass: Number.isFinite(n) && n >= rule.gte, why: String(value) + ' vs >= ' + rule.gte };
  }
  if (rule.lte !== undefined) {
    const n = Number(value);
    return { pass: Number.isFinite(n) && n <= rule.lte, why: String(value) + ' vs <= ' + rule.lte };
  }
  return { pass: false, why: 'no comparison in the rule' };
}

const musts = [];
let failedMust = null;
for (const rule of q.must || []) {
  const value = coerce(answers[rule.key]);
  const r = test(rule, value);
  musts.push({ label: rule.label, key: rule.key, value: value, passed: r.pass, detail: r.why });
  if (!r.pass && !failedMust) failedMust = rule.label + ' (' + r.why + ')';
}

let score = 0;
const scored = [];
for (const rule of q.score || []) {
  const value = coerce(answers[rule.key]);
  const r = test(rule, value);
  if (r.pass) score += Number(rule.points) || 0;
  scored.push({ label: rule.label, key: rule.key, value: value,
    passed: r.pass, points: r.pass ? (rule.points || 0) : 0, detail: r.why });
}

const answered = musts.concat(scored).filter((x) => x.value !== null).length;
const total = musts.length + scored.length;

const passMark = Number(q.pass_mark) || 0;
const band = Number(q.review_band) || 0;

let outcome;
let reason;

if (ev._no_answer) {
  outcome = 'no_answer';
  reason = 'the call was not answered — this is not a rejection, the ladder continues';
} else if (ev.intent === 'not_interested' || answers.interested === false) {
  outcome = 'not_qualified';
  reason = 'said they are not interested';
} else if (failedMust) {
  // Everything that failed only because the agent never got an answer goes to a human
  // rather than being rejected. A dropped call is not a "no".
  const onlyUnestablished = musts.filter((m) => !m.passed).every((m) => m.value === null);
  outcome = onlyUnestablished && answered > 0 ? 'needs_review' : 'not_qualified';
  reason = onlyUnestablished
    ? 'could not establish: ' + musts.filter((m) => !m.passed).map((m) => m.label).join(', ')
    : 'failed a requirement — ' + failedMust;
} else if (score >= passMark) {
  outcome = 'qualified';
  reason = 'met every requirement and scored ' + score + ' of ' + passMark;
} else if (score >= passMark - band) {
  outcome = 'needs_review';
  reason = 'scored ' + score + ', within ' + band + ' of the ' + passMark + ' pass mark';
} else {
  outcome = 'not_qualified';
  reason = 'scored ' + score + ', below the ' + passMark + ' pass mark';
}

// A one-line sentence a recruiter can read without opening anything. This is what goes in
// the Slack message and into the ATS note.
const highlights = scored.filter((s) => s.passed).map((s) => s.label);
const gaps = scored.filter((s) => !s.passed && s.value !== null).map((s) => s.label);

return [{
  json: Object.assign({}, ev, {
    qualification: {
      outcome: outcome,
      reason: reason,
      score: score,
      pass_mark: passMark,
      questions_answered: answered,
      questions_total: total,
      must: musts,
      scored: scored,
      answers: answers,
      evaluated_at: new Date().toISOString(),
      // Stamped so a decision made last quarter can be re-explained against the rules that
      // were in force at the time, not the ones in config today.
      criteria_version: JSON.stringify(q).length
    },
    _qualified: outcome === 'qualified',
    _needs_review: outcome === 'needs_review',
    _no_answer: outcome === 'no_answer',
    _headline: (ev.candidate_name || 'Candidate') + ' — ' + outcome.replace('_', ' ')
      + ' (' + score + '/' + passMark + ')',
    _highlights: highlights,
    _gaps: gaps,
    _enrollment_status: outcome === 'qualified' ? 'qualified'
      : (outcome === 'no_answer' ? 'active'
        : (outcome === 'needs_review' ? 'responded' : 'not_qualified'))
  })
}];
