// Two rows, appended together, that move the approval onto the revised draft.
//
//   superseded  closes the ORIGINAL draft's message id, and records the edit's Reply id
//   awaiting    opens the REVISED draft's message id, with the new caption fingerprint
//
// After this, "find the pending draft" sees exactly one open draft — the revision — and the
// gate anchors on its message, so nothing said about the old one can approve the new one.
// Written only after Discord returned the new message id; a revision that was not delivered
// must not close the draft the reviewer can still see.

const cfg = $('config').first().json;
const e = $('check the edited caption').first().json;
const L = cfg.log_columns;

const sent = $json || {};
const newId = String(sent.id || (sent.message && sent.message.id) || '');
const now = new Date().toISOString();

const base = (status) => {
  const r = {};
  r[L.date] = e._date;
  r[L.slug] = e._slug;
  r[L.slot] = e._slot;
  r[L.status] = status;
  r[L.channel_id] = e._channel_id;
  r[L.pillar] = e._pillar || '';
  r[L.urn] = '';
  r[L.at] = now;
  return r;
};

if (!newId) {
  return [{
    json: {
      _stopped_hint: 'revision not confirmed',
      _reason: 'Discord returned no message id for the revised draft, so the original is left '
        + 'open and nothing is logged',
      _rows: 0
    }
  }];
}

const closeOld = Object.assign(base('superseded'), {
  [L.message_id]: e._message_id,
  [L.reply_id]: e._reply_id,
  [L.caption_fp]: e._caption_fp_now || e._caption_fp || '',
  [L.hook]: '',
  [L.note]: ('edited by ' + e._approver + '; re-delivered as message ' + newId).slice(0, 900)
});

const openNew = Object.assign(base('awaiting'), {
  [L.message_id]: newId,
  [L.reply_id]: '',
  [L.caption_fp]: e._caption_fp,
  [L.hook]: e._hook,
  [L.note]: ('revised draft from an edit by ' + e._approver + ', ' + e._caption_words
    + ' words, passed the caption rules').slice(0, 900)
});

return [closeOld, openNew].map((row) => ({
  json: Object.assign(row, { _status: row[L.status], _slug: e._slug, _reason: e._reason })
}));
