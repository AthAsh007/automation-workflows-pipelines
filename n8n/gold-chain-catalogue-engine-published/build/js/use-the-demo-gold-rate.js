// No gold-rate key configured, so the invented demo rate stands in. It is labelled as such
// everywhere it appears, so a demo list can never be mistaken for a real one.
const cfg = $('config').first().json;
return [{ json: { rate_24k: cfg.demo_gold_rate, currency: cfg.currency,
  rate_source: 'DEMO rate (not a market price)' } }];
