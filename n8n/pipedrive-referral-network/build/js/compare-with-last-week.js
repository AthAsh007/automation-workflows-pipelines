// Week over week, and who needs a conversation.
//
// A weekly number on its own invites "is that good?". This puts last week next to it for
// the numbers a manager steers by, and flags reps by the shape of their week rather than
// its size:
//
//   effort without progress   COACH_MIN_ATTEMPTS+ attempts, under COACH_MIN_CONVERSATION_PCT%
//                             of them became conversations — a list or a script problem
//   follow-up slipping        over COACH_MAX_GAP_PCT% of their open deals have no next step
//
// "Not captured" stays not captured: a delta is only computed when both weeks have a
// number. null minus 4 is not -4.
const cfg = $('config').first().json;
const k = $('compute the KPIs').first().json;
const b = $json.baseline || null;

const TRACKED = [
  ['coverage_pct', 'Coverage %', 'up'],
  ['gaps', 'Deals without a next activity', 'down'],
  ['overdue', 'Overdue activities', 'down'],
  ['outreach_attempts', 'Outreach attempts', 'up'],
  ['conversations', 'Meaningful conversations', 'up'],
  ['meetings', 'Meetings', 'up'],
  ['new_partners', 'New referral partners', 'up'],
  ['stalled', 'Stalled deals', 'down'],
  ['referrals_sent', 'Patient referrals', 'up']
];

const deltas = TRACKED.map(function (t) {
  const now = k[t[0]];
  const was = b ? b[t[0]] : null;
  const both = now !== null && now !== undefined && was !== null && was !== undefined;
  const d = both ? Number(now) - Number(was) : null;
  return {
    kpi: t[0], label: t[1], now: now === undefined ? null : now, was: was === undefined ? null : was,
    delta: d,
    direction: d === null || d === 0 ? 'flat' : ((d > 0) === (t[2] === 'up') ? 'better' : 'worse')
  };
});

const coaching = [];
(k.by_rep || []).forEach(function (r) {
  const rate = r.outreach_attempts ? Math.round((r.conversations / r.outreach_attempts) * 100) : null;
  const gapPct = r.open_deals ? Math.round((r.gaps / r.open_deals) * 100) : 0;
  if (r.outreach_attempts >= Number(cfg.coach_min_attempts || 0) && rate !== null &&
      rate < Number(cfg.coach_min_conversation_pct || 0)) {
    coaching.push({ rep: r.rep, flag: 'effort without progress',
      detail: r.outreach_attempts + ' attempts, ' + r.conversations + ' conversations (' + rate + '%)' });
  }
  if (gapPct > Number(cfg.coach_max_gap_pct || 100)) {
    coaching.push({ rep: r.rep, flag: 'follow-up slipping',
      detail: r.gaps + ' of ' + r.open_deals + ' open deals (' + gapPct + '%) have no next step' });
  }
});

return [{
  json: Object.assign({}, k, {
    baseline: b,
    baseline_source: $json.baseline_source,
    deltas: deltas,
    worse: deltas.filter(function (d) { return d.direction === 'worse'; }).map(function (d) { return d.kpi; }),
    coaching: coaching
  })
}];
