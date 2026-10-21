// Find the draft that is waiting on a human, and decide what state it is in.
//
// The log is append-only, so "waiting" is computed, not stored: an `awaiting` row is OPEN until
// a later row closes it by carrying the same message id (posted, cancelled, expired,
// superseded, failed — see the shared block below). Treating every `awaiting` row as open was
// the old rule, and it turned the second day's draft into a permanent conflict with the first.
//
// _draft_state, which the Switch after this node routes on:
//
//   open      exactly one open draft, inside APPROVAL_EXPIRES_HOURS -> read the channel
//   expired   an open draft older than that -> closed with an `expired` row, never published.
//             The day has moved on and the claims in it may not have; an approval typed at
//             lunchtime tomorrow publishes something nobody re-read.
//   conflict  two live open drafts, or one with no message id -> stop and say so. Workflow 01
//             only opens one at a time, so the sheet was edited by hand or a write was cut off.
//   none      nothing open -> stop. Most polls end here, and that is correct.
//
// It also carries what the later nodes need from the log, so nothing downstream re-reads it:
// the reply ids already acted on for this draft (so a refused edit is answered once, not every
// five minutes), when the last LinkedIn alert went out, and the hooks recently published.
//
// Input: every row of the Log tab (or the demo log). Output: exactly one item, always.

// @include lib/log-state.js

const cfg = $('config').first().json;
const L = cfg.log_columns;

const rows = cleanRows(items.map((i) => i.json || {}), L);
const open = openDrafts(rows).sort((a, b) => (a.at < b.at ? -1 : 1));
const today = localParts(new Date(), cfg.timezone || 'UTC');
const hooks = recentHooks(postedHistory(rows), today.date, cfg.hook_lookback_days);

const expired = open.filter((r) => ageHours(r) > cfg.approval_expires_hours);
const live = open.filter((r) => ageHours(r) <= cfg.approval_expires_hours);

function carry(row, state, reason) {
  const mine = rows.filter((r) => r.message_id && r.message_id === row.message_id);
  const alerts = mine.filter((r) => r.status === 'alert').map((r) => r.at).sort();
  return {
    _draft_state: state,
    _has_pending: state === 'open',
    _expired: state === 'expired',
    _date: row.date,
    _slug: row.slug,
    _slot: row.slot,
    _pillar: row.pillar,
    _hook: row.hook,
    _message_id: row.message_id,
    _channel_id: row.channel_id || cfg.channel_id,
    _caption_fp: row.caption_fp,
    _opened_at: row.at,
    _age_hours: Math.round(ageHours(row) * 10) / 10,
    _handled_reply_ids: mine.map((r) => r.reply_id).filter(Boolean),
    _last_alert_at: alerts.length ? alerts[alerts.length - 1] : '',
    _recent_hooks: hooks,
    _open_drafts: open.length,
    _log_rows: rows.length,
    _reason: reason
  };
}

let out;
if (expired.length) {
  // Oldest first, one per run. If two are stale the next poll closes the second.
  const r = expired[0];
  out = carry(r, 'expired', 'the draft for ' + r.slug + ' has been open ' + Math.round(ageHours(r))
    + ' hours, past the ' + cfg.approval_expires_hours + ' hour limit. Marked expired rather '
    + 'than published; workflow 01 drafts a fresh one on its next run.');
} else if (live.length > 1) {
  out = carry(live[live.length - 1], 'conflict', live.length + ' drafts are open at once: '
    + live.map((r) => r.date + ' ' + r.slug + ' (' + r.message_id + ')').join(', ')
    + '. Workflow 01 only opens one at a time, so the log was edited by hand or a write was '
    + 'interrupted. Close the wrong one in the sheet (a `cancelled` row with its message id). '
    + 'Neither is published until then.');
} else if (live.length === 1 && !live[0].message_id) {
  out = carry(live[0], 'conflict', 'the open row for ' + live[0].slug + ' has no message id, so '
    + 'there is no Discord message to read a reply from. Add a `cancelled` row for it.');
} else if (live.length === 1) {
  out = carry(live[0], 'open', 'draft ' + live[0].slug + ' has been awaiting approval for '
    + Math.round(ageHours(live[0]) * 10) / 10 + ' hours');
} else {
  out = {
    _draft_state: 'none',
    _has_pending: false,
    _recent_hooks: hooks,
    _log_rows: rows.length,
    _reason: 'no draft is awaiting approval — ' + rows.length + ' log row(s), none open'
  };
}

return [{ json: out }];
