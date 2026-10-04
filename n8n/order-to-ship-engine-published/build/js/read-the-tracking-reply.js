// Maps the ShipStation reply onto the row. ShipStation's response shape changes between
// API versions, so the lookup is by common field names rather than one fixed path — the
// endpoint itself is the integration point to confirm on the live account (see README).
function dig(obj, keys, depth) {
  if (!obj || typeof obj !== 'object' || depth > 5) return '';
  for (const key of keys) {
    if (obj[key] != null && String(obj[key]) !== '') return String(obj[key]);
  }
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (v && typeof v === 'object') {
      const hit = dig(v, keys, depth + 1);
      if (hit) return hit;
    }
  }
  return '';
}

const cfg = $('config').first().json;
const cols = cfg.columns || {};
const h = (k) => cols[k] || k;
const item = $input.first().json;
const body = (item && typeof item === 'object') ? item : {};

const tracking = dig(body, ['trackingNumber', 'tracking_number', 'tracking']);
const carrier = dig(body, ['carrierCode', 'carrier_code', 'carrier']);
const shipDate = dig(body, ['shipDate', 'ship_date']);

const found = tracking !== '';
return [{
  json: Object.assign({}, item, {
    carrier: found ? carrier : '',
    tracking: found ? tracking : '',
    ship_date: found ? shipDate : '',
    _tracking_found: found,
    _tracking_source: 'shipstation',
    _reason: found ? '' : 'ShipStation returned no shipment for this order number'
  })
}];
