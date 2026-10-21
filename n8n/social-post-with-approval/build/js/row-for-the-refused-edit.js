// The refusal is recorded against the draft WITHOUT closing it.
//
// `edit-refused` is not a closing status: the original draft stays open and can still be
// approved, cancelled or edited again. The row carries the edit's message id as Reply id, which
// is what stops the next poll from refusing — and replying about — the same edit again.

const cfg = $('config').first().json;
const e = $('check the edited caption').first().json;
const L = cfg.log_columns;

const row = {};
row[L.date] = e._date;
row[L.slug] = e._slug;
row[L.slot] = e._slot;
row[L.status] = 'edit-refused';
row[L.channel_id] = e._channel_id;
row[L.message_id] = e._message_id;
row[L.reply_id] = e._reply_id;
row[L.caption_fp] = e._caption_fp_now || '';
row[L.pillar] = e._pillar || '';
row[L.hook] = '';
row[L.urn] = '';
row[L.note] = ('edit by ' + e._approver + ' refused: ' + (e._problems || []).join('; ')).slice(0, 900);
row[L.at] = new Date().toISOString();

return [{ json: Object.assign(row, { _status: 'edit-refused', _slug: e._slug, _reason: e._reason }) }];
