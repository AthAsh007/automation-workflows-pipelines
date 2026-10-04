// Score every contact against the ideal profile, so the caller's day is spent on the people
// who can actually make a referral.
//
// The score is deliberately boring arithmetic, not a black box: title weight from config,
// plus small bonuses for a direct phone number and a segment we know the offer lands in.
// When Zak asks "why is this person a 78", the answer is four numbers you can point at.
const cfg = $('config').first().json;

const titleRules = cfg.title_rules || [];
const excluded = (cfg.exclude_titles || []).map((t) => String(t).toLowerCase());

// Segments where a no-cost Medicaid telehealth referral is closest to a live need.
const CATEGORY_BONUS = {
  'Hospital / discharge planning': 12,
  'Addiction treatment': 10,
  'County social services': 8,
  'Behavioral health provider': 6,
  'Community non-profit': 4
};

return $input.all().map((item) => {
  const c = item.json;

  if (c._no_contact) {
    return { json: Object.assign({}, c, { score: 0, tier: '-', _verifiable: false }) };
  }

  const title = String(c.title || '').toLowerCase();
  const hitExcluded = excluded.find((t) => title.includes(t));

  if (hitExcluded) {
    return {
      json: Object.assign({}, c, {
        score: 0, tier: 'X', _verifiable: false,
        _hold_reason: 'excluded title (' + hitExcluded + ')'
      })
    };
  }

  let weight = 0;
  let tier = 'C';
  let matchedTitle = '';
  for (const rule of titleRules) {
    const hit = (rule.words || []).find((w) => title.includes(String(w).toLowerCase()));
    if (hit) { weight = Number(rule.weight) || 0; tier = rule.tier || 'C'; matchedTitle = hit; break; }
  }

  const categoryBonus = Number(CATEGORY_BONUS[c.category] || 0);
  const phoneBonus = String(c.contact_phone || c.phone || '').trim() ? 8 : 0;
  const linkedinBonus = String(c.linkedin || '').trim() ? 4 : 0;
  const namedBonus = String(c.first_name || '').trim() ? 6 : 0;

  const score = Math.max(0, Math.min(100, weight + categoryBonus + phoneBonus + linkedinBonus + namedBonus));

  return {
    json: Object.assign({}, c, {
      score: score,
      tier: score >= 70 ? 'A' : (score >= Number(cfg.min_icp_score || 35) ? tier : 'C'),
      _score_parts: {
        title: weight, title_matched: matchedTitle, category: categoryBonus,
        phone: phoneBonus, linkedin: linkedinBonus, named: namedBonus
      },
      // Only a real address on a scorable person is worth a verifier credit.
      _verifiable: String(c.email || '').includes('@') && cfg.verifier_enabled === true
    })
  };
});
