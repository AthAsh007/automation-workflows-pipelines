// The one place that decides where each prospect goes. Everything upstream only added facts;
// this node reads them all and routes:
//
//   Zoho CRM      A, B and C with an email that is not invalid. C lands as nurture.
//   Smartlead     A and B only, verified, and only if that tier has a campaign id.
//   held          everyone else, each with the reason, in one list.
//
// It returns ONE item carrying the whole run, because the Zoho upsert and the Smartlead push
// are both batch calls. Splitting here would reach them as several executions, each seeing
// part of the list.
const cfg = $('config').first().json;
const all = $input.all().map((i) => i.json);
const campaignTiers = Object.keys(cfg.smartlead_campaigns || {});

const crm = [];
const campaign = {};
const held = [];

for (const p of all) {
  const reasons = [];
  if (!p._usable || p._duplicate_of || p.tier === 'Reject') {
    held.push(Object.assign({}, p, { _where: 'nowhere', _why: p._hold || 'rejected' }));
    continue;
  }
  if (!p.email) {
    held.push(Object.assign({}, p, { _where: 'left in Clay',
      _why: (p._enrich_skip || p._enrich_result || 'no email') + ': nothing to match on in Zoho yet' }));
    continue;
  }
  if (p.email_status === 'invalid') {
    held.push(Object.assign({}, p, { _where: 'left in Clay',
      _why: 'email invalid: send it back through the waterfall' }));
    continue;
  }

  crm.push(p);

  if (!campaignTiers.includes(p.tier)) {
    reasons.push('tier ' + p.tier + ' is never sequenced');
  } else if (!p._verified) {
    reasons.push('email ' + (p.email_status || 'unverified') + ': held from the campaign');
  }
  if (reasons.length) {
    held.push(Object.assign({}, p, { _where: 'Zoho only', _why: reasons.join('; ') }));
    continue;
  }
  (campaign[p.tier] = campaign[p.tier] || []).push(p);
}

const by = (list, k) => list.reduce((m, p) => { m[p[k]] = (m[p[k]] || 0) + 1; return m; }, {});

return [{
  json: {
    crm: crm,
    campaign: campaign,
    held: held,
    counts: {
      received: all.length,
      by_tier: by(all.filter((p) => p._usable && !p._duplicate_of), 'tier'),
      to_zoho: crm.length,
      to_campaign: Object.values(campaign).reduce((s, l) => s + l.length, 0),
      held: held.filter((h) => h._where !== 'Zoho only').length,
      zoho_only: held.filter((h) => h._where === 'Zoho only').length,
      enriched: all.filter((p) => p._enriched).length,
      credits_used: all.filter((p) => p._enriched).length * Number(cfg.credits_per_contact || 1),
      credits_budget: Number(cfg.enrich_budget || 0),
      // What an enrich-every-row table would have spent on this batch, minus what was spent.
      credits_saved: (all.filter((p) => p._usable).length - all.filter((p) => p._enriched).length)
        * Number(cfg.credits_per_contact || 1)
    }
  }
}];
