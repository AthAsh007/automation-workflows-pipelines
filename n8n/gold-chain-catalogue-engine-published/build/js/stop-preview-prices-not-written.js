// The sheet is only written live (TEST_RUN = false and a SHEET_ID set). Nothing was written;
// this is exactly what would have been.
const j = $('build the catalogue').first().json;
const cfg = $('config').first().json;
return [{ json: {
  _outcome: 'preview: sheet not written',
  _reason: cfg.sheet_enabled ? 'mode is ' + cfg.mode + '; the sheet is only written live'
                             : 'no SHEET_ID, running on the demo stock',
  would_write: j.chains.map((c) => ({ sku: c.sku, price: c.price, rate: j.rate_24k, priced_qty: c.qty, priced_at: j.today }))
} }];
