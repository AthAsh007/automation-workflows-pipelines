// Builds the exact GoHighLevel request, so the write is one object you can read and review
// rather than parameters scattered across a node. NOTHING is sent from here — this node is
// pure, and its output is what the two write nodes below either send or show.
//
// GoHighLevel wants a contact and its opportunity as two calls: the contact is upserted
// first, and the opportunity is created against the contact id that comes back. Both bodies
// are built here so the second call is visible even though only the first is wired up.
const cfg = $('config').first().json;

const base = String(cfg.ghl_api_base || '').replace(/\/+$/, '');
const headers = {
  Accept: 'application/json',
  'Content-Type': 'application/json',
  Version: cfg.ghl_api_version,
  Authorization: 'Bearer ' + (cfg.ghl_api_key || '')
};

return $input.all().map((item) => {
  const lead = item.json || {};

  const customFields = [];
  for (const cf of cfg.custom_fields || []) {
    const value = lead[cf.from];
    if (cf.id && value) customFields.push({ id: cf.id, value: String(value) });
  }

  const contactBody = {
    locationId: cfg.ghl_location_id,
    firstName: lead.first_name || '',
    lastName: lead.last_name || '',
    name: lead.name || '',
    email: lead.email || '',
    phone: lead.phone || '',
    source: lead.source_label || lead.source || '',
    tags: lead.tags || [],
    customFields: customFields
  };
  // An empty string overwrites a good value on the contact — send only what we have.
  for (const k of Object.keys(contactBody)) {
    if (contactBody[k] === '') delete contactBody[k];
  }
  if (!customFields.length) delete contactBody.customFields;
  if (!contactBody.tags || !contactBody.tags.length) delete contactBody.tags;

  const opportunityBody = {
    locationId: cfg.ghl_location_id,
    pipelineId: cfg.ghl_pipeline_id,
    pipelineStageId: lead.stage_id || '',
    name: (lead.company || lead.name || 'New lead') + ' — ' + lead.stage,
    status: 'open'
  };
  if (!opportunityBody.pipelineStageId) delete opportunityBody.pipelineStageId;

  return {
    json: Object.assign({}, lead, {
      _ghl: {
        contact: { method: 'POST', url: base + '/contacts/upsert', body: contactBody },
        opportunity: { method: 'POST', url: base + '/opportunities/', body: opportunityBody }
      },
      _would_write: contactBody,
      _then: 'create the opportunity at stage "' + lead.stage +
             '" for the contact id the upsert returns'
    })
  };
});
