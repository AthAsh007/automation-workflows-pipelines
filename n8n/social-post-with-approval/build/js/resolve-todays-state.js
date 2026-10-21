// Resolve today's state BEFORE anything is generated.
//
// A date is in exactly one of four states, and the LOG is what decides — never the presence
// of a file, a rendered image or a Discord message:
//
//   nothing yet        no posted row today, no open draft            -> draft it
//   awaiting approval  an OPEN draft (any day) that has not expired  -> silent, one is pending
//   posted             a `posted` row for today                      -> silent, done for the day
//   cancelled          today's draft was closed by `cancelled`       -> draft again
//
// "Open" is the rule in the shared log-state block below: an `awaiting` row that no later row
// closes. Counting every `awaiting` row ever written would make a cancelled day look pending
// forever, because the log is append-only and the original row never goes away.
//
// Two rules that must not be reintroduced:
//
//   * A rendered image is NOT evidence of a post. It is written at draft time.
//   * There is NO cascade rule. A run is silent because TODAY's state says so, and for no
//     other reason.
//
// Input: every row of the Log tab (or the demo log). Output: exactly one item, always.

// @include lib/log-state.js

const cfg = $('config').first().json;
const L = cfg.log_columns;

const today = localParts(new Date(), cfg.timezone || 'UTC');
const rows = cleanRows(items.map((i) => i.json || {}), L);

const todays = rows.filter((r) => r.date === today.date);
const posted = todays.filter((r) => r.status === 'posted');
const cancelled = todays.filter((r) => r.status === 'cancelled');

const open = openDrafts(rows);
const live = open.filter((r) => ageHours(r) <= cfg.approval_expires_hours);
const stale = open.filter((r) => ageHours(r) > cfg.approval_expires_hours);

const history = postedHistory(rows);

let draftable = true;
let reason = '';

// The demo bank ignores PUBLISH_DAYS so a reviewer importing this on a Saturday still sees the
// whole draft path. It is forced into preview, so it cannot publish on any day.
if (!cfg.publish_days.includes(today.weekday) && !cfg.using_demo_bank) {
  draftable = false;
  reason = today.weekday_name + ' is not a publishing day (PUBLISH_DAYS is '
    + cfg.publish_days.join(', ') + ')';
} else if (posted.length >= cfg.daily_cap) {
  draftable = false;
  reason = 'already posted today: ' + (posted[0].slug || 'unknown slug');
} else if (live.length) {
  // Not an error. Someone has a draft in front of them; a second one is how two posts go out
  // on one day.
  draftable = false;
  reason = 'a draft is already awaiting approval: ' + (live[0].slug || 'unknown slug')
    + ' (message ' + (live[0].message_id || 'unknown') + ', open '
    + Math.round(ageHours(live[0])) + 'h)';
} else if (cancelled.length) {
  // Deliberately draftable. A cancelled draft means "a different post", not "no post today".
  reason = 'today was cancelled earlier — drafting again';
} else if (stale.length) {
  // Workflow 02 marks it expired on its next poll. It is not approvable any more, so it does
  // not block today.
  reason = 'the open draft for ' + stale[0].slug + ' is past APPROVAL_EXPIRES_HOURS and will be '
    + 'marked expired — drafting a fresh one';
}

return [{
  json: {
    _today: today.date,
    _weekday: today.weekday,
    _weekday_name: today.weekday_name,
    _draftable: draftable,
    _reason: reason,
    _posted_slugs: history.map((h) => h.slug).filter(Boolean),
    _posted_history: history.slice(0, 30),
    _recent_hooks: recentHooks(history, today.date, cfg.hook_lookback_days),
    _open_drafts: open.length,
    _log_rows: rows.length,
    _mode: cfg.mode
  }
}];
