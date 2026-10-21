// STOP: nothing is written down.
//
// Either SHEET_ID is blank, or the run is on the demo pipeline — fabricated deals are never
// written into a real dashboard. The numbers were still computed, compared with last week
// and are still posted to chat. This is the shape a first demo runs in.
const cfg = $('config').first().json;
const k = $('compare with last week').first().json;

return [{
  json: Object.assign({}, k, {
    written: false,
    held_because: cfg.sheet_enabled
      ? 'demo pipeline — fabricated numbers are never written into a real sheet'
      : 'SHEET_ID is blank in config — the dashboard was computed but not stored'
  })
}];
