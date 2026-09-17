// One message a manager can read in ten seconds, and a decisions list an engineer can read
// line by line. Both are produced whether or not anything was written.
const cfg = $('config').first().json;
const items = $input.all().map(function (i) { return i.json; });

// The "every deal is covered" path arrives as a single item with no per-deal decisions.
const clean = items.filter(function (j) { return j._has_gaps === false; })[0];
const decisions = items.filter(function (j) { return j._has_gaps !== false && j.id; });

const first = decisions[0] || clean || {};
const totals = (first._totals || (clean && clean.totals) || {});

function count(pred) { return decisions.filter(pred).length; }

const createdOk = decisions.filter(function (d) { return d.written === true; });
const failed = decisions.filter(function (d) {
  return d.written === false && d.write_error;
});
const wouldCreate = decisions.filter(function (d) {
  return (d.action === 'create' || d.action === 'reengage') && d.written !== true;
});
const escalations = decisions.filter(function (d) { return d.action === 'escalate'; });
const stalled = decisions.filter(function (d) { return d.stale === true; });
const highPriority = stalled.filter(function (d) { return d.high_priority === true; });

const open = Number(totals.open_deals || 0);
const covered = Number(totals.covered || 0);
const coverage = open ? Math.round((covered / open) * 100) : 100;

// Coverage AFTER this run: what was covered already, plus what was actually written.
const coverageAfter = open
  ? Math.round(((covered + createdOk.length) / open) * 100)
  : 100;

const mode = cfg.forced_preview ? 'PREVIEW (forced — demo pipeline)'
  : cfg.preview_only ? 'PREVIEW — nothing written'
  : cfg.test_write ? 'TEST — written, assigned to the test user'
  : 'LIVE';

const lines = [];
lines.push('*Activity guard* — ' + mode);
lines.push(open + ' open deals · ' + coverage + '% had a next activity · ' +
  coverageAfter + '% after this run');
if (createdOk.length) lines.push('created: ' + createdOk.length);
if (wouldCreate.length && cfg.preview_only) lines.push('would create: ' + wouldCreate.length);
if (escalations.length) lines.push('overdue, escalated: ' + escalations.length);
if (stalled.length) lines.push('stalled: ' + stalled.length +
  (highPriority.length ? ' (' + highPriority.length + ' high-value)' : ''));
if (failed.length) lines.push(':warning: failed to create: ' + failed.length);
if ((first.phi_violations || clean && clean.phi_violations || []).length) {
  const v = first.phi_violations || clean.phi_violations;
  lines.push(':rotating_light: PHI boundary: ' + v.length +
    ' CRM field(s) named like patient clinical data — ' +
    v.map(function (x) { return x.name; }).join(', '));
}
if (clean) lines.push(clean.headline);

// The per-deal record. This is the file a rep or a manager actually argues with.
const rows = decisions.map(function (d) {
  return {
    deal_id: d.id,
    deal: d.title,
    practice: d.organisation,
    contact: d.person,
    stage: d.stage,
    rep: d.owner,
    value: d.value,
    days_quiet: d.days_quiet,
    covered_before: d.covered,
    action: d.action,
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
    source: first.source || (first._pipeline && first._pipeline.source) || 'unknown',
    open_deals: open,
    covered_before: covered,
    coverage_pct: coverage,
    coverage_pct_after: coverageAfter,
    created: createdOk.length,
    would_create: wouldCreate.length,
    escalated: escalations.length,
    stalled: stalled.length,
    high_priority_stalled: highPriority.length,
    failed: failed.length,
    skipped: count(function (d) { return d.action === 'skip'; }),
    decisions: rows,
    escalation_rows: escalations.concat(highPriority).filter(function (v, i, a) {
      return a.indexOf(v) === i;
    }).map(function (d) {
      return d.owner + ' — ' + d.organisation + ' (' + d.stage + ') quiet ' +
        d.days_quiet + 'd, ' + d.action_reason;
    }),
    results_not_captured: first.results_not_captured ||
      (clean && clean.results_not_captured) || [],
    summary: lines.join('\n'),
    _has_escalations: escalations.length > 0 || highPriority.length > 0,
    _alert_body: { text: lines.join('\n') }
  }
}];
