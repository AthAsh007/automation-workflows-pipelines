// A transparent score. Every point is attributable to a rule with a name, so the sentence
// "why did we text this person about a forklift job" always has an answer that fits on one
// line — which is the thing an embedding similarity cannot give a staffing manager.
const cfg = $('config').first().json;
const w = cfg.match || {};
const job = $('the job spec').first().json;

const candidates = $input.all().map((i) => i.json).filter((c) => c && !c._no_candidates);

// "Forklift Operator" vs "Warehouse Forklift Driver" share `forklift`. Stop words removed
// so "of", "and" and "the" do not manufacture a match.
const STOP = new Set(['a','an','and','the','of','for','to','in','at','with','or','ii','iii',
  'senior','junior','lead','level','i','ft','pt','temp','contract']);
const words = (s) => String(s || '').toLowerCase().split(/[^a-z0-9+#]+/)
  .filter((x) => x.length > 2 && !STOP.has(x));

const jobTitleWords = new Set(words(job.title));
const required = job.required_skills || [];
const nice = job.nice_to_have || [];

// A skill matches if either string contains the other: "forklift" matches "forklift certified",
// and "excel" does not match "excellent".
const hasSkill = (skills, want) => skills.some((s) => {
  const a = s.toLowerCase(), b = String(want).toLowerCase();
  return a === b || (a.length > 3 && b.length > 3 && (a.includes(b) || b.includes(a)));
});

// The description is the fallback when the ATS skill list is empty, which for most job
// orders it is. Pulling the required skills out of prose is a genuine weak point and it is
// called out in the README rather than hidden.
const descWords = new Set(words(job.description));

const scored = candidates.map((c) => {
  let score = 0;
  const reasons = [];
  const skills = c.skills || [];

  let hits = 0;
  for (const s of required) {
    if (hasSkill(skills, s)) { hits++; score += w.required_skill || 0; }
  }
  if (hits) reasons.push(hits + ' of ' + required.length + ' required skills');

  let niceHits = 0;
  for (const s of nice) {
    if (hasSkill(skills, s)) { niceHits++; score += w.nice_skill || 0; }
  }
  if (niceHits) reasons.push(niceHits + ' preferred skills');

  // No skill list on either side: fall back to their title against the description.
  if (!required.length && descWords.size) {
    const overlap = words(c.title).filter((x) => descWords.has(x));
    if (overlap.length) {
      score += Math.min(overlap.length, 3) * (w.required_skill || 0) / 2;
      reasons.push('title words in the job description: ' + overlap.slice(0, 3).join(', '));
    }
  }

  const titleOverlap = words(c.title).filter((x) => jobTitleWords.has(x));
  if (titleOverlap.length) {
    score += w.title_overlap || 0;
    reasons.push('title matches on ' + titleOverlap.slice(0, 2).join(', '));
  }

  if (job.city && c.city && job.city.toLowerCase() === c.city.toLowerCase()) {
    score += w.same_city || 0;
    reasons.push('same city');
  } else if (job.state && c.state && job.state === c.state) {
    score += w.same_state || 0;
    reasons.push('same state');
  } else if (job.state && c.state && job.state !== c.state) {
    reasons.push('out of state (' + c.state + ')');
  }

  const active = ['active', 'available', 'placed - available', 'new lead', 'submitted',
    'contacted', 'qualifying'];
  if (c.ats_status && active.indexOf(c.ats_status.toLowerCase()) !== -1) {
    score += w.recent_activity || 0;
    reasons.push('ATS status "' + c.ats_status + '"');
  }

  if (c.phone_e164) {
    score += w.has_mobile || 0;
  } else {
    reasons.push('no usable mobile — cannot be texted or called');
  }

  score = Math.max(0, Math.round(score));

  return Object.assign({}, c, {
    match_score: score,
    match_reasons: reasons,
    _above_floor: score >= (cfg.min_match_score || 0),
    _job_title: job.title,
    _ats_job_id: job.ats_job_id
  });
});

scored.sort((a, b) => b.match_score - a.match_score);

// Everyone is returned, including those below the floor. They are stored with their score
// and their reason, so "why was this person not contacted" is answerable too — and so the
// floor can be lowered next week without re-pulling 20,000 records.
return scored.map((c, i) => ({ json: Object.assign(c, { _rank: i + 1, _pool_size: scored.length }) }));
