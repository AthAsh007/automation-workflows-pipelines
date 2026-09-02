// The pool was pulled and scored, and nobody came out the other side. That is a legitimate
// outcome for a narrow job order, so it is reported with the arithmetic — which is what
// tells it apart from a broken run.
const j = $input.first().json;
const held = j.held || [];

return [{
  json: {
    _outcome: 'nobody eligible',
    job_title: j.job_title,
    ats_job_id: j.ats_job_id,
    candidates_scored: j.pool || 0,
    held_back: held.length,
    held_by_reason: j.held_by_reason || {},
    examples: held.slice(0, 10).map((h) => ({
      name: h.full_name, score: h.match_score, reason: h.hold_reason
    })),
    _next_step: 'If most rows say "below the floor", MIN_MATCH_SCORE is too high for this '
      + 'job order, or the ATS skill list was empty and there was nothing to match on. If '
      + 'most say "no usable mobile", the candidate field map is pointing at the wrong '
      + 'phone field for this vendor.'
  }
}];
