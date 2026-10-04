// Find the draft that is waiting on a human, if there is one.
//
// The log is the source of truth. Exactly one row may be `awaiting` at a time — workflow 01
// refuses to draft while one is open — so this either finds one or finds nothing.
//
// It also decides whether that draft is still approvable. A draft goes stale: the day moves
// on, the claims in it may not have, and an approval typed against yesterday's post at
// lunchtime today publishes something nobody re-read. After APPROVAL_EXPIRES_HOURS it is
// marked expired instead.
//
// Input: every row of the Log tab. Output: exactly one item, always.

const cfg = $('config').first().json;
const L = cfg.log_columns;

const norm = (v) => String(v === undefined || v === null ? '' : v).trim();

const rows = items.map((i) => i.json).filter((r) => r && (r[L.date] || r[L.slug]));

// Rows are appended, so the last `awaiting` is the current one. A log that somehow holds two
// is a real problem worth seeing rather than quietly picking one.
const awaiting = rows.filter((r) => norm(r[L.status]).toLowerCase() === 'awaiting');

if (!awaiting.length) {
  return [{
    json: {
      _has_pending: false,
      _reason: 'no draft is awaiting approval — ' + rows.length + ' log row(s), none open'
    }
  }];
}

if (awaiting.length > 1) {
  return [{
    json: {
      _has_pending: false,
      _conflict: true,
      _reason: awaiting.length + ' drafts are marked awaiting at once: '
        + awaiting.map((r) => norm(r[L.date]) + ' ' + norm(r[L.slug])).join(', ')
        + '. Workflow 01 only opens one at a time, so the log has been edited by hand or a '
        + 'run was interrupted mid-write. Resolve it in the sheet — do not publish either.'
    }
  }];
}

const row = awaiting[0];
const at = norm(row[L.at]);
const openedAt = at ? Date.parse(at) : NaN;
const ageHours = isNaN(openedAt) ? 0 : (Date.now() - openedAt) / 3600000;
const expired = !isNaN(openedAt) && ageHours > cfg.approval_expires_hours;

// The message the draft went out in is the anchor. Without it there is nothing to scan
// forward from, and a channel-wide search for the word "post" is exactly the ambiguity the
// dedicated-channel rule exists to prevent.
const messageId = norm(row[L.message_id]);
const channelId = norm(row[L.channel_id]) || cfg.channel_id;

return [{
  json: {
    _has_pending: !expired && messageId !== '',
    _expired: expired,
    _date: norm(row[L.date]),
    _slug: norm(row[L.slug]),
    _slot: Number(row[L.slot]) || 0,
    _message_id: messageId,
    _channel_id: channelId,
    _caption_fp: norm(row[L.caption_fp]),
    _age_hours: Math.round(ageHours * 10) / 10,
    _reason: expired
      ? 'the draft for ' + norm(row[L.slug]) + ' has been open ' + Math.round(ageHours)
        + ' hours, past the ' + cfg.approval_expires_hours + ' hour limit. Marked expired '
        + 'rather than published — re-run workflow 01 for a fresh one.'
      : messageId === ''
        ? 'the awaiting row for ' + norm(row[L.slug]) + ' has no message id, so there is no '
          + 'Discord message to read a reply from'
        : 'draft ' + norm(row[L.slug]) + ' has been awaiting approval for '
          + Math.round(ageHours * 10) / 10 + ' hours'
  }
}];
