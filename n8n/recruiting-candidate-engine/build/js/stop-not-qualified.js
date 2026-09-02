// Screened and not moving forward — or screened and needing a human. Either way this is a
// real outcome that gets written into the ATS, not a dead end.
//
// The distinction between the two matters commercially. "Not qualified" closes a candidate
// out. "Needs review" is a person the AI could not finish establishing something about,
// and quietly rejecting those is how an agency loses good candidates to an automation
// nobody audits.
const ev = $input.first().json || {};
const q = ev.qualification || {};

const unanswered = (q.must || []).concat(q.scored || [])
  .filter((x) => x.value === null)
  .map((x) => x.label);

return [{
  json: Object.assign({}, ev, {
    _outcome: q.outcome,
    headline: ev._headline,
    reason: q.reason,
    score: q.score,
    pass_mark: q.pass_mark,
    answered: q.questions_answered + ' of ' + q.questions_total,
    could_not_establish: unanswered,
    failed_requirements: (q.must || []).filter((m) => !m.passed)
      .map((m) => m.label + ' — ' + m.detail),
    _needs_a_human: q.outcome === 'needs_review',
    _next_step: q.outcome === 'needs_review'
      ? 'This one is queued for a recruiter, not rejected. The ATS note carries every '
        + 'answer the agent did get, so the follow-up call starts from something.'
      : 'Written back to the ATS with the reason. The candidate stays in the database and '
        + 'is eligible for a different job order tomorrow — the outcome is scoped to this '
        + 'campaign, not to the person.'
  })
}];
