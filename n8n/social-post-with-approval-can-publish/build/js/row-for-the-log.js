// The log row that makes tomorrow's run correct.
//
// This is the state machine's only write. It records that a draft was delivered and is now
// waiting on a human — `awaiting` — along with the Discord message id, which is how workflow
// 02 finds the reply, and the caption fingerprint, which is how it proves the thing it is
// about to publish is the thing that was approved.
//
// Written AFTER the Discord delivery succeeds, never before. A row that says a draft is
// awaiting approval when no draft was ever delivered silences tomorrow's run too, and
// nothing ever clears it.

const cfg = $('config').first().json;
const p = $('build the approval message').first().json;
const L = cfg.log_columns;

// The Discord node returns the created message. Its id is the one thing from this response
// that matters — it is the anchor workflow 02 scans forward from.
const sent = $json || {};
const messageId = String(sent.id || (sent.message && sent.message.id) || '');

const row = {};
row[L.date] = p._today;
row[L.slug] = p.slug;
row[L.slot] = p.slot;
row[L.status] = 'awaiting';
row[L.channel_id] = cfg.channel_id;
row[L.message_id] = messageId;
row[L.caption_fp] = p._caption_fp;
row[L.urn] = '';
row[L.note] = 'delivered for approval in ' + cfg.mode + ' mode, ' + p._caption_words
  + ' words, caption from the ' + p._caption_source + ', ' + p._png_bytes + ' byte image';
row[L.at] = new Date().toISOString();

return [{
  json: Object.assign(row, {
    _message_id: messageId,
    _delivered: messageId !== '',
    _reason: messageId
      ? 'logged slot ' + p.slot + ' as awaiting approval (message ' + messageId + ')'
      : 'Discord returned no message id — the draft may not have been delivered, so nothing '
        + 'is being marked as awaiting'
  })
}];
