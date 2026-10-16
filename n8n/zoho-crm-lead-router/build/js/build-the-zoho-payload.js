// The whole Zoho request, assembled as one object before anything is sent. Building it here
// rather than in the HTTP node means the exact body can be read on a STOP node when no
// credential is configured — which is what makes this demoable before the client has created
// an API client at all.
//
// Zoho specifics worth knowing:
//   * POST /crm/v8/Leads takes { data: [ ... ], trigger: [ ... ] }, up to 100 records.
//   * `trigger` decides whether Zoho's OWN workflow rules, approvals and blueprints fire.
//     Empty means none of them do. See ZOHO_TRIGGERS in config.
//   * Owner and Layout are lookups: { id: '...' }, not names.
//   * A blank id is omitted entirely. Zoho rejects { id: '' } rather than ignoring it.
const cfg = $('config').first().json;
const base = cfg.zoho_api_base + '/crm/' + cfg.zoho_api_version;

return $input.all().map((item) => {
  const lead = item.json || {};

  const record = {
    Last_Name: lead.last_name,
    Lead_Status: lead.status,
    Lead_Source: 'Automation intake',
    Description: lead.summary
  };

  if (lead.first_name) record.First_Name = lead.first_name;
  if (lead.email) record.Email = lead.email;
  if (lead.phone) record.Phone = lead.phone;
  if (lead.company) record.Company = lead.company;
  // Zoho refuses a record whose Company is empty on the default layout.
  if (!record.Company) record.Company = lead.full_name || lead.last_name;

  if (lead.owner_user_id) record.Owner = { id: lead.owner_user_id };
  if (cfg.lead_layout_id) record.Layout = { id: cfg.lead_layout_id };
  if ((lead.tags || []).length) record.Tag = lead.tags.map((t) => ({ name: t }));

  for (const f of cfg.custom_fields || []) {
    if (!f.api_name) continue;
    const v = lead[f.from];
    if (v !== undefined && v !== null && String(v) !== '') record[f.api_name] = v;
  }

  return {
    json: Object.assign({}, lead, {
      _zoho: {
        url: base + '/Leads',
        body: { data: [record], trigger: cfg.zoho_triggers || [] }
      }
    })
  };
});
