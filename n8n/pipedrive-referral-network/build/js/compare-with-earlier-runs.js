// The guard's memory: what it already told the manager, and what coverage was last time.
//
// Two problems this solves, both of which kill an escalation channel within a fortnight:
//
//   1. Repetition. The same twelve overdue deals sent to a manager every weekday morning is
//      how the channel gets muted. A manager-tier deal is sent ONCE, then again only when
//      REMIND_MANAGER_AFTER_DAYS business days pass with it still open. A deal that has
//      been resolved drops out of memory and is counted as resolved.
//   2. No direction. "61% covered" means nothing alone. Each run records its coverage, and
//      the summary says how it moved since the previous run.
//
// Memory lives in this workflow's static data — no database, no credential. n8n only
// persists static data for executions started by the schedule (not the Run button), and
// this node only WRITES it outside preview, so a preview can never suppress a real
// escalation. The demo pipeline carries a seeded memory so the de-duplication is visible
// on the very first demo run.
const cfg = $('config').first().json;
const s = $json;

/* @include _business-days.js */
const cal = businessCalendar(cfg);

const today = s.run_date;
const now = Date.now();

const pipeline = $('one pipeline').first().json;
const store = $getWorkflowStaticData('global');
const demoMemory = pipeline.source === 'demo' ? pipeline._demo_memory : null;
const memory = demoMemory || {
  escalated: store.escalated || {},
  runs: store.runs || []
};
const escalated = JSON.parse(JSON.stringify(memory.escalated || {}));
const runs = (memory.runs || []).slice();

// ---------------------------------------------------------------- manager de-duplication
const remindAfter = Number(cfg.remind_manager_after_days || 0);
const fresh = [];
const reminders = [];
const quiet = [];
const current = {};
(s.manager_tier || []).forEach(function (r) {
  const k = String(r.deal_id);
  current[k] = true;
  const prev = escalated[k];
  if (!prev) {
    fresh.push(r);
    escalated[k] = { first: today, last: today, organisation: r.organisation };
    return;
  }
  const since = cal.between(Date.parse(prev.last + 'T00:00:00Z'), now);
  if (remindAfter > 0 && since >= remindAfter) {
    reminders.push(Object.assign({}, r, { first_escalated: prev.first,
      business_days_since_told: since }));
    escalated[k].last = today;
  } else {
    quiet.push(Object.assign({}, r, { first_escalated: prev.first }));
  }
});
// Anything in memory that is no longer on the manager list has been dealt with.
const resolved = Object.keys(escalated).filter(function (k) { return !current[k]; })
  .map(function (k) { return escalated[k].organisation || ('deal ' + k); });
Object.keys(escalated).forEach(function (k) { if (!current[k]) delete escalated[k]; });

// ---------------------------------------------------------------- coverage trend
const previous = runs.filter(function (r) { return r.date < today; }).slice(-1)[0] || null;
let trend = '';
if (previous) {
  const delta = s.coverage_pct - previous.coverage_pct;
  trend = 'vs ' + previous.date + ': coverage ' + previous.coverage_pct + '% -> ' +
    s.coverage_pct + '% (' + (delta >= 0 ? '+' : '') + delta + ' pts), uncovered ' +
    previous.uncovered + ' -> ' + s.uncovered_before;
}
const nextRuns = runs.filter(function (r) { return r.date !== today; })
  .concat([{ date: today, coverage_pct: s.coverage_pct, uncovered: s.uncovered_before,
    overdue: (s.owner_tier || []).length + (s.manager_tier || []).length }])
  .slice(-30);

// ---------------------------------------------------------------- persist (never in preview)
const persisted = !cfg.preview_only && !demoMemory;
if (persisted) {
  store.escalated = escalated;
  store.runs = nextRuns;
}

const lines = (s.summary_lines || []).slice();
if (trend) lines.splice(2, 0, trend);
else lines.splice(2, 0, 'first recorded run — the trend line starts tomorrow');
if (fresh.length || reminders.length || quiet.length) {
  lines.push('manager: ' + fresh.length + ' new, ' + reminders.length + ' reminder(s), ' +
    quiet.length + ' already told and still open');
}
if (resolved.length) lines.push(':white_check_mark: resolved since the manager was told: ' +
  resolved.join(', '));

return [{
  json: Object.assign({}, s, {
    trend: trend,
    previous_run: previous,
    manager_new: fresh,
    manager_reminders: reminders,
    manager_already_told: quiet,
    resolved_since_escalation: resolved,
    memory_persisted: persisted,
    memory_source: demoMemory ? 'demo fixture' : 'workflow static data',
    summary: lines.join('\n'),
    _alert_body: { text: lines.join('\n') },
    _has_escalations: fresh.length + reminders.length > 0
  })
}];
