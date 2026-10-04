// One row per contact, in the same shape every time.
//
// The contacts come from "decide who is safe to email" rather than from this node's input,
// because the input is now organisation rows — the previous step folded them. Held contacts
// are written too, with the reason in plain words: the sheet is the record of the whole
// database, not just the part that got emailed.
const cfg = $('config').first().json;
const C = cfg.contact_columns;
const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');

const contacts = $('decide who is safe to email').all()
  .map((i) => i.json)
  .filter((c) => !c._no_contact && String(c.email || '').includes('@'));

return contacts.map((c) => {
  const row = {};
  row[C.contact_id]   = c.contact_id || '';
  row[C.org_id]       = c.org_id || '';
  row[C.org_name]     = c.org_name || '';
  row[C.category]     = c.category || '';
  row[C.county]       = c.county || '';
  row[C.full_name]    = c.full_name || '';
  row[C.first_name]   = c.first_name || '';
  row[C.title]        = c.title || '';
  row[C.email]        = c.email || '';
  row[C.email_status] = c.email_status || '';
  row[C.verified_at]  = c._verified_at || '';
  row[C.phone]        = c.contact_phone || '';
  row[C.linkedin]     = c.linkedin || '';
  row[C.score]        = Number(c.score || 0);
  row[C.tier]         = c.tier || '';
  row[C.sending_list] = c.sending_list || 'No';
  row[C.hold_reason]  = c._hold_reason || '';
  row[C.updated_at]   = stamp;
  // Campaign and "Pushed at" are deliberately absent. This write matches on Contact id, and
  // a blank here would wipe what a previous run recorded; only "mark them pushed" sets them.

  return { json: Object.assign({}, row, { _contact: c }) };
});
