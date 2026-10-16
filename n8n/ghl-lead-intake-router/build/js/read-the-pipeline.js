// Maps the pipeline into the ONE row shape the sequence decides on, whether it came from
// GoHighLevel or from the built-in demo pipeline. Everything downstream is identical either way.
//
// GoHighLevel's /opportunities/search returns opportunities, not the contact facts the sequence
// wants — how many touches have gone out, when the last one was. Those live in custom fields, so
// their ids are settings (`SEQ_*_FIELD_ID`); a blank id reads as 0 rather than being invented.
// The stage arrives as a pipelineStageId, which is turned back into the name `OPEN_STAGES` uses.
//
// If the account has more opportunities than one page, that is REPORTED (`more_pages`), never
// silently dropped.
const cfg = $('config').first().json;

const stageById = {};
for (const s of cfg.stages || []) if (s.id) stageById[s.id] = s.stage;

function fromOpportunity(o) {
  const cf = {};
  for (const f of (o.customFields || [])) cf[f.id] = f.value;
  const c = o.contact || {};
  return {
    contact_key:  c.email || c.phone || o.contactId || o.id || '',
    name:         c.name || c.contactName || o.name || '',
    company:      c.companyName || '',
    email:        c.email || '',
    phone:        c.phone || '',
    contact_id:   o.contactId || c.id || '',
    owner:        o.assignedTo || '',
    stage:        stageById[o.pipelineStageId] || o.pipelineStageName || 'unknown',
    touches_sent: Number(cf[cfg.seq_touches_field_id]) || 0,
    last_touch:   cfg.seq_last_touch_field_id ? (cf[cfg.seq_last_touch_field_id] || '') : '',
    last_reply:   cfg.seq_last_reply_field_id ? (cf[cfg.seq_last_reply_field_id] || '') : ''
  };
}

const rows = [];
let more = false;
let total = null;
let from = '';

for (const item of $input.all()) {
  const j = item.json || {};
  if (Array.isArray(j.opportunities)) {
    for (const o of j.opportunities) rows.push(fromOpportunity(o));
    const meta = j.meta || {};
    total = (meta.total === undefined || meta.total === null) ? null : Number(meta.total);
    more = !!(meta.nextPageUrl || meta.nextPage || meta.startAfterId);
    from = 'GoHighLevel';
  } else if (j.contact_key || j.email || j.contact_id || j.stage) {
    // The demo pipeline already emits the row shape.
    rows.push(j);
    if (!from) from = 'the demo pipeline';
  }
}

return [{
  json: {
    rows: rows,
    rows_read: rows.length,
    more_pages: more,
    total_available: total,
    _from: from || 'an empty pipeline'
  }
}];
