// Match the postcode against the areas in config, longest prefix first, so a rule for
// 'SW1' beats a rule for 'SW'. No match, or no postcode, and it goes to the fallback -
// never nowhere.
const cfg = $('config').first().json;
const enquiry = $input.first().json;

const tidy = String(enquiry.postcode || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

let best = null;
let bestLength = 0;

for (const area of cfg.areas || []) {
  for (const prefix of area.postcodes || []) {
    const p = String(prefix).toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (p && tidy.startsWith(p) && p.length > bestLength) {
      best = area;
      bestLength = p.length;
    }
  }
}

const chosen = best || cfg.fallback || {};
const ownerEmail = String(chosen.email || '').trim();

return [{
  json: Object.assign({}, enquiry, {
    area: chosen.area || 'Unassigned',
    owner: chosen.owner || 'Office',
    owner_email: ownerEmail,
    _matched_on: best ? tidy.slice(0, bestLength) : '',
    _owner_has_email: ownerEmail !== '',
    stage: cfg.stage_on_arrival
  })
}];
