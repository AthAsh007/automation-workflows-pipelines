// No enrichment key, so the demo enrichment stands in: each invented prospect carries what the
// provider "would" have returned in `_demo`. The budget and the tier gate have already run,
// so the credits this run would have cost are exactly the rows arriving here.
//
// A real row (one without `_demo`) comes back "not enriched: no ENRICH_API_KEY", never with an
// invented address.
return $input.all().map((item) => {
  const p = Object.assign({}, item.json);
  const d = p._demo || {};
  if (d.email) p.email = String(d.email).toLowerCase();
  if (!p.phone && d.phone) p.phone = d.phone;
  p._enriched = !!p._demo;   // no credit is spent on a real row without a key
  p._enriched_by = p._demo ? 'demo enrichment (invented)' : 'none';
  p._enrich_result = p._demo ? (d.email ? 'email found' : 'no verified email found')
                             : 'not enriched: no ENRICH_API_KEY';
  delete p._enrich_body;
  return { json: p };
});
