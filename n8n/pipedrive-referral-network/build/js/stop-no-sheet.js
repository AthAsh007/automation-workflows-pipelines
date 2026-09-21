// STOP: no sheet id, so nothing is written down.
//
// The numbers were still computed and are still posted to chat. This is the shape a first
// demo runs in: the dashboard is real, it just has nowhere permanent to live yet.
const k = $('compute the KPIs').first().json;

return [{
  json: Object.assign({}, k, {
    written: false,
    held_because: 'SHEET_ID is blank in config — the dashboard was computed but not stored'
  })
}];
