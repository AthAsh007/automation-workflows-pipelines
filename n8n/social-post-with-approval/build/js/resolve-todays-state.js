// Resolve today's state BEFORE anything is generated.
//
// A date is in exactly one of four states, and the LOG is what decides — never the presence
// of a file, a rendered image or a Discord message:
//
//   nothing yet        no posted/cancelled/awaiting row for today   -> draft it
//   awaiting approval  an `awaiting` row for today                  -> silent, one is pending
//   posted             a `posted` row for today                     -> silent, done for the day
//   cancelled          a `cancelled` row for today, nothing pending -> draft again
//
// Two rules that must not be reintroduced:
//
//   * A rendered image is NOT evidence of a post. It is written at draft time. Treating
//     "output exists" as "already posted" makes a cancelled day unrecoverable.
//   * There is NO cascade rule. "The previous run was silent, so this one is too" is
//     self-perpetuating with nothing to clear it. A run is silent because TODAY's state
//     says so, and for no other reason.
//
// Input: every row of the Log tab (or no rows at all, in demo mode).
// Output: exactly one item. Always emits, so the run reaches a named STOP rather than
// ending on a green tick with nothing said.

const cfg = $('config').first().json;
const L = cfg.log_columns;

// Local calendar date and weekday, in the configured timezone. Doing this with Intl rather
// than toISOString matters: a job that fires at 08:00 Singapore is still "yesterday" in UTC,
// and the log would gain two rows for what a reader sees as one day.
function localParts(date, tz) {
  const f = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short'
  });
  const p = {};
  for (const part of f.formatToParts(date)) p[part.type] = part.value;
  const days = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return {
    date: p.year + '-' + p.month + '-' + p.day,
    weekday: days[p.weekday] || 0,
    weekday_name: p.weekday
  };
}

const now = new Date();
const today = localParts(now, cfg.timezone || 'UTC');

const rows = items
  .map((i) => i.json)
  .filter((r) => r && (r[L.date] || r[L.slug]));

const norm = (v) => String(v === undefined || v === null ? '' : v).trim();
const todays = rows.filter((r) => norm(r[L.date]) === today.date);

const statusOf = (r) => norm(r[L.status]).toLowerCase();
const posted = todays.filter((r) => statusOf(r) === 'posted');
const awaiting = todays.filter((r) => statusOf(r) === 'awaiting');
const cancelled = todays.filter((r) => statusOf(r) === 'cancelled');

// Every slug that has ever been published, so the picker can never re-draft one. This is
// read across the whole log, not just today.
const posted_slugs = rows
  .filter((r) => statusOf(r) === 'posted')
  .map((r) => norm(r[L.slug]))
  .filter(Boolean);

// The order posts actually went out in — what a reader saw, which is what the no-repeat
// window is really measured against.
const posted_history = rows
  .filter((r) => statusOf(r) === 'posted')
  .map((r) => ({ date: norm(r[L.date]), slug: norm(r[L.slug]), slot: Number(r[L.slot]) || 0 }))
  .sort((a, b) => (a.date < b.date ? 1 : -1))
  .slice(0, 20);

let draftable = true;
let reason = '';

if (!cfg.publish_days.includes(today.weekday)) {
  draftable = false;
  reason = today.weekday_name + ' is not a publishing day (PUBLISH_DAYS is '
    + cfg.publish_days.join(', ') + ')';
} else if (posted.length) {
  draftable = false;
  reason = 'already posted today: ' + (norm(posted[0][L.slug]) || 'unknown slug');
} else if (posted.length >= cfg.daily_cap) {
  draftable = false;
  reason = 'daily cap of ' + cfg.daily_cap + ' already reached';
} else if (awaiting.length) {
  // Not an error and not a failure. Someone has a draft in front of them and has not
  // answered yet; drafting a second one is how two posts go out on one day.
  draftable = false;
  reason = 'a draft is already awaiting approval: ' + (norm(awaiting[0][L.slug]) || 'unknown slug')
    + ' (message ' + (norm(awaiting[0][L.message_id]) || 'unknown') + ')';
} else if (cancelled.length) {
  // Deliberately draftable. A cancelled draft means the reviewer wanted a different post,
  // not that the day is over.
  reason = 'today was cancelled earlier — drafting again';
}

return [{
  json: {
    _today: today.date,
    _weekday: today.weekday,
    _weekday_name: today.weekday_name,
    _draftable: draftable,
    _reason: reason,
    _posted_slugs: posted_slugs,
    _posted_history: posted_history,
    _log_rows: rows.length,
    _mode: cfg.mode
  }
}];
