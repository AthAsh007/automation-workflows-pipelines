// No stock sheet configured, so the built-in demo stock stands in. Same shape the sheet
// read produces, so everything downstream is identical whichever branch ran.
const cfg = $('config').first().json;
return [{ json: { source: 'demo stock (invented)', rows: cfg.demo_stock } }];
