// The row that stops the weekly report going out twice.
//
// Written only after the webhook accepted it. `report` rows are ignored by everything that
// reasons about drafts; "is the weekly report due?" looks for this week's key in the Slug.

const cfg = $('config').first().json;
const r = $('build the weekly report').first().json;
const L = cfg.log_columns;

const row = {};
for (const k of Object.keys(L)) row[L[k]] = '';
row[L.date] = new Date().toISOString().slice(0, 10);
row[L.slug] = r._week_key;
row[L.status] = 'report';
row[L.note] = r._reason.slice(0, 900);
row[L.at] = new Date().toISOString();

return [{ json: row }];
