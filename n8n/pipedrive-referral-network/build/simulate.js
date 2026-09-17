// Runs every Code node against the built-in demo pipeline, outside n8n.
//   node simulate.js
//
// validate.py proves the workflow is wired correctly. This proves it does the right thing:
// the horizon rule, the overdue-not-stacked rule, the daily cap, the re-engagement branch,
// the "not captured is not zero" rule, and the PHI check actually stopping a run.
//
// It is a harness, not a mock — the node sources are read from js/ and executed unmodified,
// with $, $json and $input.all() shaped the way n8n shapes them.
const fs = require('fs');
const path = require('path');

const JS = path.join(__dirname, 'js');
const outputs = {};          // node name -> [{json}]
let pass = 0;
const failures = [];

function ok(cond, label) {
  if (cond) { pass++; console.log('  ok   ' + label); }
  else { failures.push(label); console.log('  FAIL ' + label); }
}

function ctxFor(name) {
  return function (node) {
    const items = outputs[node];
    if (!items) throw new Error("simulate: $('" + node + "') has not run yet");
    return {
      first: function () { return items[0]; },
      all: function () { return items; },
      last: function () { return items[items.length - 1]; },
      // The paired-item lookup. In the real thing n8n tracks provenance; here the caller
      // sets _pairIndex before running a per-item node, which is the same relationship.
      get item() { return items[Math.min(currentPair, items.length - 1)]; }
    };
  };
}

let currentPair = 0;

function run(file, opts) {
  opts = opts || {};
  const src = fs.readFileSync(path.join(JS, file), 'utf8');
  const $ = ctxFor();
  const $input = { all: function () { return opts.items || []; },
                   first: function () { return (opts.items || [])[0]; } };
  const fn = new Function('$', '$json', '$input', src);
  const res = fn($, opts.json === undefined ? {} : opts.json, $input);
  return Array.isArray(res) ? res : [res];
}

function store(name, items) { outputs[name] = items; return items; }

// ------------------------------------------------------------------ 1. config
console.log('\n== config');
const cfgItems = store('config', run('config.js'));
const cfg = cfgItems[0].json;
ok(cfg.preview_only === true, 'ships in preview — nothing can be written');
ok(cfg.demo_data === true, 'ships with the demo pipeline on');
ok(cfg.write_enabled === false, 'the write gate is closed');
ok(cfg.stages.length === 8, 'eight stages, as the brief lists them');

// ------------------------------------------------------------------ 2. the demo pipeline
console.log('\n== the demo pipeline');
const pipe = store('STOP: demo pipeline', run('stop-demo-pipeline.js'))[0].json;
ok(pipe.deals.length > 15, pipe.deals.length + ' fabricated open deals');
ok(pipe.activities.length >= pipe.deals.length,
   pipe.activities.length + ' activities across them');
const rerun = run('stop-demo-pipeline.js')[0].json;
ok(JSON.stringify(rerun.deals) === JSON.stringify(pipe.deals),
   'deterministic — the same run twice gives the same pipeline');

// ------------------------------------------------------------------ 3. the PHI boundary
console.log('\n== the PHI boundary');
const phi = store('check the PHI boundary',
                  run('check-the-phi-boundary.js', { json: pipe }))[0].json;
ok(phi.phi_ok === true, 'a clean set of field names passes');
ok(phi.results_not_captured.length === 5,
   'all five recruitment numbers report as "not captured", not as zero');

// A CRM that already holds a PHI-shaped field: reported and blocked, run continues.
const dirty = JSON.parse(JSON.stringify(pipe));
dirty.deal_fields.push({ key: 'ff'.repeat(20), name: 'Screening response — pain scale' });
const dirtyOut = run('check-the-phi-boundary.js', { json: dirty })[0].json;
ok(dirtyOut.phi_violations.length === 1,
   'a PHI-shaped field already in the CRM is reported, not silently read');
ok(dirtyOut.phi_blocked_keys.length === 1, 'and is added to the blocklist');

// This workflow CONFIGURED to read one: hard stop.
const badCfg = JSON.parse(JSON.stringify(cfg));
badCfg.result_fields.referrals_sent = 'ff'.repeat(20);
badCfg.touched_fields = [{ role: 'result', name: 'referrals_sent', key: 'ff'.repeat(20) }];
outputs.config = [{ json: badCfg }];
let threw = '';
try { run('check-the-phi-boundary.js', { json: dirty }); }
catch (e) { threw = e.message; }
outputs.config = cfgItems;
ok(threw.indexOf('PHI boundary') === 0,
   'pointing config at a PHI-shaped field stops the run: "' + threw.slice(0, 60) + '…"');

