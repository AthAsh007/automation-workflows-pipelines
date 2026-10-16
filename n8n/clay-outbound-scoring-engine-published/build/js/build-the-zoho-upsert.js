// The whole Zoho request, assembled as one object before anything is sent, so the exact body
// can be read on a STOP node when Zoho is not connected.
//
// Zoho specifics:
//   * POST /crm/v8/Leads/upsert takes { data, duplicate_check_fields, trigger }, up to 100
//     records. A record matching an existing lead on ZOHO_DUPLICATE_CHECK is UPDATED, not
//     duplicated: re-posting the same Clay row is safe.
//   * `trigger` empty means Zoho's own workflow rules do not fire on these writes.
//   * Owner is a lookup ({ id }), and a blank id is omitted: Zoho rejects { id: '' }.
//   * Custom fields are written only where ZOHO_FIELDS has an API name.
const cfg = $('config').first().json;
const run = $input.first().json;
const F = cfg.zoho_fields || {};

const records = (run.crm || []).slice(0, 100).map((p) => {
  const r = {
    Last_Name: p.last_name || p.full_name || 'Unknown',
    Email: p.email,
    Company: p.company || p.domain,
    Lead_Source: 'Clay',
    Lead_Status: (cfg.lead_status_by_tier || {})[p.tier] || 'Not Contacted',
    Description: 'Fit ' + p.score + ' (' + p.tier + ', ' + p.persona + '): ' + p.score_breakdown.join(', ') +
      '. Next: ' + p.recommended_action + '.'
  };
  if (p.first_name) r.First_Name = p.first_name;
  if (p.title) r.Designation = p.title;
  if (p.phone) r.Phone = p.phone;
  if (p.domain) r.Website = p.domain;
  if (p.employees) r.No_of_Employees = p.employees;
  if (p.industry) r.Industry = p.industry;
  if (p.country) r.Country = p.country;
  if (p.email_status === 'catch_all' || p.email_status === 'unknown' || p.email_status === 'unverified') {
    r.Description += ' Email ' + p.email_status + ': not sequenced.';
  }
  const owner = (cfg.owner_by_tier || {})[p.tier];
  if (owner) r.Owner = { id: owner };
  if (F.fit_score) r[F.fit_score] = p.score;
  if (F.tier) r[F.tier] = p.tier;
  if (F.persona) r[F.persona] = p.persona;
  if (F.recommended_action) r[F.recommended_action] = p.recommended_action;
  if (F.clay_row_id) r[F.clay_row_id] = p.clay_row_id;
  return r;
});

return [{
  json: {
    _count: records.length,
    _emails: records.map((r) => r.Email),
    _zoho: {
      url: cfg.zoho_api_base + '/crm/' + cfg.zoho_api_version + '/Leads/upsert',
      body: { data: records, duplicate_check_fields: cfg.zoho_duplicate_check || ['Email'],
        trigger: cfg.zoho_triggers || [] }
    }
  }
}];
