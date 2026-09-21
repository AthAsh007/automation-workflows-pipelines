// The morning board run: one read of the whole Orders tab, classified in one place.
// Every row the office has flipped to 'Shipped' but that we have not yet emailed gets a
// shipping email; a 'Shipped' row with no confirmation recorded is HELD, never emailed —
// an order is never shipped unconfirmed, and the board is what proves the confirmation
// happened. Rows already emailed, still in production, or finished are left alone, so a
// run is idempotent: nothing is emailed twice.
const cfg = $('config').first().json;
const cols = cfg.columns || {};
const h = (k) => cols[k] || k;
const shipped = (cfg.stage_shipped || 'Shipped');

const toShip = [];
const unconfirmed = [];
let rowsRead = 0;

for (const row of $input.all().map((i) => i.json)) {
  const stage = String(row[h('stage')] || '').trim();
  if (!stage) continue;
  rowsRead++;
  const confirmed = String(row[h('confirmation_sent')] || '').trim();
  const emailed = String(row[h('ship_email_sent')] || '').trim();
  if (stage !== shipped) continue;                       // still in production, or finished
  if (!confirmed) { unconfirmed.push(row); continue; }   // flipped early — hold, do not email
  if (emailed) continue;                                 // already done — idempotent
  toShip.push(Object.assign({}, row, {
    _tracking_pasted: String(row[h('tracking')] || '').trim() !== ''
  }));
}

return [{
  json: {
    rows_read: rowsRead,
    to_ship: toShip,
    unconfirmed: unconfirmed,
    _has_to_ship: toShip.length > 0,
    _has_unconfirmed: unconfirmed.length > 0
  }
}];
