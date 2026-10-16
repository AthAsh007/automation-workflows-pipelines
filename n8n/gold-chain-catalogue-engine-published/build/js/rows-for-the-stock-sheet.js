// What gets written back to the Stock tab: today's price, rate and quantity, so the NEXT run
// can tell what is new and what sold out. Matched on sku; no other column is touched.
const j = $('build the catalogue').first().json;
return j.chains.map((c) => ({ json: {
  sku: c.sku, price: c.price, rate: j.rate_24k, priced_qty: c.qty, priced_at: j.today
} }));
