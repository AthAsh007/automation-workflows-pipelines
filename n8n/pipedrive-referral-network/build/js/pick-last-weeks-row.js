// Finds last week's Dashboard row in the sheet's own history.
//
// The Dashboard tab is appended once per run, so it already IS the trend. This reads it
// back, maps the column headings to KPI names through DASHBOARD_COLUMNS, and keeps the
// newest row that is at least BASELINE_MIN_DAYS old — the previous weekly run, not a
// manual re-run from this morning. A read that failed, or a sheet with no history yet,
// gives no baseline and the report says so; it never compares against a zero.
const cfg = $('config').first().json;
const rows = $input.all().map(function (i) { return i.json || {}; });
const C = cfg.dashboard_columns;

const failed = rows.length === 1 && rows[0].error;
const cutoff = Date.now() - Number(cfg.baseline_min_days || 5) * 86400000;

function stamp(s) {
  const ms = Date.parse(String(s || '').replace(' ', 'T') +
    (String(s || '').indexOf('Z') === -1 ? 'Z' : ''));
  return isNaN(ms) ? null : ms;
}
function num(v) {
  if (v === '' || v === null || v === undefined || v === 'not captured') return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

let best = null;
let bestAt = null;
rows.forEach(function (r) {
  const at = stamp(r[C.run_at]);
  if (at === null || at > cutoff) return;
  if (bestAt === null || at > bestAt) { best = r; bestAt = at; }
});

let baseline = null;
if (best) {
  baseline = {};
  Object.keys(C).forEach(function (k) {
    baseline[k] = k === 'run_at' ? best[C.run_at] : num(best[C[k]]);
  });
}

return [{
  json: {
    baseline: baseline,
    baseline_source: failed ? 'sheet read failed: ' + String(rows[0].error.message || rows[0].error).slice(0, 120)
      : baseline ? 'Dashboard tab, row of ' + baseline.run_at
      : 'no Dashboard row older than ' + cfg.baseline_min_days + ' days yet',
    history_rows: failed ? 0 : rows.filter(function (r) { return r[C.run_at]; }).length
  }
}];
