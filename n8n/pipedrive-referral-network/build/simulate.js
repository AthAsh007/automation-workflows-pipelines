// Runs every Code node against the built-in demo pipeline (and stubbed Pipedrive pages),
// outside n8n.
//   bun build/simulate.js        (node build/simulate.js works too)
//
// validate.mjs proves the workflows are wired correctly. This proves they do the right
// thing: pagination and the failed-read branch, the horizon rule, business-day maths,
// load-levelling, the two escalation tiers, the manager de-duplication memory, per-rep DMs,
// the daily cap, the "not captured is not zero" rule, week-over-week and coaching flags,
// and the PHI check actually stopping a run.
//
// It is a harness, not a mock: the code is read from the BUILT workflow JSON — exactly what
// ships, includes inlined — and executed unmodified, with $, $json, $input and
// $getWorkflowStaticData shaped the way n8n shapes them.
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..');
const WF = {
  guard: JSON.parse(fs.readFileSync(path.join(OUT, '01-activity-guard.json'), 'utf8')),
  report: JSON.parse(fs.readFileSync(path.join(OUT, '02-recruitment-reporting.json'), 'utf8'))
};
function codeOf(wf, name) {
  const n = WF[wf].nodes.filter(function (x) { return x.name === name; })[0];
  if (!n) throw new Error('simulate: no node "' + name + '" in ' + wf);
  return n.parameters.jsCode;
}

const outputs = {};          // node name -> [{json}]
let staticData = {};
let pass = 0;
const failures = [];
let currentPair = 0;

function ok(cond, label) {
  if (cond) { pass++; console.log('  ok   ' + label); }
  else { failures.push(label); console.log('  FAIL ' + label); }
}

function $(node) {
  const items = outputs[node];
  if (!items) throw new Error("simulate: $('" + node + "') has not run yet");
  return {
    first: function () { return items[0]; },
    all: function () { return items; },
    last: function () { return items[items.length - 1]; },
    // The paired-item lookup. n8n tracks provenance; here the caller sets currentPair.
    get item() { return items[Math.min(currentPair, items.length - 1)]; }
  };
}

function run(wf, name, opts) {
  opts = opts || {};
  const items = opts.items || (opts.json !== undefined ? [{ json: opts.json }] : []);
  const $input = { all: function () { return items; }, first: function () { return items[0]; } };
  const fn = new Function('$', '$json', '$input', '$getWorkflowStaticData', codeOf(wf, name));
  const res = fn($, opts.json === undefined ? (items[0] ? items[0].json : {}) : opts.json,
    $input, function () { return staticData; });
  return Array.isArray(res) ? res : [res];
}
function store(name, items) { outputs[name] = items; return items; }
const clone = function (x) { return JSON.parse(JSON.stringify(x)); };
function withConfig(patch, fn) {
  const saved = outputs.config;
  outputs.config = [{ json: Object.assign(clone(saved[0].json), patch) }];
  try { return fn(); } finally { outputs.config = saved; }
}
const isWeekday = function (d) { const w = new Date(d + 'T00:00:00Z').getUTCDay(); return w > 0 && w < 6; };

// ------------------------------------------------------------------ 1. config
console.log('\n== config');
const cfgItems = store('config', run('guard', 'config'));
const cfg = cfgItems[0].json;
ok(cfg.preview_only === true, 'ships in preview — nothing can be written');
ok(cfg.demo_data === true, 'ships with the demo pipeline on');
ok(cfg.write_enabled === false, 'the write gate is closed');
ok(cfg.slack_dm_enabled === false && cfg.sheet_live === false, 'no DMs, no sheet writes as shipped');
ok(cfg.stages.length === 8, 'eight stages');
ok(codeOf('guard', 'config') === codeOf('report', 'config'), 'both workflows ship the same config');

// ------------------------------------------------------------------ 2. business days
console.log('\n== business-day calendar');
const calSrc = codeOf('guard', 'check every deal for a next activity');
const businessCalendar = new Function('$', calSrc.slice(calSrc.indexOf('function businessCalendar'),
  calSrc.indexOf('const cal = ')) + '; return businessCalendar;')();
