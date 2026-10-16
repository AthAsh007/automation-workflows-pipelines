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
const cfg = $('config').first().json;
const pipeline = $json;

const DAY = 86400000;
const now = Date.now();
const horizon = now + Number(cfg.horizon_days || 45) * DAY;
const graceFrom = now - Number(cfg.grace_hours || 0) * 3600000;
const overdueBefore = now - Number(cfg.overdue_days || 0) * DAY;

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

(pipeline.deals || []).forEach(function (deal) {
  const acts = byDeal[String(deal.id)] || [];
  const open = acts.filter(function (a) { return !a.done; });

  let nextDue = null;
  let parkedDue = null;
  let overdueDue = null;
  open.forEach(function (a) {
    const due = parseDate(a.due_date, a.due_time);
    if (due === null) return;
    if (due <= horizon) {
      if (nextDue === null || due < nextDue) nextDue = due;
      if (due < overdueBefore && (overdueDue === null || due < overdueDue)) overdueDue = due;
    } else if (parkedDue === null || due < parkedDue) {
      parkedDue = due;
    }
  });

  // An activity with no due date at all is not a next step either — it never surfaces on
  // anyone's day. Counted with the parked ones.
  const undated = open.filter(function (a) { return !a.due_date; }).length;
  if (undated && parkedDue === null) parkedDue = horizon + DAY;

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
  if (isCovered) covered++; else uncovered++;
  if (!isCovered && parkedDue !== null) parked++;
  if (isCovered && overdueDue !== null) overdueOnly++;

  out.push({
    json: Object.assign({}, deal, {
      _has_gaps: true,
      covered: isCovered,
      in_grace: inGrace,
      next_due: nextDue ? new Date(nextDue).toISOString().slice(0, 10) : '',
      parked_due: parkedDue ? new Date(parkedDue).toISOString().slice(0, 10) : '',
      overdue_due: overdueDue ? new Date(overdueDue).toISOString().slice(0, 10) : '',
      overdue: overdueDue !== null,
      open_activities: open.length,
      last_activity: lastActivity ? new Date(lastActivity).toISOString().slice(0, 10) : '',
      days_quiet: daysQuiet,
      stale: daysQuiet !== null && daysQuiet >= Number(stage.stale_days || 30),
      high_priority: Number(deal.value || 0) >= Number(cfg.high_priority_value || 0),
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
  overdue_but_covered: overdueOnly
};

// Every open deal already has a real next step. That is the outcome the rule exists to
// produce, and it still needs a run summary — silence would be indistinguishable from a
// workflow that stopped working.
if (!out.length || uncovered === 0) {
  return [{
    json: {
      _has_gaps: false,
      totals: totals,
      source: pipeline.source,
      read_at: pipeline.read_at,
      phi_violations: pipeline.phi_violations || [],
      results_not_captured: pipeline.results_not_captured || [],
      _note: out.length
        ? 'Every one of ' + totals.open_deals + ' open deals has an activity due within ' +
          cfg.horizon_days + ' days.'
        : 'No open deals in this pipeline.'
    }
  }];
}

out.forEach(function (item) { item.json._totals = totals; });
return out;