// ------------------------------------------------------------------ 4. the rule
console.log('\n== the rule: no open opportunity without a next activity');
const verdicts = store('check every deal for a next activity',
                       run('check-every-deal-for-a-next-activity.js', { json: phi }));
ok(verdicts.length === pipe.deals.length, 'one verdict per open deal');
const uncovered = verdicts.filter(function (v) { return !v.json.covered; });
const parked = verdicts.filter(function (v) { return !v.json.covered && v.json.parked_due; });
ok(uncovered.length > 0, uncovered.length + ' deals have no next activity inside the horizon');
ok(parked.length > 0,
   parked.length + ' of those DO have an open activity — parked past the ' +
   cfg.horizon_days + '-day horizon, which is not a next step');

// The horizon is the rule. Widen it past the parked dates and those deals become covered.
const wide = JSON.parse(JSON.stringify(cfg));
wide.horizon_days = 5000;
outputs.config = [{ json: wide }];
const wideVerdicts = run('check-every-deal-for-a-next-activity.js', { json: phi });
outputs.config = cfgItems;
const wideUncovered = wideVerdicts.filter(function (v) { return !v.json.covered; });
ok(wideUncovered.length === uncovered.length - parked.length,
   'with no horizon those same parked deals would read as covered — which is the failure ' +
   'the horizon exists to prevent');

// ------------------------------------------------------------------ 5. what it would do
console.log('\n== decide (preview, as it ships)');
const decided = store('decide the next activity',
                      run('decide-the-next-activity.js', { items: verdicts }));
const creates = decided.filter(function (d) { return d.json.action === 'create'; });
const escalations = decided.filter(function (d) { return d.json.action === 'escalate'; });
const reengage = decided.filter(function (d) { return d.json.action === 'reengage'; });
ok(creates.length > 0, creates.length + ' activities would be created');
ok(escalations.length > 0,
   escalations.length + ' overdue deals escalated instead of having a second task stacked');
ok(reengage.length === 1, 'the one quiet referral partner gets a re-engagement, not a check-in');
ok(decided.every(function (d) { return d.json._create === false; }),
   'in preview not one of them opens the write gate');
ok(decided.every(function (d) {
  return d.json.action !== 'create' || d.json.activity_due > new Date().toISOString().slice(0, 10);
}), 'every scheduled activity is due in the future');

// The cap, enforced in code.
const capped = JSON.parse(JSON.stringify(cfg));
capped.daily_cap = 3;
outputs.config = [{ json: capped }];
const cappedOut = run('decide-the-next-activity.js', { items: verdicts });
outputs.config = cfgItems;
const cappedWrites = cappedOut.filter(function (d) {
  return d.json.action === 'create' || d.json.action === 'reengage';
});
ok(cappedWrites.length === 3, 'DAILY_CAP = 3 produces exactly 3 actions, not a comment');
const quiets = cappedWrites.map(function (d) { return d.json.days_quiet; });
const allQuiets = decided.filter(function (d) {
  return d.json.action === 'create' || d.json.action === 'reengage';
}).map(function (d) { return d.json.days_quiet; }).sort(function (a, b) { return b - a; });
ok(Math.min.apply(null, quiets) >= allQuiets[2],
   'and it keeps the deals that have been quiet longest');

// ------------------------------------------------------------------ 6. the preview list
console.log('\n== the preview list and the summary');
const held = decided.map(function (d, i) {
  currentPair = i;
  return run('stop-not-created.js', { json: d.json })[0];
});
store('STOP: not created', held);
ok(held.every(function (h) { return h.json.written === false; }), 'nothing was written');
ok(held.filter(function (h) { return h.json.outcome.indexOf('would create') === 0; }).length
   === creates.length, 'every activity it would have created is listed with its due date');

const summary = run('build-the-run-summary.js', { items: held })[0].json;
ok(summary.open_deals === pipe.deals.length, 'the summary counts every open deal');
ok(summary.would_create === creates.length + reengage.length,
   'and says how many activities it would create');
ok(summary.coverage_pct < 100, 'coverage before the run is honest: ' + summary.coverage_pct + '%');
ok(summary.coverage_pct_after === summary.coverage_pct,
   'and does not improve in preview, because nothing was created');
ok(summary.summary.indexOf('PREVIEW') !== -1, 'the message says which mode it ran in');
store('build the run summary', [{ json: summary }]);

const escalation = run('build-the-escalation.js', { json: summary })[0].json;
ok(escalation._escalation_body.text.indexOf('management escalation') !== -1,
   'the manager gets a different message from the rep');

