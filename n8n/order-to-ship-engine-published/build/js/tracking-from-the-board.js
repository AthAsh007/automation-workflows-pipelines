// The office pasted carrier/tracking/ship date onto the row when they made the label, so
// no API call is needed. The values travel as-is — no guessing, no reshaping.
const cfg = $('config').first().json;
const cols = cfg.columns || {};
const h = (k) => cols[k] || k;
const item = $input.first().json;
const carrier = String(item[h('carrier')] || '').trim();
const tracking = String(item[h('tracking')] || '').trim();
const shipDate = String(item[h('ship_date')] || '').trim();
return [{
  json: Object.assign({}, item, {
    carrier: carrier,
    tracking: tracking,
    ship_date: shipDate,
    _tracking_found: tracking !== '',
    _tracking_source: 'board',
    _reason: tracking ? '' : 'no tracking number pasted on the row'
  })
}];
