// THE RULE: no open opportunity should exist without a next activity.
//
// Fans the one pipeline item out into one item per open deal, each carrying the verdict.
// A deal is COVERED when it has at least one activity that is:
//
//   - not done, and
//   - due on or before HORIZON_DAYS from today.
//
// The horizon is the part that matters. Without it, "next activity" is satisfied by a task
// parked eleven months out, and the report says 100% while the pipeline rots. With it, a
// parked task reads as uncovered, which is the truth.
//
// Overdue is measured in BUSINESS days (WORK_DAYS + HOLIDAYS), so a task due on Friday is
// one day late on Monday, not three, and the escalation tiers do not fire on weekends.
const cfg = $('config').first().json;
const pipeline = $json;

/* @include _business-days.js */
const cal = businessCalendar(cfg);

const DAY = 86400000;
const now = Date.now();
const today = cal.dayStart(now);
const horizon = now + Number(cfg.horizon_days || 45) * DAY;
const graceFrom = now - Number(cfg.grace_hours || 0) * 3600000;

function parseDate(d, t) {
  if (!d) return null;
  const stamp = String(d).slice(0, 10) + 'T' + (String(t || '').slice(0, 5) || '00:00') + ':00Z';
  const ms = Date.parse(stamp);
  return isNaN(ms) ? null : ms;
}

function parseStamp(s) {
  if (!s) return null;
  const ms = Date.parse(String(s).replace(' ', 'T') + (String(s).indexOf('Z') === -1 ? 'Z' : ''));
  return isNaN(ms) ? null : ms;
}

const byDeal = {};
(pipeline.activities || []).forEach(function (a) {
  if (!a.deal_id) return;
  const k = String(a.deal_id);
  if (!byDeal[k]) byDeal[k] = [];
  byDeal[k].push(a);
});

const stageByName = {};
(cfg.stages || []).forEach(function (s) { stageByName[s.name] = s; });

const out = [];
let covered = 0;
let uncovered = 0;
let parked = 0;
let overdueOnly = 0;
let highStalled = 0;

(pipeline.deals || []).forEach(function (deal) {
  const acts = byDeal[String(deal.id)] || [];
  const open = acts.filter(function (a) { return !a.done; });

  let nextDue = null;
  let parkedDue = null;
  let lateDue = null;   // earliest open activity whose due DAY is already behind us
  open.forEach(function (a) {
    const due = parseDate(a.due_date, a.due_time);
    if (due === null) return;
    if (due <= horizon) {
      if (nextDue === null || due < nextDue) nextDue = due;
      if (cal.dayStart(due) < today && (lateDue === null || due < lateDue)) lateDue = due;
    } else if (parkedDue === null || due < parkedDue) {
      parkedDue = due;
    }
  });

  // An activity with no due date at all is not a next step either — it never surfaces on
  // anyone's day. Counted with the parked ones.
  const undated = open.filter(function (a) { return !a.due_date; }).length;
  if (undated && parkedDue === null) parkedDue = horizon + DAY;

  const overdueBdays = lateDue === null ? 0 : cal.between(lateDue, now);
  const isOverdue = lateDue !== null && overdueBdays >= Number(cfg.overdue_days || 0);

  const done = acts.filter(function (a) { return a.done; })
    .map(function (a) { return parseStamp(a.marked_done_time) || parseDate(a.due_date, a.due_time); })
    .filter(function (ms) { return ms !== null; })
    .sort(function (a, b) { return b - a; });
  const lastActivity = done.length ? done[0] : parseStamp(deal.add_time);
  const daysQuiet = lastActivity ? Math.floor((now - lastActivity) / DAY) : null;

  const stage = stageByName[deal.stage] || {};
  const added = parseStamp(deal.add_time);
  const inGrace = added !== null && added > graceFrom;

  const isCovered = nextDue !== null;
  const stale = daysQuiet !== null && daysQuiet >= Number(stage.stale_days || 30);
  const highValue = Number(deal.value || 0) >= Number(cfg.high_priority_value || 0);
  if (isCovered) covered++; else uncovered++;
  if (!isCovered && parkedDue !== null) parked++;
  if (isCovered && isOverdue) overdueOnly++;
  if (stale && highValue) highStalled++;

  out.push({
    json: Object.assign({}, deal, {
      covered: isCovered,
      in_grace: inGrace,
      next_due: nextDue ? new Date(nextDue).toISOString().slice(0, 10) : '',
      parked_due: parkedDue ? new Date(parkedDue).toISOString().slice(0, 10) : '',
      overdue_due: lateDue ? new Date(lateDue).toISOString().slice(0, 10) : '',
      overdue_business_days: overdueBdays,
      overdue: isOverdue,
      open_activities: open.length,
      last_activity: lastActivity ? new Date(lastActivity).toISOString().slice(0, 10) : '',
      days_quiet: daysQuiet,
      stale: stale,
      high_priority: highValue,
      _pipeline: {
        read_at: pipeline.read_at, source: pipeline.source,
        phi_violations: pipeline.phi_violations || [],
        results_not_captured: pipeline.results_not_captured || []
      }
    })
  });
});

const totals = {
  open_deals: (pipeline.deals || []).length,
  covered: covered,
  uncovered: uncovered,
  parked: parked,
  overdue_but_covered: overdueOnly,
  high_value_stalled: highStalled
};

// Anything for the guard to do: a gap to fill, an overdue deal to escalate, or a
// high-value deal gone stale. Every deal item carries the same flag, so the IF after this
// node routes the whole batch one way.
const hasWork = uncovered > 0 || overdueOnly > 0 || highStalled > 0;

// No open deals at all is still a run, and still needs a summary — silence would be
// indistinguishable from a workflow that stopped working.
if (!out.length) {
  return [{
    json: {
      _has_work: false,
      _totals: totals,
      source: pipeline.source,
      read_at: pipeline.read_at,
      phi_violations: pipeline.phi_violations || [],
      results_not_captured: pipeline.results_not_captured || [],
      _note: 'No open deals in this pipeline.'
    }
  }];
}

out.forEach(function (item) {
  item.json._has_work = hasWork;
  item.json._totals = totals;
});
return out;
