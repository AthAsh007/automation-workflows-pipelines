// The sheet is only written live. These opt-outs were NOT recorded; in live mode they would be.
const cfg = $('config').first().json;
return [{ json: {
  _outcome: 'preview: opt-outs not recorded',
  _reason: cfg.sheet_enabled ? 'mode is ' + cfg.mode + '; the sheet is only written live' : 'no SHEET_ID',
  would_write: $input.all().map((i) => i.json)
} }];
