// STOP: the reply outcomes were not written back.
//
// Reportable, not quiet. In particular the suppressions did not land, which means the next
// run could email somebody who asked not to be emailed. That is the one failure in this
// engine with a legal edge on it, so it is named in the summary rather than counted.
const cfg = $('config').first().json;
const items = $input.all();
const suppressions = (items[0] && items[0].json._suppression_adds) || [];

return items.map(function (item) {
  return { json: Object.assign({}, item.json, {
    logged: false,
    log_gap: item.json.writes_back === true,
    log_reason: cfg.airtable_enabled
      ? 'logging is off in this mode'
      : 'Airtable is not configured — nothing was written back' +
        (suppressions.length
          ? ', including ' + suppressions.length + ' suppression(s) that must be added by hand'
          : '')
  }) };
});
