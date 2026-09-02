// Merges what the model extracted back onto the job spec.
//
// The model's output is treated as untrusted input, because it is. Every value is
// validated, capped and normalised before it can influence who gets a text message:
//
//   - the reply may arrive wrapped in a code fence, or with a sentence in front of it
//   - it may be valid JSON of entirely the wrong shape
//   - it may return forty skills when it was asked for twelve
//   - the API may have returned an error object with a 200, because the HTTP node is set
//     to neverError so that a failure here cannot take the campaign down
//
// Any of those falls back to the ATS skill list and the run continues. An AI step that can
// fail a job order is worse than no AI step.
const cfg = $('config').first().json;
const job = $('read the job order').first().json;
const res = $input.first().json || {};

const clean = (s) => String(s || '').toLowerCase().trim()
  .replace(/^[-*\d.)\s]+/, '')     // list bullets the model added anyway
  .replace(/\s+/g, ' ')
  .slice(0, 60);

// Anthropic returns { content: [ { type: 'text', text: '...' } ] }. An error returns
// { type: 'error', error: { message } } — with a 200, because of neverError.
let raw = '';
if (Array.isArray(res.content)) {
  raw = res.content.filter((b) => b && b.type === 'text').map((b) => b.text).join('\n');
} else if (typeof res.completion === 'string') {
  raw = res.completion;
}

const apiError = res.error ? String(res.error.message || res.error.type || 'API error')
  : (res.type === 'error' ? 'API returned an error' : '');

// Pull the first {...} out of whatever came back. Handles a bare object, a fenced block,
// and a model that felt like explaining itself first.
function extractJson(text) {
  const s = String(text || '');
  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : s;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch (e) {
    return null;
  }
}

const parsed = extractJson(raw);
const cap = Number(cfg.ai_max_skills) || 12;

const asSkills = (v) => (Array.isArray(v) ? v : [])
  .map(clean)
  .filter((x) => x.length > 1 && x.length < 60)
  .filter((x, i, a) => a.indexOf(x) === i)
  .slice(0, cap);

const aiRequired = parsed ? asSkills(parsed.required_skills) : [];
const aiNice = parsed ? asSkills(parsed.nice_to_have) : [];

// The ATS list always wins where the two disagree — a recruiter typed it, and the model
// only ever adds to it.
const merged = job.required_skills.slice();
for (const s of aiRequired) if (merged.indexOf(s) === -1) merged.push(s);
const mergedNice = job.nice_to_have.slice();
for (const s of aiNice) if (mergedNice.indexOf(s) === -1 && merged.indexOf(s) === -1) {
  mergedNice.push(s);
}

const used = merged.length > job.required_skills.length || mergedNice.length > job.nice_to_have.length;

let note;
if (apiError) note = 'the AI call failed (' + apiError + ') — keyword rules only';
else if (!parsed) note = 'the AI reply could not be parsed as JSON — keyword rules only';
else if (!used) note = 'the AI added nothing the ATS did not already have';
else note = 'the AI added ' + (merged.length - job.required_skills.length) + ' required and '
  + (mergedNice.length - job.nice_to_have.length) + ' preferred skills';

return [{
  json: Object.assign({}, job, {
    required_skills: merged,
    nice_to_have: mergedNice,
    // A shift or a certification the model spotted in the prose is useful on the ATS note
    // and in the SMS, but it is never allowed to gate anybody.
    _ai_shift: parsed && typeof parsed.shift === 'string' ? clean(parsed.shift) : '',
    _ai_certifications: parsed ? asSkills(parsed.certifications) : [],
    _ai_used: used,
    _ai_note: note,
    _ai_model: cfg.ai_model,
    _ai_raw_reply: String(raw).slice(0, 1200),
    _skills_before_ai: job.required_skills.length,
    _skills_after_ai: merged.length,
    _tokens: res.usage
      ? { in: res.usage.input_tokens, out: res.usage.output_tokens } : null
  })
}];
