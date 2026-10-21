// STOP: the rule already holds.
//
// Every open deal has an activity that is not done and is due inside the horizon, nothing
// is overdue past OVERDUE_DAYS and no high-value deal has gone stale. Nothing to create and
// nothing to escalate. This still produces a summary — a guard that goes silent when it
// finds nothing is indistinguishable from a guard that has stopped running, and the second
// one is the expensive failure.
const cfg = $('config').first().json;
const j = $input.first().json;
const t = j._totals || {};

return [{
  json: {
    _clean: true,
    source: j.source || (j._pipeline && j._pipeline.source),
    read_at: j.read_at || (j._pipeline && j._pipeline.read_at),
    totals: t,
    phi_violations: j.phi_violations || (j._pipeline && j._pipeline.phi_violations) || [],
    results_not_captured: j.results_not_captured ||
      (j._pipeline && j._pipeline.results_not_captured) || [],
    decisions: [],
    headline: t.open_deals
      ? 'All ' + t.open_deals + ' open deals have a next activity within ' +
        cfg.horizon_days + ' days, and none is overdue.'
      : 'No open deals in this pipeline.',
    recorded_at: new Date().toISOString()
  }
}];