// ------------------------------------------------------------------ 7. a live run
console.log('\n== a live run (Pipedrive stubbed)');
const live = JSON.parse(JSON.stringify(cfg));
live.mode = 'live'; live.preview_only = false; live.live_write = true;
live.write_enabled = true;
outputs.config = [{ json: live }];
const liveDecided = store('decide the next activity',
                          run('decide-the-next-activity.js', { items: verdicts }));
const toWrite = liveDecided.filter(function (d) { return d.json._create; });
ok(toWrite.length === creates.length + reengage.length,
   toWrite.length + ' activities open the write gate when it is live');

const written = toWrite.map(function (d) {
  currentPair = liveDecided.indexOf(d);
  return run('record-what-was-created.js',
             { json: { success: true, data: { id: 5000 + currentPair } } })[0];
});
// One Pipedrive rejection, to prove a 4xx is not recorded as success.
currentPair = liveDecided.indexOf(toWrite[0]);
const rejected = run('record-what-was-created.js',
                     { json: { success: false, error: 'activity type not found' } })[0];
ok(rejected.json.written === false && rejected.json.outcome.indexOf('FAILED') === 0,
   'a rejected create is recorded as failed, not as handled');

const liveHeld = liveDecided.filter(function (d) { return !d.json._create; })
  .map(function (d, i) { currentPair = i; return run('stop-not-created.js', { json: d.json })[0]; });
const liveSummary = run('build-the-run-summary.js',
                        { items: written.concat(liveHeld) })[0].json;
ok(liveSummary.created === toWrite.length, 'the summary counts what was actually created');
ok(liveSummary.coverage_pct_after > liveSummary.coverage_pct,
   'coverage improves from ' + liveSummary.coverage_pct + '% to ' +
   liveSummary.coverage_pct_after + '% — measured, not assumed');
outputs.config = cfgItems;

// ------------------------------------------------------------------ 8. the dashboard
console.log('\n== the dashboard');
const kpis = store('compute the KPIs',
                   run('compute-the-kpis.js', { items: verdicts }))[0].json;
ok(kpis.open_deals === pipe.deals.length, 'open deals match the pipeline');
ok(kpis.gaps === uncovered.length, 'the gap count matches the rule, not a second definition');
ok(kpis.outreach_attempts >= kpis.conversations,
   'attempts (' + kpis.outreach_attempts + ') >= conversations (' + kpis.conversations +
   ') — no-answers are attempts, not conversations');
ok(kpis.referrals_sent === null,
   'an un-wired recruitment field reports as null, never as 0');
ok(kpis.gap_rows.length === kpis.gaps, 'every gap gets a row in the Gaps tab');
ok(kpis.by_rep.length > 0 && kpis.by_rep.reduce(function (a, r) {
  return a + r.open_deals;
}, 0) === kpis.open_deals, 'the by-rep split adds back up to the whole pipeline');

const dashRow = run('rows-for-the-dashboard.js', { json: kpis })[0].json;
ok(dashRow[cfg.dashboard_columns.referrals_sent] === 'not captured',
   'the sheet says "not captured", not 0');
ok(Object.keys(dashRow).length === 20, 'twenty dashboard columns');

const gapRows = run('rows-for-the-gaps-tab.js');
ok(gapRows.length === kpis.gaps, 'the Gaps tab gets one row per uncovered deal');
const repRows = run('rows-for-the-by-rep-tab.js');
const pracRows = run('rows-for-the-by-practice-tab.js');
ok(repRows.length === kpis.by_rep.length && pracRows.length === kpis.by_practice.length,
   'the by-rep and by-practice tabs are written too');

const noSheet = store('STOP: no sheet', run('stop-no-sheet.js'))[0].json;
const report = run('build-the-management-report.js', { json: noSheet })[0].json;
ok(report.report.indexOf('not captured') !== -1,
   'the digest repeats what the CRM is not capturing, as setup tasks');
ok(report.report.indexOf('Quietest uncovered deals') !== -1,
   'and names the three deals a manager should ask about');

// A clean pipeline still reports.
console.log('\n== a pipeline with no gaps');
const cleanPipe = JSON.parse(JSON.stringify(phi));
cleanPipe.deals = [];
cleanPipe.activities = [];
const cleanVerdict = run('check-every-deal-for-a-next-activity.js', { json: cleanPipe })[0];
ok(cleanVerdict.json._has_gaps === false, 'no deals -> the gate routes to the clean branch');
const cleanStop = run('stop-every-deal-is-covered.js', { json: cleanVerdict.json })[0];
ok(cleanStop.json.headline.length > 0,
   'and it still produces a summary: "' + cleanStop.json.headline + '"');

console.log('\n' + pass + ' passed, ' + failures.length + ' failed');
if (failures.length) {
  failures.forEach(function (f) { console.log('  - ' + f); });
  process.exit(1);
}
