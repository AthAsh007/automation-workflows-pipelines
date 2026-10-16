// The Customers tab, one item per row, collected into one item in the same shape as the demo.
const customers = $input.all().map((i) => i.json || {}).filter((r) => String(r.whatsapp || '').trim() !== '');
return [{ json: { source: 'customers sheet', customers } }];