const cal = businessCalendar({ work_days: [1, 2, 3, 4, 5], holidays: ['2026-12-25'] });
const FRI = Date.parse('2026-10-16T12:00:00Z'), MON = Date.parse('2026-10-19T08:00:00Z');
ok(cal.between(FRI, MON) === 1, 'due Friday, checked Monday = 1 business day overdue, not 3');
ok(cal.ymd(cal.add(FRI, 1)) === '2026-10-19', 'Friday + 1 business day = Monday');
ok(cal.ymd(cal.add(Date.parse('2026-12-24T09:00:00Z'), 1)) === '2026-12-28',
   'a holiday and a weekend are both skipped (24 Dec + 1 = 28 Dec)');
ok(cal.ymd(cal.add(Date.parse('2026-10-17T09:00:00Z'), 0)) === '2026-10-19',
   '"today" on a Saturday rolls to Monday');

// ------------------------------------------------------------------ 3. reading every page
console.log('\n== the paginated read and the failed-read branch');
function page(rows, more, next) {
  return { json: { success: true, data: rows,
    additional_data: { pagination: { start: 0, limit: 500, more_items_in_collection: more, next_start: next } } } };
}
const rawDeal = function (id) {
  return { id: id, title: 'Deal ' + id, stage_id: 1, status: 'open', value: 1000,
    user_id: { id: 11, name: 'Dana Reyes' }, org_id: { value: 1, name: 'Org' }, add_time: '2026-01-01 09:00:00' };
};
store('[cred] Pipedrive - open deals', [page([rawDeal(1), rawDeal(2)], true, 500),
  page([rawDeal(2), rawDeal(3)], false)]);
store('[cred] Pipedrive - activities', [page([{ id: 70, deal_id: 1, done: false, due_date: '2026-01-02' }], false)]);
store('[cred] Pipedrive - deal fields', [page([{ key: 'title', name: 'Title' }], false)]);
const read = run('guard', 'read the pipeline')[0].json;
ok(read.read_ok === true && read.pages.deals === 2, 'two pages of deals are read as one pipeline');
ok(read.deals.length === 3, 'a deal returned on both pages is counted once (3, not 4)');

store('[cred] Pipedrive - open deals', [page([rawDeal(1)], true, 500),
  { json: { error: { message: '429 Too Many Requests' } } }]);
const failedRead = run('guard', 'read the pipeline')[0].json;
ok(failedRead.read_ok === false && failedRead.failures[0].indexOf('deals') === 0,
   'a page that errors marks the read FAILED: "' + failedRead.failures[0] + '"');

store('[cred] Pipedrive - open deals', [page([rawDeal(1)], true, 500), page([rawDeal(2)], true, 1000)]);
const cutRead = run('guard', 'read the pipeline')[0].json;
ok(cutRead.read_ok === false && /MAX_PAGES/.test(cutRead.failures[0]),
   'MAX_PAGES cutting the read short is a failure, not a smaller pipeline');

const alert = store('build the read-failure alert',
  run('guard', 'build the read-failure alert', { json: failedRead }))[0].json;
ok(/FAILED/.test(alert._failure_body.text) && /not a clean pipeline/.test(alert._failure_body.text),
   'the alert says the rule was not checked, and why');
let failThrew = '';
try { run('guard', 'STOP: fail the run on a bad read'); } catch (e) { failThrew = e.message; }
ok(/Pipedrive read failed/.test(failThrew), 'and the execution then ends as FAILED');

// ------------------------------------------------------------------ 4. the demo pipeline
console.log('\n== the demo pipeline');
const pipe = store('STOP: demo pipeline', run('guard', 'STOP: demo pipeline'))[0].json;
store('one pipeline', [{ json: pipe }]);
ok(pipe.read_ok === true && pipe.deals.length > 15, pipe.deals.length + ' fabricated open deals');
ok(JSON.stringify(run('guard', 'STOP: demo pipeline')[0].json.deals) === JSON.stringify(pipe.deals),
   'deterministic — the same run twice gives the same pipeline');

