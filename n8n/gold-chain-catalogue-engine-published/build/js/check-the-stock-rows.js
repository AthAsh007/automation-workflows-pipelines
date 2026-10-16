// Every row is checked before anything is priced. A row that cannot be priced honestly
// (no weight, a karat with no purity, a style with no making charge) is HELD BACK with its
// reason, never priced on a guess and never silently dropped.
const cfg = $('config').first().json;
const src = $input.first().json || {};
//@include lib-pricing.js

const ok = [], held = [];
for (const raw of src.rows || []) {
  const r = readRow(raw);
  const why = [];
  if (!r.sku) why.push('no sku');
  if (!cfg.styles[r.style]) why.push('style "' + r.style + '" is not in STYLES');
  if (!cfg.purity[r.purity_k]) why.push((isNaN(r.purity_k) ? 'no karat' : r.purity_k + 'k') + ' is not in the PURITY table');
  if (!(r.weight_g > 0)) why.push('no weight');
  if (!(r.qty >= 0)) why.push('no quantity');
  if (why.length) held.push({ sku: r.sku || '(blank)', reasons: why.join('; ') });
  else ok.push(r);
}

// The rate the last published list was priced at: the median of the rows' `rate` column, so
// one hand-edited cell cannot move it.
const rates = ok.map((r) => r.prev_rate).filter((v) => v > 0).sort((a, b) => a - b);
const last_rate = rates.length ? rates[Math.floor(rates.length / 2)] : null;

return [{ json: { source: src.source, rows: ok, held, last_rate } }];
