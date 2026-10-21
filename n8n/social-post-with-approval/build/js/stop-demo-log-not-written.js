// SHEET_ID is blank, so there is no Log tab to append to.
//
// The row that WOULD have been written is the input to this node — open it to see exactly what
// the sheet would have gained. With a sheet configured this branch is never taken.
const cfg = $('config').first().json;
const rows = items.map((i) => i.json);

return [{
  json: {
    _stopped: 'demo - log row not written',
    _mode: cfg.mode,
    _would_write: rows,
    _status: rows.map((r) => r[cfg.log_columns.status]).join(', '),
    _slug: (rows[0] || {})[cfg.log_columns.slug] || '',
    _reason: '[DEMO] SHEET_ID is blank, so ' + rows.length + ' log row(s) were built but not '
      + 'written: ' + rows.map((r) => r[cfg.log_columns.status]).join(', '),
    _at: new Date().toISOString()
  }
}];