// ------------------------------------------------------------------ 5. the PHI boundary
console.log('\n== the PHI boundary');
const phi = store('check the PHI boundary', run('guard', 'check the PHI boundary', { json: pipe }))[0].json;
ok(phi.phi_ok === true, 'a clean set of field names passes');
ok(phi.results_not_captured.length === 5, 'all five recruitment numbers report as "not captured"');
const dirty = clone(pipe);
dirty.deal_fields.push({ key: 'ff'.repeat(20), name: 'Screening response — pain scale' });
const dirtyOut = run('guard', 'check the PHI boundary', { json: dirty })[0].json;
ok(dirtyOut.phi_violations.length === 1 && dirtyOut.phi_blocked_keys.length === 1,
   'a PHI-shaped field already in the CRM is reported and blocked');
let threw = '';
withConfig({ result_fields: Object.assign({}, cfg.result_fields, { referrals_sent: 'ff'.repeat(20) }),
  touched_fields: [{ role: 'result', name: 'referrals_sent', key: 'ff'.repeat(20) }] }, function () {
  try { run('guard', 'check the PHI boundary', { json: dirty }); } catch (e) { threw = e.message; }
});
ok(threw.indexOf('PHI boundary') === 0, 'pointing config at a PHI-shaped field stops the run');

// ------------------------------------------------------------------ 6. the rule
console.log('\n== the rule: no open opportunity without a next activity');
const verdicts = store('check every deal for a next activity',
  run('guard', 'check every deal for a next activity', { json: phi }));
ok(verdicts.length === pipe.deals.length, 'one verdict per open deal');
const uncovered = verdicts.filter(function (v) { return !v.json.covered; });
const parked = verdicts.filter(function (v) { return !v.json.covered && v.json.parked_due; });
ok(uncovered.length > 0 && parked.length > 0, uncovered.length + ' uncovered, ' + parked.length +
   ' of them only "covered" by a task parked past the horizon');
const wide = withConfig({ horizon_days: 5000 }, function () {
  return run('guard', 'check every deal for a next activity', { json: phi });
});
ok(wide.filter(function (v) { return !v.json.covered; }).length === uncovered.length - parked.length,
   'with no horizon those parked deals would read as covered — the failure the horizon prevents');
ok(verdicts.every(function (v) { return v.json._has_work === true; }), 'the batch is routed to the guard');
ok(verdicts.filter(function (v) { return v.json.overdue; }).every(function (v) {
  return v.json.overdue_business_days >= cfg.overdue_days;
}), 'overdue is counted in business days against OVERDUE_DAYS');

// ------------------------------------------------------------------ 7. decide
console.log('\n== decide (preview, as it ships)');
const decided = store('decide the next activity', run('guard', 'decide the next activity', { items: verdicts }));
const by = function (a) { return decided.filter(function (d) { return d.json.action === a; }); };
const creates = by('create'), escalations = by('escalate'), reengage = by('reengage');
ok(creates.length > 0, creates.length + ' activities would be created');
ok(escalations.some(function (d) { return d.json.escalation_tier === 'owner'; }) &&
   escalations.some(function (d) { return d.json.escalation_tier === 'manager'; }),
   'overdue deals split into the owner tier and the manager tier — none gets a stacked task');
ok(reengage.length === 1, 'the quiet referral partner gets a re-engagement, not a check-in');
ok(decided.every(function (d) { return d.json._create === false; }), 'in preview nothing opens the write gate');
const today = new Date().toISOString().slice(0, 10);
ok(creates.concat(reengage).every(function (d) { return d.json.activity_due > today && isWeekday(d.json.activity_due); }),
   'every scheduled activity is due in the future, on a business day');

const levelled = withConfig({ max_per_owner_per_day: 1, level_within_days: 5 }, function () {
  return run('guard', 'decide the next activity', { items: verdicts });
});
const perOwnerDay = {};
levelled.filter(function (d) { return d.json.activity_due; }).forEach(function (d) {
  const k = d.json.assign_to + '|' + d.json.activity_due;
  perOwnerDay[k] = (perOwnerDay[k] || 0) + 1;
});
const shifted = levelled.filter(function (d) { return d.json.due_shifted_by > 0; });
ok(shifted.length > 0 && shifted.every(function (d) { return /moved \d+ business day/.test(d.json.action_reason); }),
   'MAX_PER_OWNER_PER_DAY = 1 moves ' + shifted.length + ' activities to a lighter day, and says so');
