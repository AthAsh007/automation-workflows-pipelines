// Resolves the natural keys carried by `rows for supabase` into the uuids Supabase just
// minted, using what the two upserts returned rather than by looking anything up.
//
// Both upsert nodes send `Prefer: return=representation`, so the response IS the resolved
// row set. Twenty-five candidates cost one request and this node, instead of twenty-five
// select-by-ats_id calls — which is the difference between a launch that takes two seconds
// and one that takes a minute and a half against a rate-limited API.
const cfg = $('config').first().json;
const prepared = $('rows for supabase').first().json;

const asRows = (v) => {
  const j = v && v.json !== undefined ? v.json : v;
  if (Array.isArray(j)) return j;
  if (j && Array.isArray(j.data)) return j.data;
  return j ? [j] : [];
};

const campaignRows = $('[cred] Supabase - upsert the campaign').all().flatMap(asRows);
const candidateRows = $input.all().flatMap(asRows);
const jobRows = $('[cred] Supabase - upsert the job order').all().flatMap(asRows);

const campaign = campaignRows.find((r) => r && r.id) || {};
const jobRow = jobRows.find((r) => r && r.id) || {};

const byAtsId = new Map();
for (const r of candidateRows) {
  if (r && r.id && r.ats_candidate_id) byAtsId.set(String(r.ats_candidate_id), r.id);
}

const unresolved = [];
const enrollments = [];

for (const e of prepared.enrollments || []) {
  const candidate_id = byAtsId.get(String(e._ats_candidate_id));
  if (!candidate_id || !campaign.id || !jobRow.id) {
    unresolved.push({
      ats_candidate_id: e._ats_candidate_id,
      missing: !candidate_id ? 'candidate row' : (!campaign.id ? 'campaign row' : 'job order row')
    });
    continue;
  }
  enrollments.push({
    client_id: cfg.client_id || null,
    campaign_id: campaign.id,
    candidate_id: candidate_id,
    job_order_id: jobRow.id,
    status: e.status,
    match_score: e.match_score,
    match_reasons: e.match_reasons,
    step: e.step,
    attempts_made: e.attempts_made,
    next_attempt_at: e.next_attempt_at
  });
}

// An enrollment that cannot be linked is reported, not silently skipped. It is nearly
// always the upsert returning fewer rows than were sent because one of them violated a
// constraint, and that is worth seeing in the execution list.
return [{
  json: {
    campaign_id: campaign.id || null,
    job_order_id: jobRow.id || null,
    enrollments: enrollments,
    linked: enrollments.length,
    unresolved: unresolved,
    _warning: unresolved.length
      ? unresolved.length + ' enrollment(s) could not be linked to a Supabase row. '
        + 'Check the upsert responses above for a constraint violation.'
      : ''
  }
}];
