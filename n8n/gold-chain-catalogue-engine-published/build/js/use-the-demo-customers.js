// No sheet configured, so the invented demo customers stand in, in the same shape as the sheet.
const cfg = $('config').first().json;
return [{ json: { source: 'demo customers (invented)', customers: cfg.demo_customers } }];