ok(Object.keys(perOwnerDay).every(function (k) {
  return perOwnerDay[k] === 1 || levelled.some(function (d) { return d.json.owner_over_capacity; });
}), 'no rep gets two new activities on one day unless the whole window is full (and that is flagged)');

const capped = withConfig({ daily_cap: 3 }, function () {
  return run('guard', 'decide the next activity', { items: verdicts });
}).filter(function (d) { return d.json.action === 'create' || d.json.action === 'reengage'; });
ok(capped.length === 3, 'DAILY_CAP = 3 produces exactly 3 actions');
const allQuiets = creates.concat(reengage).map(function (d) { return d.json.days_quiet; })
  .sort(function (a, b) { return b - a; });
ok(Math.min.apply(null, capped.map(function (d) { return d.json.days_quiet; })) >= allQuiets[2],
   'and keeps the deals that have been quiet longest');

// ------------------------------------------------------------------ 8. summary + memory
console.log('\n== the summary, the memory and the three messages');
const held = decided.map(function (d, i) {
  currentPair = i;
  return run('guard', 'STOP: not created', { json: d.json })[0];
});
store('STOP: not created', held);
ok(held.filter(function (h) { return h.json.outcome.indexOf('would create') === 0; }).length === creates.length,
   'every activity it would have created is listed with its due date');
const summary = store('build the run summary', run('guard', 'build the run summary', { items: held }))[0].json;
ok(summary.open_deals === pipe.deals.length && summary.would_create === creates.length + reengage.length,
   'the summary counts every open deal and every would-be activity');
ok(summary.coverage_pct < 100 && summary.coverage_pct_after === summary.coverage_pct,
   'coverage is honest and does not improve in preview (' + summary.coverage_pct + '%)');
ok(summary.owner_tier.length > 0 && summary.manager_tier.length > 0,
   summary.owner_tier.length + ' owner-tier, ' + summary.manager_tier.length + ' manager-tier escalations');

const compared = store('compare with earlier runs', run('guard', 'compare with earlier runs', { json: summary }))[0].json;
ok(compared.memory_source === 'demo fixture' && compared.memory_persisted === false &&
   Object.keys(staticData).length === 0, 'preview reads the seeded demo memory and writes nothing');
ok(compared.manager_already_told.length === 1, 'a deal told to the manager yesterday is not repeated');
ok(compared.manager_reminders.length === 1, 'one told nine days ago and still open gets a reminder');
ok(compared.resolved_since_escalation.indexOf('Old Mill Pain Clinic') !== -1, 'a resolved deal is reported as resolved');
ok(/vs \d{4}-\d{2}-\d{2}: coverage 48% ->/.test(compared.summary), 'the summary carries the coverage trend');
ok(compared.summary.indexOf('PREVIEW') !== -1, 'and says which mode it ran in');

