// Folds the whole run into one item: the counts, the per-deal decision list, and the two
// escalation lists (owner tier and manager tier) that the three messages are built from.
// Produced whether or not anything was written.
const cfg = $('config').first().json;
const items = $input.all().map(function (i) { return i.json; });

// The "every deal is covered" path arrives as a single item with no per-deal decisions.
const clean = items.filter(function (j) { return j._clean === true; })[0];
const decisions = items.filter(function (j) { return j._clean !== true && j.id; });

const first = decisions[0] || clean || {};
const totals = (first._totals || (clean && clean.totals) || {});
const pipe = first._pipeline || {};

const createdOk = decisions.filter(function (d) { return d.written === true; });
const failed = decisions.filter(function (d) {
  return d.written === false && d.write_error;
});
const wouldCreate = decisions.filter(function (d) {
  return (d.action === 'create' || d.action === 'reengage') && d.written !== true;
});
const escalations = decisions.filter(function (d) { return d.action === 'escalate'; });
const stalled = decisions.filter(function (d) { return d.stale === true; });
const highStalled = decisions.filter(function (d) { return d.high_value_stalled === true; });
const shifted = decisions.filter(function (d) { return Number(d.due_shifted_by || 0) > 0; });
const overCapacity = decisions.filter(function (d) { return d.owner_over_capacity === true; });

const open = Number(totals.open_deals || 0);
const covered = Number(totals.covered || 0);
const coverage = open ? Math.round((covered / open) * 100) : 100;
// Coverage AFTER this run: what was covered already, plus what was actually written.
const coverageAfter = open ? Math.round(((covered + createdOk.length) / open) * 100) : 100;

function escRow(d, tier) {
  return {
    deal_id: d.id, deal: d.title, organisation: d.organisation, stage: d.stage,
    owner: d.owner, owner_id: d.owner_id, value: d.value, days_quiet: d.days_quiet,
    overdue_business_days: d.overdue_business_days || 0, overdue_since: d.overdue_due || '',
    tier: tier,
    why: d.action === 'escalate' ? d.action_reason
      : 'high-value deal (' + d.value + ') quiet ' + d.days_quiet + ' days, past its stage limit'
  };
}

// Manager tier: overdue past MANAGER_AFTER_DAYS, plus every high-value stalled deal.
const managerTier = [];
const seen = {};
escalations.concat(highStalled).forEach(function (d) {
  const tier = d.escalation_tier === 'manager' || d.high_value_stalled ? 'manager' : 'owner';
  if (tier !== 'manager' || seen[d.id]) return;
  seen[d.id] = true;
  managerTier.push(escRow(d, 'manager'));
});
const ownerTier = escalations.filter(function (d) { return !seen[d.id]; })
  .map(function (d) { return escRow(d, 'owner'); });

const mode = cfg.forced_preview ? 'PREVIEW (forced — demo pipeline)'
  : cfg.preview_only ? 'PREVIEW — nothing written'
  : cfg.test_write ? 'TEST — written, assigned to the test user'
  : 'LIVE';

const lines = [];
lines.push('*Activity guard* — ' + mode);
lines.push(open + ' open deals · ' + coverage + '% had a next activity · ' +
  coverageAfter + '% after this run');
if (createdOk.length) lines.push('created: ' + createdOk.length);
if (wouldCreate.length && !createdOk.length) lines.push('would create: ' + wouldCreate.length);
if (shifted.length) lines.push('load-levelled to a lighter day: ' + shifted.length);
if (overCapacity.length) lines.push(':warning: reps over ' + cfg.max_per_owner_per_day +
  ' activities/day for the next ' + cfg.level_within_days + ' business days: ' +
  overCapacity.map(function (d) { return d.owner; })
    .filter(function (v, i, a) { return a.indexOf(v) === i; }).join(', '));
if (ownerTier.length) lines.push('overdue, sent to the owner: ' + ownerTier.length);
if (managerTier.length) lines.push('escalated to the manager tier: ' + managerTier.length);
if (stalled.length) lines.push('stalled: ' + stalled.length +
  (highStalled.length ? ' (' + highStalled.length + ' high-value)' : ''));
if (failed.length) lines.push(':warning: failed to create: ' + failed.length);
const phi = first.phi_violations || pipe.phi_violations || [];
if (phi.length) {
  lines.push(':rotating_light: PHI boundary: ' + phi.length +
    ' CRM field(s) named like patient clinical data — ' +
    phi.map(function (x) { return x.name; }).join(', '));
}
if (clean) lines.push(clean.headline);

// The per-deal record. This is the list a rep or a manager actually argues with.
const rows = decisions.map(function (d) {
  return {
    deal_id: d.id,
    deal: d.title,
    practice: d.organisation,
    contact: d.person,
    stage: d.stage,
    rep: d.owner,
    rep_id: d.owner_id,
    value: d.value,
    days_quiet: d.days_quiet,
    covered_before: d.covered,
    action: d.action,
    tier: d.escalation_tier || '',
    why: d.action_reason,
    activity: d.activity_subject || '',
    due: d.activity_due || '',
    outcome: d.outcome || '',
    error: d.write_error || ''
  };
}).sort(function (a, b) { return Number(b.days_quiet || 0) - Number(a.days_quiet || 0); });

return [{
  json: {
    mode: cfg.mode,
    run_date: new Date().toISOString().slice(0, 10),
    source: pipe.source || (clean && clean.source) || 'unknown',
    open_deals: open,
    covered_before: covered,
    uncovered_before: Number(totals.uncovered || 0),
    coverage_pct: coverage,
    coverage_pct_after: coverageAfter,
    created: createdOk.length,
    would_create: wouldCreate.length,
    load_levelled: shifted.length,
    escalated: escalations.length,
    stalled: stalled.length,
    high_priority_stalled: highStalled.length,
    failed: failed.length,
    skipped: decisions.filter(function (d) { return d.action === 'skip'; }).length,
    decisions: rows,
    owner_tier: ownerTier,
    manager_tier: managerTier,
    results_not_captured: first.results_not_captured || pipe.results_not_captured ||
      (clean && clean.results_not_captured) || [],
    summary_lines: lines
  }
}];
