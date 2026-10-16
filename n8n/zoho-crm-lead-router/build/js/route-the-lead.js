// First rule that matches wins. A lead that fits no rule still lands on the last rule, which
// matches nothing on purpose — never nowhere. The chosen rule sets the owner, the Zoho lead
// status and the tags it carries.
//
// `_routed_by` records WHICH rule decided, so a run that filed something oddly can be
// explained without re-reading the table.
const cfg = $('config').first().json;

const ownerIds = {};
for (const o of cfg.owners || []) ownerIds[o.owner] = o.user_id;

function matches(rule, lead) {
  const m = rule.match || {};
  if (m.source && m.source !== lead.source) return false;
  if (m.wants && m.wants !== lead.wants) return false;
  return true;
}

return $input.all().map((item) => {
  const lead = item.json || {};
  const rules = cfg.routing_rules || [];

  let chosen = null;
  for (const rule of rules) { if (matches(rule, lead)) { chosen = rule; break; } }
  if (!chosen) chosen = rules[rules.length - 1] || {};

  const tags = [];
  for (const t of (cfg.base_tags || []).concat(chosen.tags || [])) {
    if (tags.indexOf(t) < 0) tags.push(t);
  }

  return {
    json: Object.assign({}, lead, {
      owner: chosen.owner || '',
      owner_user_id: ownerIds[chosen.owner] || '',
      status: chosen.status || 'Attempted',
      tags,
      _routed_by: (chosen.match && Object.keys(chosen.match).length)
        ? JSON.stringify(chosen.match)
        : 'the last rule (matches anything)'
    })
  };
});