const esc = run('guard', 'build the escalation', { json: compared })[0].json._escalation_body.text;
ok(/management escalation/.test(esc) && /\[again, first told/.test(esc),
   'the manager gets new deals plus marked reminders, grouped by rep');

const dms = run('guard', 'build one message per owner', { json: compared });
ok(dms.length === 3 && dms.every(function (m) { return m.json.send_to === '' && m.json.held_because; }),
   'one DM per rep (3), built but held in preview with the reason');
ok(dms.some(function (m) { return /overdue — please clear/.test(m.json.text); }),
   'a rep\'s DM lists what they are overdue on before it reaches the manager');
const testDms = withConfig({ mode: 'test', preview_only: false, test_write: true, test_owner_id: '11',
  slack_dm_enabled: true, owner_slack_ids: { 11: 'U0TEST', 12: 'U0MARCUS' } }, function () {
  return run('guard', 'build one message per owner', { json: compared });
});
const sentDms = testDms.filter(function (m) { return m.json.send_to; });
ok(sentDms.length > 0 && sentDms.every(function (m) {
  return m.json.send_to === 'U0TEST' && m.json.text.indexOf('[TEST]') === 0;
}), 'test mode redirects every DM to the test user, prefixed [TEST] — no real rep is messaged');

// The memory, live: first run tells, second run does not repeat, later runs remind.
staticData = {};
outputs['one pipeline'] = [{ json: Object.assign({}, pipe, { source: 'pipedrive', _demo_memory: undefined }) }];
const liveCfg = { mode: 'live', preview_only: false, live_write: true, write_enabled: true };
const run1 = withConfig(liveCfg, function () { return run('guard', 'compare with earlier runs', { json: summary })[0].json; });
const run2 = withConfig(liveCfg, function () { return run('guard', 'compare with earlier runs', { json: summary })[0].json; });
ok(run1.manager_new.length === summary.manager_tier.length && run1.memory_persisted === true,
   'live, first run: every manager-tier deal is new, and the memory is saved');
ok(run2.manager_new.length === 0 && run2._has_escalations === false,
   'live, same day again: nothing is re-sent to the manager');
Object.keys(staticData.escalated).forEach(function (k) {
  staticData.escalated[k].last = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
});
const run3 = withConfig(liveCfg, function () { return run('guard', 'compare with earlier runs', { json: summary })[0].json; });
ok(run3.manager_reminders.length === summary.manager_tier.length,
   'live, two weeks later and still open: each one is re-sent once as a reminder');
outputs['one pipeline'] = [{ json: pipe }];
staticData = {};

// ------------------------------------------------------------------ 9. a live run
console.log('\n== a live run (Pipedrive stubbed)');
withConfig(liveCfg, function () {
  const liveDecided = store('decide the next activity', run('guard', 'decide the next activity', { items: verdicts }));
  const toWrite = liveDecided.filter(function (d) { return d.json._create; });
  ok(toWrite.length === creates.length + reengage.length, toWrite.length + ' activities open the write gate');
  ok(toWrite.every(function (d) { return d.json._body.due_date === d.json.activity_due && d.json._body.user_id; }),
     'each POST /activities body carries the levelled due date and the owner');
  const written = toWrite.map(function (d) {
    currentPair = liveDecided.indexOf(d);
    return run('guard', 'record what was created', { json: { success: true, data: { id: 5000 + currentPair } } })[0];
  });
  currentPair = liveDecided.indexOf(toWrite[0]);
  const rejected = run('guard', 'record what was created', { json: { success: false, error: 'activity type not found' } })[0];
  ok(rejected.json.written === false && rejected.json.outcome.indexOf('FAILED') === 0,
     'a rejected create is recorded as failed, not as handled');
  const liveHeld = liveDecided.filter(function (d) { return !d.json._create; })
    .map(function (d) { return run('guard', 'STOP: not created', { json: d.json })[0]; });
  const liveSummary = run('guard', 'build the run summary', { items: written.concat(liveHeld) })[0].json;
  ok(liveSummary.created === toWrite.length && liveSummary.coverage_pct_after > liveSummary.coverage_pct,
     'coverage improves from ' + liveSummary.coverage_pct + '% to ' + liveSummary.coverage_pct_after + '% — measured');
});

// ------------------------------------------------------------------ 10. the clean paths
console.log('\n== pipelines with nothing to do');
const cleanPipe = clone(phi); cleanPipe.deals = []; cleanPipe.activities = [];
const none = run('guard', 'check every deal for a next activity', { json: cleanPipe });
ok(none.length === 1 && none[0].json._has_work === false, 'no deals -> one item, routed to the clean branch');
const noneStop = run('guard', 'STOP: every open deal is covered', { items: none })[0].json;
ok(/No open deals/.test(noneStop.headline), 'and it still produces a summary');
// Every deal covered, nothing overdue: the guard rests, but the report must still count them.
const coveredPipe = clone(phi);
coveredPipe.activities = coveredPipe.deals.map(function (d, i) {
  return { id: 1e5 + i, deal_id: d.id, type: 'follow_up_call', done: false,
    due_date: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10), due_time: '09:00' };
}).concat(coveredPipe.activities.filter(function (a) { return a.done; }));
coveredPipe.deals.forEach(function (d) { d.value = 1000; });
const allCovered = run('guard', 'check every deal for a next activity', { json: coveredPipe });
ok(allCovered.length === pipe.deals.length && allCovered.every(function (v) { return v.json._has_work === false; }),
   'a fully covered pipeline still fans out per deal, flagged as nothing to do');
const cleanSummary = run('guard', 'build the run summary',
  { items: run('guard', 'STOP: every open deal is covered', { items: allCovered }) })[0].json;
