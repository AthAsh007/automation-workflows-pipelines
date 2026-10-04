// The row that closes the day.
//
// One row per outcome, appended — the log is never rewritten in place. `posted` is what
// silences tomorrow's duplicate check; `cancelled` is what lets workflow 01 draft again the
// same day; `expired` closes a draft nobody answered without claiming it went out.
//
// The bank row's State is updated separately, and only on a real publish. A cancelled post
// stays `ready` on purpose: cancelling means "not this one, now", not "never".

const cfg = $('config').first().json;
const L = cfg.log_columns;
const d = $json;

const status = d._outcome === 'POSTED' ? 'posted'
  : d._decision === 'cancel' ? 'cancelled'
  : d._expired ? 'expired'
  : d._outcome === 'DUPLICATE' ? 'posted'
  : 'failed';

const row = {};
row[L.date] = d._date || '';
row[L.slug] = d._slug || '';
row[L.slot] = d._slot || '';
row[L.status] = status;
row[L.channel_id] = d._channel_id || cfg.channel_id;
row[L.message_id] = d._message_id || '';
row[L.caption_fp] = d._caption_fp_now || d._caption_fp || '';
row[L.urn] = d._urn || '';
row[L.note] = [
  d._approver ? 'by ' + d._approver : '',
  d._said ? '"' + d._said + '"' : '',
  d._reason || ''
].filter(Boolean).join(' — ').slice(0, 900);
row[L.at] = new Date().toISOString();

return [{ json: Object.assign(row, { _status: status, _reason: d._reason }) }];
