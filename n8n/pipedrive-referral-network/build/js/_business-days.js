// ---- business-day calendar (WORK_DAYS + HOLIDAYS from config). Inlined by build/build.mjs
// into every node that counts days, so "3 days overdue" means the same thing everywhere.
function businessCalendar(c) {
  const DAY = 86400000;
  const work = (c.work_days && c.work_days.length) ? c.work_days : [1, 2, 3, 4, 5];
  const holidays = {};
  (c.holidays || []).forEach(function (h) { holidays[String(h).slice(0, 10)] = true; });
  function ymd(ms) { return new Date(ms).toISOString().slice(0, 10); }
  function dayStart(ms) { return Date.parse(ymd(ms) + 'T00:00:00Z'); }
  function isWorkday(ms) {
    return work.indexOf(new Date(ms).getUTCDay()) !== -1 && !holidays[ymd(ms)];
  }
  // n business days after the day of `ms`. n = 0 means "today, or the next workday".
  function add(ms, n) {
    let t = dayStart(ms);
    let left = Math.max(0, Math.round(Number(n) || 0));
    let guard = 0;
    while (left > 0 && guard++ < 3660) { t += DAY; if (isWorkday(t)) left--; }
    while (!isWorkday(t) && guard++ < 3660) t += DAY;
    return t;
  }
  // Business days that have passed between the day of `from` and the day of `to`.
  // Due Friday, asked Monday = 1, not 3.
  function between(from, to) {
    let t = dayStart(from);
    const end = dayStart(to);
    let n = 0;
    let guard = 0;
    while (t < end && guard++ < 3660) { t += DAY; if (isWorkday(t)) n++; }
    return n;
  }
  return { DAY: DAY, ymd: ymd, dayStart: dayStart, isWorkday: isWorkday, add: add,
    between: between };
}
