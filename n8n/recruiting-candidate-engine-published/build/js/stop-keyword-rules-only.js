// The AI reader was not called. Either the ATS already gave a real skill list, or no key
// is configured. Either way the job spec passes through untouched.
//
// This branch exists so the merge downstream always has an item, and so the reason is
// visible in the execution list rather than inferred from a node that did not light up.
const cfg = $('config').first().json;
const job = $input.first().json;

const why = !cfg.ai_enabled
  ? 'no AI_API_KEY in config — keyword rules only'
  : (!job._needs_ai
    ? 'the ATS supplied ' + job._skills_from_ats + ' skills, which is enough to match on'
    : 'the job description was too short to be worth reading');

return [{
  json: Object.assign({}, job, {
    _ai_used: false,
    _ai_note: why,
    _skills_before_ai: (job.required_skills || []).length,
    _skills_after_ai: (job.required_skills || []).length,
    _ai_shift: '',
    _ai_certifications: []
  })
}];
