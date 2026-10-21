// Is this the poll that sends the weekly report?
//
// Due when, in TIMEZONE, it is REPORT_WEEKDAY at or after REPORT_HOUR, AND the log holds no
// `report` row for this week. The log row is the dedupe: the poll runs twelve times in the
// report hour and the report goes out on the first of them only. A report missed because n8n
// was down at 09:00 goes out on the first poll after it comes back, the same day.
//
// With the demo log (SHEET_ID blank) it is always due, so the report can be watched.
//
// It also collects what the report needs from the log — last 7 days of rows, and the post URNs
// to ask LinkedIn about — and builds the statistics request URL, so the HTTP node is a plain GET.

// @include lib/log-state.js

const cfg = $('config').first().json;
const L = cfg.log_columns;
const rows = cleanRows(items.map((i) => i.json || {}), L);

const now = localParts(new Date(), cfg.timezone || 'UTC');
// Monday of this week, as the week's key.
const monday = new Date(Date.parse(now.date + 'T00:00:00Z') - (now.weekday - 1) * 86400000)
  .toISOString().slice(0, 10);
const weekKey = 'report-' + monday;

const sentThisWeek = rows.some((r) => r.status === 'report' && r.slug === weekKey);
const rightTime = now.weekday === cfg.report_weekday && now.hour >= cfg.report_hour;
const due = cfg.using_demo_bank ? true : (rightTime && !sentThisWeek);

const since = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
const week = rows.filter((r) => r.date >= since && r.status !== 'report');
const urns = Array.from(new Set(week.filter((r) => r.status === 'posted' && r.urn).map((r) => r.urn)));

// organizationalEntityShareStatistics takes share URNs and ugcPost URNs in separate List()
// parameters, each URN URL-encoded inside the List — Rest.li 2.0 syntax.
const enc = (u) => encodeURIComponent(u);
const shares = urns.filter((u) => u.startsWith('urn:li:share:'));
const ugc = urns.filter((u) => u.startsWith('urn:li:ugcPost:'));
let statsUrl = 'https://api.linkedin.com/rest/organizationalEntityShareStatistics'
  + '?q=organizationalEntity&organizationalEntity=' + enc(cfg.linkedin_org_urn);
if (shares.length) statsUrl += '&shares=List(' + shares.map(enc).join(',') + ')';
if (ugc.length) statsUrl += '&ugcPosts=List(' + ugc.map(enc).join(',') + ')';

const DAYS = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

return [{
  json: {
    _report_due: due,
    _week: monday,
    _week_key: weekKey,
    _week_rows: week,
    _urns: urns,
    _stats_url: statsUrl,
    _want_stats: cfg.stats_enabled && urns.length > 0,
    _reason: due
      ? (cfg.using_demo_bank ? 'demo log: the weekly report is always due' : 'weekly report due for the week of ' + monday)
      : sentThisWeek
        ? 'the weekly report for the week of ' + monday + ' already went out'
        : 'the weekly report runs ' + DAYS[cfg.report_weekday] + ' from '
          + String(cfg.report_hour).padStart(2, '0') + ':00 (' + cfg.timezone + ')'
  }
}];
