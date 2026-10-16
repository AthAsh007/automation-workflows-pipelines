// The sheet hands back one item per row. Collected into one item here so the rest of the run
// reads the stock the same way it reads the demo stock.
const rows = $input.all().map((i) => i.json || {}).filter((r) => String(r.sku || '').trim() !== '');
return [{ json: { source: 'stock sheet', rows } }];
