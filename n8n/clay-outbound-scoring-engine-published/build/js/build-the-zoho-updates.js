// One upsert for every reply that changes the lead: its Lead_Status, and Email_Opt_Out for an
// unsubscribe. Matched on email, so the lead that workflow 01 created is updated. If Clay never
// created it, the upsert creates it, which is why Last_Name is always sent.
//
// The tasks cannot be created yet: a Zoho task hangs off the lead's record id, and the id is
// what this upsert returns. `build the tasks` pairs them after the write.
const cfg = $('config').first().json;
const replies = $input.all().map((i) => i.json).filter((r) => r._write_zoho);

const records = replies.slice(0, 100).map((r) => {
  const parts = String(r.lead_name || '').split(/\s+/).filter(Boolean);
  const rec = {
    Email: r.lead_email,
    Last_Name: parts.slice(1).join(' ') || parts[0] || r.lead_email.split('@')[0],
    Lead_Status: r._status
  };
  if (parts.length > 1) rec.First_Name = parts[0];
  if (r._opt_out) rec.Email_Opt_Out = true;
  return rec;
});

return [{
  json: {
    _count: records.length,
    _replies: replies.map((r) => ({ email: r.lead_email, name: r.lead_name, class: r.class, task: r._task })),
    _zoho: {
      url: cfg.zoho_api_base + '/crm/' + cfg.zoho_api_version + '/Leads/upsert',
      body: { data: records, duplicate_check_fields: ['Email'], trigger: cfg.zoho_triggers || [] }
    }
  }
}];
