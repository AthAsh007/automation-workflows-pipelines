// ---- shared pricing (build/js/lib-pricing.js, inlined by build.js) ----
// One definition of "what a chain costs today", used by the repricing run and by every
// WhatsApp answer, so a price quoted in chat can never disagree with the price list.

function num(v) {
  if (v === null || v === undefined) return NaN;
  const s = String(v).replace(/[^0-9.\-]/g, '');
  return s === '' ? NaN : Number(s);
}

// A row the way a sheet or the demo hands it over, into one typed shape. Nothing is guessed:
// a value that does not parse stays NaN and the check step says so.
function readRow(r) {
  return {
    sku:        String(r.sku || '').trim(),
    style:      String(r.style || '').trim().toLowerCase(),
    purity_k:   num(r.purity_k),
    length_in:  num(r.length_in),
    weight_g:   num(r.weight_g),
    qty:        num(r.qty),
    prev_price: num(r.price),
    prev_rate:  num(r.rate),
    prev_qty:   num(r.priced_qty),
    priced_at:  String(r.priced_at || '').trim()
  };
}

function priceChain(row, rate24, cfg) {
  const purity = cfg.purity[row.purity_k];
  const style = cfg.styles[row.style];
  const metal = row.weight_g * purity * rate24;
  const making = row.weight_g * style.making_per_gram;
  const gross = (metal + making) * (1 + cfg.wholesale_margin_pct / 100);
  const step = cfg.round_to || 1;
  return {
    metal_value: Math.round(metal * 100) / 100,
    making_value: Math.round(making * 100) / 100,
    price: Math.round(gross / step) * step
  };
}

function money(v, cfg) {
  return cfg.currency_symbol + Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function chainLabel(row, cfg) {
  const style = cfg.styles[row.style];
  return row.purity_k + 'k ' + (style ? style.label : row.style) + ' ' + row.length_in + 'in';
}
// ---- end shared pricing ----
