// goldapi.io answers with the spot price. Only the 24k price per gram is used; purity is
// applied in code, from the PURITY table, so the maths is the same whichever source the rate
// came from. goldapi.io has shipped more than one response shape, so this accepts each of them
// and, failing all, derives the gram price from the troy-ounce `price`. A reply with none of
// these gives 0, which `price every chain` refuses rather than prices on.
const cfg = $('config').first().json;
const r = $input.first().json || {};
const TROY_OUNCE_G = 31.1034768;
const pick = (...vals) => vals.map(Number).find((v) => v > 0) || 0;
const perGram = pick(
  r.price_gram_24k,
  r.melt_price_per_gram && (r.melt_price_per_gram['24k'] || r.melt_price_per_gram.k24),
  r.price_per_unit && r.price_per_unit.gram
) || (Number(r.price) > 0 ? Number(r.price) / TROY_OUNCE_G : 0);
return [{ json: {
  rate_24k: Math.round(perGram * 100) / 100,
  currency: String(r.currency || cfg.currency).toUpperCase(),
  rate_source: 'goldapi.io ' + (r.timestamp ? new Date(r.timestamp * 1000).toISOString() : 'today')
} }];
