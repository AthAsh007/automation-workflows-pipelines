// The weekly report was posted, but SHEET_ID is blank, so the `report` row that stops it
// being posted twice this week was not written. Only reachable with a webhook set and no sheet.
const cfg = $('config').first().json;
const s = $json;

return [{
  json: {
    _stopped: 'demo - report not logged',
    _mode: cfg.mode,
    _reason: '[DEMO] the report was posted but there is no Log tab to record it in',
    _would_write: s,
    _at: new Date().toISOString()
  }
}];
