// The Sheets node replaces the item with its own write result, so without this the
// run summary would have nothing left to name a row by. Re-attach the record and
// hand a small item back to the loop.
const cfg = $('config').first().json;
const rec = $('prepare sheet update').first().json;

return [{
  json: {
    _outcome:     rec._outcome,
    _row_id:      rec._row_id,
    _business:    rec._business,
    _email:       rec._email,
    _domain:      rec._domain,
    _subject:     rec._subject,
    _sent_to:     rec._sent_to,
    _copy_source: rec._copy_source,
    _skip_reason: rec._skip_reason,
    _written:     cfg.live_send === true
  }
}];
