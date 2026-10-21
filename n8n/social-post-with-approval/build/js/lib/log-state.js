// ---- log state (shared) -------------------------------------------------------------------
// Inlined by build.mjs into "resolve todays state" (01), "find the pending draft" and "is the
// weekly report due?" (02). The Log tab is append-only, so a row is never updated to say a
// draft is finished. Instead a later row CLOSES it, by carrying the same message id:
//
//   awaiting      opens a draft (one Discord message id)
//   posted        closes it — it is on the page
//   cancelled     closes it — a reviewer said no; 01 drafts again the same day
//   expired       closes it — nobody answered within APPROVAL_EXPIRES_HOURS
//   superseded    closes it — an edit was accepted and re-delivered as a new message
//   failed        closes it — LinkedIn refused it for a reason that will not fix itself
//
// and three statuses that annotate an open draft without closing it:
//
//   edit-refused  an edit failed the caption rules; the original is still open
//   alert         the LinkedIn token was rejected; the approval is still open
//   report        the weekly report went out (not about a draft at all)
//
// An open draft is an `awaiting` row that no later closing row names. Reading "awaiting" as
// "open" is what made a second day's draft look like a conflict with the first.

const CLOSING = ['posted', 'cancelled', 'expired', 'superseded', 'failed'];

function cleanRows(raw, L) {
  const norm = (v) => String(v === undefined || v === null ? '' : v).trim();
  return raw
    .filter((r) => r && (norm(r[L.date]) || norm(r[L.slug])))
    .map((r, i) => ({
      date: norm(r[L.date]),
      slug: norm(r[L.slug]),
      slot: Number(r[L.slot]) || 0,
      status: norm(r[L.status]).toLowerCase(),
      channel_id: norm(r[L.channel_id]),
      message_id: norm(r[L.message_id]),
      reply_id: norm(r[L.reply_id]),
      caption_fp: norm(r[L.caption_fp]),
      pillar: norm(r[L.pillar]),
      hook: norm(r[L.hook]),
      urn: norm(r[L.urn]),
      note: norm(r[L.note]),
      at: norm(r[L.at]),
      _i: i
    }));
}

function openDrafts(rows) {
  const closed = new Set(rows.filter((r) => CLOSING.includes(r.status) && r.message_id)
    .map((r) => r.message_id));
  return rows.filter((r) => r.status === 'awaiting' && !(r.message_id && closed.has(r.message_id)));
}

function ageHours(row) {
  const t = Date.parse(row.at);
  return isNaN(t) ? 0 : (Date.now() - t) / 3600000;
}

function daysBetween(a, b) {
  const x = Date.parse(a + 'T00:00:00Z');
  const y = Date.parse(b + 'T00:00:00Z');
  if (isNaN(x) || isNaN(y)) return Infinity;
  return Math.round(Math.abs(y - x) / 86400000);
}

// Everything that actually went out, newest first.
function postedHistory(rows) {
  return rows.filter((r) => r.status === 'posted')
    .map((r) => ({ date: r.date, slug: r.slug, slot: r.slot, pillar: r.pillar, hook: r.hook, urn: r.urn, at: r.at }))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

function recentHooks(history, today, days) {
  return history.filter((h) => h.hook && daysBetween(h.date, today) <= days)
    .map((h) => ({ hook: h.hook, slug: h.slug, date: h.date }));
}

// Local calendar date, weekday and hour in the configured timezone. Intl rather than
// toISOString: a job at 08:00 Singapore is still "yesterday" in UTC.
function localParts(date, tz) {
  const f = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
    hour: '2-digit', hourCycle: 'h23'
  });
  const p = {};
  for (const part of f.formatToParts(date)) p[part.type] = part.value;
  const days = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return {
    date: p.year + '-' + p.month + '-' + p.day,
    weekday: days[p.weekday] || 0,
    weekday_name: p.weekday,
    hour: Number(p.hour) || 0
  };
}
// ---- end log state ------------------------------------------------------------------------
