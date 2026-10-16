// Decides who is worth a credit. Only a prospect in ENRICH_TIERS (A and B by default) that
// is missing a work email is enriched, highest score first, and never more than
// ENRICH_BUDGET of them in one run. The cap is counted here, in code, not in a comment.
//
// Everyone else passes straight through with the reason they were not enriched, so the run
// summary can say exactly how many credits the ordering saved.
const cfg = $('config').first().json;
const tiers = cfg.enrich_tiers || ['A', 'B'];
const per = Number(cfg.credits_per_contact || 1);
const budget = Number(cfg.enrich_budget || 0);

const all = $input.all().map((i) => Object.assign({}, i.json));

const wanted = all
  .filter((p) => p._usable && !p._duplicate_of && tiers.includes(p.tier) && !p.email)
  .sort((a, b) => b.score - a.score);

let spent = 0;
const funded = new Set();
for (const p of wanted) {
  if (spent + per > budget) break;
  spent += per;
  funded.add(p.clay_row_id);
}

return all.map((p) => {
  let why = '';
  if (!p._usable) why = 'not usable';
  else if (p._duplicate_of) why = 'duplicate, never enriched';
  else if (!tiers.includes(p.tier)) why = 'tier ' + p.tier + ': not worth a credit';
  else if (p.email) why = 'already has a work email';
  else if (!funded.has(p.clay_row_id)) why = 'over ENRICH_BUDGET (' + budget + ' a run): enrich next run';

  const enrich = why === '';
  const out = Object.assign(p, { _needs_enrich: enrich, _enrich_skip: why });
  if (enrich) {
    out._enrich_body = {
      first_name: p.first_name,
      last_name: p.last_name,
      organization_name: p.company,
      domain: p.domain,
      linkedin_url: p.linkedin_url || undefined,
      reveal_personal_emails: false,
      reveal_phone_number: cfg.reveal_phone === true
    };
  }
  if (!p._hold && p.tier === 'Reject') out._hold = 'score ' + p.score + ' is below the C threshold';
  return { json: out };
});