ok(cleanSummary.open_deals === pipe.deals.length && cleanSummary.coverage_pct === 100,
   'and the summary reports ' + cleanSummary.open_deals + ' deals at 100%');

// ------------------------------------------------------------------ 11. the weekly report
console.log('\n== the weekly report');
const kpis = store('compute the KPIs', run('report', 'compute the KPIs', { items: verdicts }))[0].json;
ok(kpis.open_deals === pipe.deals.length && kpis.gaps === uncovered.length,
   'open deals and gaps match the guard, not a second definition');
ok(kpis.outreach_attempts >= kpis.conversations, 'attempts (' + kpis.outreach_attempts +
   ') >= conversations (' + kpis.conversations + ')');
ok(kpis.referrals_sent === null, 'an un-wired recruitment field is null, never 0');
ok(kpis.by_rep.reduce(function (a, r) { return a + r.open_deals; }, 0) === kpis.open_deals,
   'the by-rep split adds back up to the whole pipeline');
const coveredKpis = run('report', 'compute the KPIs', { items: allCovered })[0].json;
ok(coveredKpis.open_deals === pipe.deals.length && coveredKpis.gaps === 0,
   'a fully covered pipeline is reported as ' + coveredKpis.open_deals + ' deals, not as an empty one');

const demoBase = store('STOP: no sheet history', run('report', 'STOP: no sheet history'))[0].json;
ok(demoBase.baseline && /demo fixture/.test(demoBase.baseline_source), 'the demo carries last week\'s row');
const C = cfg.dashboard_columns;
const sheetRow = function (daysAgo, coverage) {
  const r = {};
  r[C.run_at] = new Date(Date.now() - daysAgo * 86400000).toISOString().slice(0, 19).replace('T', ' ');
  r[C.coverage_pct] = coverage; r[C.gaps] = 9; r[C.referrals_sent] = 'not captured';
  return { json: r };
};
const picked = run('report', "pick last week's row", { items: [sheetRow(14, 40), sheetRow(7, 55), sheetRow(0, 99)] })[0].json;
ok(picked.baseline.coverage_pct === 55 && picked.baseline.referrals_sent === null,
   'from the sheet history it picks last week (not this morning\'s re-run), and "not captured" stays null');
const failedPick = run('report', "pick last week's row", { items: [{ json: { error: { message: '403' } } }] })[0].json;
ok(failedPick.baseline === null && /failed/.test(failedPick.baseline_source), 'a failed history read gives no baseline, said so');

const compare = store('compare with last week', run('report', 'compare with last week', { json: demoBase }))[0].json;
const cov = compare.deltas.filter(function (d) { return d.kpi === 'coverage_pct'; })[0];
ok(cov.was === 48 && cov.delta === kpis.coverage_pct - 48, 'coverage week over week: 48% -> ' + kpis.coverage_pct + '%');
ok(compare.deltas.filter(function (d) { return d.kpi === 'referrals_sent'; })[0].delta === null,
   'no delta is invented for a number that is not captured');
ok(compare.coaching.length > 0, compare.coaching.length + ' coaching flag(s): ' +
   compare.coaching.map(function (c) { return c.rep + ' — ' + c.flag; }).join('; '));

const dashRow = run('report', 'rows for the dashboard', { json: compare })[0].json;
ok(dashRow[C.referrals_sent] === 'not captured' && Object.keys(dashRow).length === 20,
   'the dashboard row has 20 columns and says "not captured", not 0');
ok(run('report', 'rows for the gaps tab').length === kpis.gaps, 'the Gaps tab gets one row per uncovered deal');
const noSheet = run('report', 'STOP: no sheet')[0].json;
ok(/demo|SHEET_ID/.test(noSheet.held_because), 'without a live sheet nothing is written, and it says why');
const report = run('report', 'build the management report', { json: noSheet })[0].json.report;
ok(/Against last week/.test(report) && /Worth a conversation/.test(report),
   'the digest carries week-over-week and the coaching flags');
ok(/not captured/.test(report) && /Quietest uncovered deals/.test(report),
   'and still lists setup gaps and the three deals to ask about');

console.log('\n' + pass + ' passed, ' + failures.length + ' failed');
if (failures.length) {
  failures.forEach(function (f) { console.log('  - ' + f); });
  process.exit(1);
}
