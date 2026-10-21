// STOP: no live sheet to read last week from.
//
// Either SHEET_ID is blank, or this is the demo pipeline — fabricated numbers are never
// compared with, or written into, a real sheet. The demo carries last week's row in its
// fixture so the comparison can still be watched; a real run without a sheet simply has
// no baseline, and the report says that instead of inventing one.
const cfg = $('config').first().json;
const pipeline = $('one pipeline').first().json;
const demo = pipeline.source === 'demo' ? pipeline._demo_baseline : null;

return [{
  json: {
    baseline: demo || null,
    baseline_source: demo ? 'demo fixture (last week, fabricated)'
      : !cfg.sheet_enabled ? 'no SHEET_ID — nothing to compare with'
      : 'demo data is never compared with a real sheet',
    history_rows: 0
  }
}];
