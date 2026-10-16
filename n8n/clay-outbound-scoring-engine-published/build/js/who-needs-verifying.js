// Marks who needs a verifier call: an A or B prospect with an email, not a duplicate. Those
// are the only people who can reach a sending campaign, so they are the only ones worth
// paying to check. C tier goes to Zoho as nurture and is never emailed from here.
const cfg = $('config').first().json;
const tiers = cfg.enrich_tiers || ['A', 'B'];
return $input.all().map((item) => {
  const p = Object.assign({}, item.json);
  p._needs_verify = !!(p._usable && !p._duplicate_of && tiers.includes(p.tier) && p.email);
  return { json: p };
});
