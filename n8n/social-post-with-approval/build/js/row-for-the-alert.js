// Record that the alert went out, without closing the draft.
//
// `alert` is not a closing status. The approval stays open, so a refreshed token publishes it
// on the next poll; this row only exists so the next poll knows not to alert again yet.

const cfg = $('config').first().json;
const a = $('build the LinkedIn alert').first().json;
const L = cfg.log_columns;
const sent = $json || {};

const row = {};
row[L.date] = a._date;
row[L.slug] = a._slug;
row[L.slot] = a._slot;
row[L.status] = 'alert';
row[L.channel_id] = a._channel_id;
row[L.message_id] = a._message_id;
row[L.reply_id] = String(sent.id || '');
row[L.caption_fp] = a._caption_fp_now || '';
row[L.pillar] = a._pillar || '';
row[L.hook] = '';
row[L.urn] = '';
row[L.note] = ('LinkedIn ' + a._kind + ': ' + a._reason).slice(0, 900);
row[L.at] = new Date().toISOString();

return [{ json: Object.assign(row, {
  _status: 'alert', _slug: a._slug, _token_problem: true, _reason: a._reason
}) }];
