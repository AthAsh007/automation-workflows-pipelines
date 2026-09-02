// One row per organisation, folded back from however many contacts came out of it, so the
// raw list records what happened and the next run does not do the same work again.
//
// The status is the honest one: "Enriched" only if a person with an address came out,
// "No contact found" otherwise. An org that silently looks done but produced nobody is how
// a 2,000-record database turns out to contain 900 usable people.
const cfg = $('config').first().json;
const C = cfg.org_columns;
const contacts = $input.all().map((i) => i.json);
const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');

// Carried onto every org row so the gates further down have something run-level to read
// after the item shape has changed from contacts to organisations.
const runFlags = {
  _contacts_to_write: contacts.some((c) => !c._no_contact && String(c.email || '').includes('@')),
  _any_safe: contacts.some((c) => c._safe) && cfg.push_enabled === true
};

const byOrg = new Map();
for (const c of contacts) {
  const id = c.org_id || '(unknown)';
  if (!byOrg.has(id)) byOrg.set(id, []);
  byOrg.get(id).push(c);
}

const rows = [];

for (const [id, group] of byOrg) {
  const first = group[0] || {};
  const found = group.filter((c) => !c._no_contact && String(c.email || '').includes('@'));
  const safe = group.filter((c) => c._safe);

  const notes = [];
  if (first._category_matched_on === 'ai') notes.push('category by AI: ' + (first._ai_answer || ''));
  if (first._domain_missing) notes.push('no website on the raw row');
  if (first._apollo_hidden) notes.push(first._apollo_hidden + ' Apollo emails locked');
  if (!found.length) notes.push(first._hold_reason || 'no contact found');
  else if (!safe.length) notes.push('found ' + found.length + ', none passed: ' + (found[0]._hold_reason || ''));

  const row = {};
  row[C.org_id]      = id;
  row[C.name]        = first.org_name || '';
  row[C.category]    = first.category || '';
  row[C.website]     = first.domain || '';
  row[C.county]      = first.county || '';
  row[C.city]        = first.city || '';
  row[C.state]       = first.state || '';
  row[C.phone]       = first.phone || '';
  row[C.source]      = first.source || '';
  row[C.status]      = found.length ? 'Enriched' : 'No contact found';
  row[C.enriched_at] = stamp;
  row[C.contacts]    = found.length;
  row[C.notes]       = notes.join(' | ').slice(0, 900);

  rows.push({ json: Object.assign({}, row, runFlags, { _org_id: id, _contacts: group.length }) });
}

return rows;
