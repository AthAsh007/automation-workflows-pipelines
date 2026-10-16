// Turns whatever arrived — a Zoho COQL response, or the built-in demo pipeline — into one
// flat list of deals. Everything downstream reads the same keys, so the sweep logic is
// identical whether or not a credential exists.
//
// Zoho's COQL answers { data: [...], info: { count, more_records } }. `more_records` is
// reported rather than ignored: a sweep that silently saw only the first page would report
// a clean pipeline while leaving deals unswept, which is worse than not running.
const cfg = $('config').first().json;
const items = $input.all().map((i) => i.json || {});

let rows = [];
let truncated = false;

// One item carrying a COQL envelope, or a list of already-flat demo deals.
if (items.length === 1 && items[0] && Array.isArray(items[0].data)) {
  rows = items[0].data;
  truncated = !!(items[0].info && items[0].info.more_records);
} else {
  rows = items.filter((r) => r && (r.id || r.Deal_Name));
}

const limit = Number(cfg.deal_page_limit || 200);
if (rows.length > limit) {
  truncated = true;
  rows = rows.slice(0, limit);
}

return rows.map((d) => ({
  json: {
    _demo: d._demo === true,
    _truncated: truncated,
    id: String(d.id || ''),
    name: d.Deal_Name || '(unnamed deal)',
    stage: d.Stage || '',
    owner: (d.Owner && (d.Owner.name || d.Owner.id)) || '',
    owner_id: (d.Owner && d.Owner.id) || '',
    amount: Number(d.Amount || 0),
    closing_date: d.Closing_Date || '',
    next_step: String(d.Next_Step || '').trim(),
    modified_time: d.Modified_Time || ''
  }
}));
