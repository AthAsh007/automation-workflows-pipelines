// STOP: the rule already holds.
//
// Every open deal has an activity that is not done and is due inside the horizon. Nothing
// to create. This still produces a summary — a guard that goes silent when it finds nothing
// is indistinguishable from a guard that has stopped running, and the second one is the
// expensive failure.
const cfg = $('config').first().json;
const j = $json;
const t = j.totals || {};

return [{
  json: {
    _has_gaps: false,
    source: j.source,
    read_at: j.read_at,
    totals: t,
    phi_violations: j.phi_violations || [],
    results_not_captured: j.results_not_captured || [],
    decisions: [],
    headline: t.open_deals
      ? 'All ' + t.open_deals + ' open deals have a next activity within ' +
        cfg.horizon_days + ' days.'
      : 'No open deals in this pipeline.',
    recorded_at: new Date().toISOString()
  }
}];
