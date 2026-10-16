// An opt-out is written to the Customers tab, matched on the number, so workflow 01 never
// messages them again. Nothing else on the row is touched.
return $('decide the reply').all()
  .filter((i) => i.json.opt_out_record)
  .map((i) => ({ json: i.json.opt_out_record }));
