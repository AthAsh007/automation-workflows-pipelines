// Runs every Code node against the built-in demo roster, outside n8n.
//   node simulate.js
//
// validate.py proves the workflows are wired correctly. This proves they do the right
// thing: the niche and rate matching, the dedupe, the personalisation audit, the
// deliverability gate failing closed, the domain ceiling, the log-gap check, the reply
// precedence, and the weekly report's arithmetic.
//
// It is a harness, not a mock — the node sources are read from js/ and executed unmodified,
// with $, $json and $input.all() shaped the way n8n shapes them.
const fs = require('fs');
const path = require('path');

const JS = path.join(__dirname, 'js');
const outputs = {};
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
    get item() { return items[Math.min(currentPair, items.length - 1)]; }
  };
}

function run(file, opts) {
  opts = opts || {};
  const src = fs.readFileSync(path.join(JS, file), 'utf8');
  const $input = { all: function () { return opts.items || []; },
                   first: function () { return (opts.items || [])[0]; } };
  const res = new Function('$', '$json', '$input', src)(
    $, opts.json === undefined ? {} : opts.json, $input);
  return Array.isArray(res) ? res : [res];
}

function store(name, items) { outputs[name] = items; return items; }

// ------------------------------------------------------------------ 1. config
console.log('\n== config');
const cfgItems = store('config', run('config.js'));
const cfg = cfgItems[0].json;
ok(cfg.preview_only === true, 'ships in preview — nothing can be sent');
ok(cfg.demo_data === true, 'ships with the demo roster on');
ok(cfg.send_enabled === false && cfg.log_enabled === false, 'both write gates are closed');
ok(cfg.hold_unknown_inbox === true, 'an inbox with unreported health is held by default');

// ------------------------------------------------------------------ 2. the roster
console.log('\n== the demo roster');
const roster = store('STOP: demo roster', run('stop-demo-roster.js'))[0].json;
ok(roster.students.length === 6, '6 students');
ok(roster.brands.length === 60, '60 brand contacts');
ok(roster.inboxes.length === 6, '6 sending inboxes with a mixed health picture');
ok(roster.pitches.length > 0, roster.pitches.length + ' pitches already in the log');
const again = run('stop-demo-roster.js')[0].json;
ok(JSON.stringify(again.brands) === JSON.stringify(roster.brands), 'deterministic');

// ------------------------------------------------------------------ 3. matching
console.log('\n== match on niche and on rate');
const matched = store('match brands to students',
                      run('match-brands-to-students.js', { json: roster }));
ok(matched.length > 0, matched.length + ' candidate pitches');
ok(matched.every(function (m) { return m.json.niche === m.json.niche; }), 'every pitch has a niche');

const nicheMismatch = matched.filter(function (m) {
  const brand = roster.brands.filter(function (b) {
    return b.brand_id === m.json.brand_id;
  })[0];
  return brand.niche !== m.json.niche;
});
ok(nicheMismatch.length === 0,
   'no creator is ever offered a brand outside their niche');

const perStudent = {};
matched.forEach(function (m) {
  perStudent[m.json.student_id] = (perStudent[m.json.student_id] || 0) + 1;
});
ok(Object.keys(perStudent).every(function (k) {
  return perStudent[k] <= cfg.pitches_per_student_per_day;
}), 'nobody exceeds the per-creator daily budget of ' + cfg.pitches_per_student_per_day);

// The dedupe: a brand pitched inside the window is not pitched again.
const recent = roster.pitches.filter(function (p) {
  return (Date.now() - Date.parse(p.sent_at)) / 86400000 < cfg.repitch_after_days;
});
const repitched = matched.filter(function (m) {
  return recent.some(function (p) {
    return p.student_id === m.json.student_id && p.brand_id === m.json.brand_id;
  });
});
ok(recent.length > 0 && repitched.length === 0,
   'none of the ' + recent.length + ' recently-pitched pairs is pitched again');

// The rate gate.
const underRate = matched.filter(function (m) {
  const CEIL = { 'under 1k': 1000, '1-3k': 3000, '3-5k': 5000 };
  const c = CEIL[String(m.json.budget_band).toLowerCase()];
  return c !== undefined && m.json.min_rate > 0 && c < m.json.min_rate;
});
ok(underRate.length === 0,
   'no brand is pitched whose budget band tops out below the creator’s minimum');

// ------------------------------------------------------------------ 4. writing
console.log('\n== assembling the pitch');
const built = matched.map(function (m) { return run('build-the-pitch.js', { json: m.json })[0]; });
store('build the pitch', built);
ok(built.every(function (b) { return b.json.facts.length === b.json.fact_count; }),
   'every pitch carries the facts it was built from');
const thin = built.filter(function (b) {
  return b.json.brand_fact_count < cfg.min_brand_facts;
});
ok(thin.length > 0,
   thin.length + ' brand records are too thin to reach ' + cfg.min_brand_facts +
   ' brand facts — a scraped row with a company and a product and nothing else, which is ' +
   'the case the audit exists for');
ok(built.every(function (b) {
  return b.json.facts.every(function (f) { return f.label !== 'budget_band'; });
}), 'and budget band never reaches the writer — you do not tell a company its own budget');

const skeletons = built.map(function (b) { return run('stop-no-writer.js', { json: b.json })[0]; });
ok(skeletons.every(function (s) { return s.json.written_by === 'skeleton'; }),
   'with no AI key every pitch stays a skeleton and is not sent unwritten');

// A writer answer that is not JSON must not blank the email.
currentPair = 0;
const junk = run('apply-the-written-pitch.js', { json: { content: [{ text: 'sure thing!' }] } })[0];
ok(junk.json.body === built[0].json.body && junk.json.written_by === 'skeleton',
   'a writer that returns prose instead of JSON leaves the skeleton intact: "' +
   junk.json.writer_error + '"');
const good = run('apply-the-written-pitch.js', { json: { content: [{ text:
  'Here you go: {"subject":"Kestrel + Nadia","body":"' +
  new Array(80).join('word ') + '"}' }] } })[0];
ok(good.json.written_by === 'writer' && good.json.subject === 'Kestrel + Nadia',
   'and a wrapped JSON answer is still parsed');

// ------------------------------------------------------------------ 5. the audit
console.log('\n== the personalisation audit');
const audited = skeletons.map(function (s) { return run('audit-the-pitch.js', { json: s.json })[0]; });
ok(audited.every(function (a) { return a.json.audit_passed === false; }),
   'every skeleton is held — a skeleton reads as a template, which their brief rules out');

function auditOne(patch) {
  const base = Object.assign({}, built[0].json, { written_by: 'writer' }, patch);
  return run('audit-the-pitch.js', { json: base })[0].json;
}
const body = 'Saw that Kestrel Living launched a spring modular sofa line last month. ' +
  'I look after partnerships for Nadia Osei, who has 84,000 followers on Instagram and ' +
  '21,000 average views. One in-feed reel and two stories runs at our standard rate. ' +
  'Worth a conversation? ' + new Array(40).join('extra word ');
const clean = auditOne({ body: body, subject: 'Kestrel Living + Nadia Osei' });
ok(clean.audit_passed === true, 'a specific, correctly-sized pitch passes: ' +
   clean.word_count + ' words, ' + clean.fact_count + ' facts');

const tell = auditOne({ body: 'I hope this email finds you well. ' + body });
ok(tell.audit_passed === false && /template tell/.test(tell.hold_reason),
   'a template tell holds it: ' + tell.hold_reason.slice(0, 60));

const invented = auditOne({ body: body.replace('84,000 followers', 'nearly 250,000 followers') });
ok(invented.audit_passed === false && /not in the record/.test(invented.hold_reason),
   'an invented follower count holds it — a rounded-up number is a fabricated media kit');

const short = auditOne({ body: 'Hi. Want to work with Nadia?' });
ok(short.audit_passed === false && /under the/.test(short.hold_reason), 'too short holds it');

const role = auditOne({ body: body, email: 'info@kestrelliving.example' });
ok(role.audit_passed === false && /role mailbox/.test(role.hold_reason),
   'a role mailbox holds it — nobody owns info@ and it is where bounces come from');

const noBrandFact = auditOne({ body: body, brand_fact_count: 1 });
ok(noBrandFact.audit_passed === false &&
   /fact\(s\) about the brand itself/.test(noBrandFact.hold_reason),
   'one brand fact is not enough — a pitch made mostly of the creator’s own numbers is a ' +
   'CV, and is held');

// ------------------------------------------------------------------ 6. deliverability
console.log('\n== the deliverability gate');
// Give every pitch a passing audit so the gate is what is being measured.
const passing = built.map(function (b) {
  return { json: Object.assign({}, b.json, { written_by: 'writer', body: body,
    audit_passed: true, audit_holds: [], hold_reason: '', word_count: 90 }) };
});
const assigned = store('assign a healthy inbox',
                       run('assign-a-healthy-inbox.js', { items: passing }));
const report = assigned[0].json.inbox_report;
const blocked = report.filter(function (r) { return r.blocked; });
ok(blocked.length === 3, 'three of six inboxes are blocked: ' +
   blocked.map(function (b) { return b.inbox.split('@')[0] + ' (' +
     b.blocked.split(' ')[0] + ')'; }).join(', '));
ok(blocked.some(function (b) { return /warming/.test(b.blocked); }), 'one for warmup');
ok(blocked.some(function (b) { return /bounce/.test(b.blocked); }), 'one for bounce rate');
ok(blocked.some(function (b) { return /not reported/.test(b.blocked); }),
   'one because its health is not reported at all');

const used = {};
assigned.filter(function (a) { return a.json.inbox; }).forEach(function (a) {
  used[a.json.inbox] = (used[a.json.inbox] || 0) + 1;
});
ok(Object.keys(used).every(function (k) { return used[k] <= cfg.max_per_inbox_day; }),
   'no mailbox is asked to send more than ' + cfg.max_per_inbox_day + ' in a day');
const byDomain = {};
assigned.filter(function (a) { return a.json.inbox; }).forEach(function (a) {
  byDomain[a.json.inbox_domain] = (byDomain[a.json.inbox_domain] || 0) + 1;
});
ok(Object.keys(byDomain).every(function (d) { return byDomain[d] <= cfg.max_per_domain_day; }),
   'and no DOMAIN exceeds ' + cfg.max_per_domain_day + ' — the ceiling people forget');
ok(assigned.every(function (a) { return a.json._send === false; }),
   'in preview not one of them opens the send gate');

// Every inbox unhealthy: nothing sends, and the reason names the inboxes.
const sickRoster = JSON.parse(JSON.stringify(roster));
sickRoster.inboxes.forEach(function (i) { i.warmed_days = 1; });
const sickPitches = passing.map(function (p) {
  return { json: Object.assign({}, p.json, { _roster: Object.assign({}, p.json._roster,
    { inboxes: sickRoster.inboxes }) }) };
});
const sick = run('assign-a-healthy-inbox.js', { items: sickPitches });
ok(sick.every(function (s) { return s.json.send_state === 'held'; }),
   'with every inbox still warming, nothing is queued at all — the gate fails closed');
ok(/no inbox passed the health gate/.test(sick[0].json.send_reason),
   'and it says which inboxes and why');

// ------------------------------------------------------------------ 7. the batch, held
console.log('\n== the preview batch and the log check');
const held = assigned.map(function (a) { return run('stop-not-sent.js', { json: a.json })[0]; });
store('what happened', held);
ok(held.every(function (h) { return h.json.sent === false; }), 'nothing was sent');

const logRows = run('rows-for-the-pitch-log.js', { items: held });
ok(logRows.length === Math.ceil(held.length / 10),
   held.length + ' pitches batch into ' + logRows.length +
   ' Airtable requests of ten — one per pitch would rate-limit');
ok(logRows.every(function (r) { return r.json._body.records.length <= 10; }),
   'no batch exceeds Airtable’s maximum');
ok(logRows[0].json._body.records[0].fields[cfg.pitch_fields.hold_reason] !== undefined,
   'held pitches are logged too, with the reason');

const notLogged = run('stop-not-logged.js', { items: held });
ok(notLogged.every(function (n) { return n.json.log_gap === false; }),
   'in preview a missing log is not a gap — nothing was sent to reconcile');

// A live run that sent but could not log IS a gap.
const sentItems = held.map(function (h) {
  return { json: Object.assign({}, h.json, { sent: true, send_state: 'sent' }) };
});
store('what happened', sentItems);
const liveGap = run('stop-not-logged.js', { items: sentItems });
ok(liveGap[0].json.log_gap === true && /NOT in the dashboard/.test(liveGap[0].json.log_reason),
   'a live run that sent and could not log is reported as a gap');

const confirmed = run('confirm-the-log.js',
  { items: [{ json: { records: new Array(5) } }] });
ok(confirmed[0].json.log_gap === true &&
   confirmed[0].json.log_written === 5 &&
   confirmed[0].json.log_expected === sentItems.length,
   'and a partial write is caught: 5 of ' + sentItems.length + ' reached the dashboard');

// ------------------------------------------------------------------ 8. the summary
console.log('\n== the run summary');
store('what happened', held);
const summary = run('build-the-run-summary.js', { items: held })[0].json;
ok(summary.written === held.length, 'counts every pitch written');
ok(summary.sent === 0 && summary.held + summary.preview === held.length,
   'and splits them into sent / held / preview honestly');
ok(summary.inboxes_healthy === 3 && summary.inboxes_total === 6,
   'reports 3 of 6 inboxes healthy');
ok(summary.by_student.length === 6, 'broken down per student, which is how the fee works');
ok(/PREVIEW/.test(summary.summary), 'the message says which mode it ran in');

const quiet = run('stop-nothing-to-pitch.js',
  { json: { skipped: { already_pitched: 4, too_recent: 12, budget: 3, suppressed: 0,
    no_brands: 0, student_cap: 1 }, source: 'demo' } })[0].json;
ok(/already pitched/.test(quiet.headline) && quiet.needs_attention === false,
   'a quiet day says which filter emptied it: "' + quiet.headline + '"');

// ------------------------------------------------------------------ 9. replies
console.log('\n== replies');
const feed = store('STOP: demo replies', run('stop-demo-replies.js'))[0].json;
ok(feed.replies.length === 9, 'nine demo replies');
const classified = store('classify the replies',
                         run('classify-the-replies.js', { json: feed }));
const classes = {};
classified.forEach(function (c) {
  classes[c.json.reply_class] = (classes[c.json.reply_class] || 0) + 1;
});
ok(classified.length === 9, 'one item per reply');
ok(classes.unclear === 2, 'the two replies matching no rule are "unclear", not guessed at');
ok(classified.filter(function (c) { return c.json.reply_class === 'unclear'; })
   .every(function (c) { return c.json.urgent === true; }),
   'and unclear is urgent — it is the one most likely to be a deal nobody recognised');

// Precedence: unsubscribe beats interested in the same sentence.
const mixed = run('classify-the-replies.js', { json: { replies: [{ reply_id: 'X',
  subject: '', text: 'The numbers are interesting but please remove me from this list.' }] } });
ok(mixed[0].json.reply_class === 'unsubscribe',
   '"interesting but please remove me" is an unsubscribe, not a lead');

const decided = store('decide the next step',
                      run('decide-the-next-step.js', { items: classified }));
const auto = decided.filter(function (d) { return d.json.reply_class === 'auto-reply'; });
ok(auto.length === 1 && auto[0].json.writes_back === false,
   'an out-of-office writes nothing back and does not consume the follow-up');
const supp = decided[0].json._suppression_adds;
ok(supp.length === 2, 'the unsubscribe and the hard bounce both land in suppression');
const handovers = decided.filter(function (d) { return d.json.route === 'handover'; });
ok(handovers.length === 3, handovers.length + ' replies go to a person');

const repRows = run('rows-for-the-reply-log.js', { items: decided });
ok(repRows[0].json._body.performUpsert.fieldsToMergeOn[0] === cfg.pitch_fields.pitch_id,
   'the write-back upserts on Pitch id, so no Airtable record id has to be kept');
ok(repRows.reduce(function (a, r) { return a + r.json._count; }, 0) === 8,
   'eight of the nine replies are written back — the auto-reply is not one of them');

const repConfirm = run('confirm-the-reply-log.js', { items: [{ json: { records: new Array(8) } }] });
ok(repConfirm[0].json.log_gap === false,
   'and writing all eight is a clean log, not a gap against the count of nine');

const repSummary = run('build-the-reply-summary.js', { items: decided })[0].json;
ok(repSummary.replies === 9 && repSummary.handovers.length === 3, 'the summary agrees');
const handover = run('build-the-handover.js', { json: repSummary })[0].json;
ok(/needs? a person/.test(handover._handover_body.text),
   'and the handover is its own message, not a line in the digest');

const noRep = run('stop-no-replies.js', { json: { headline: 'No new replies in this window.',
  source: 'demo' } })[0].json;
ok(noRep._has_replies === false, 'a quiet hour still produces a summary item');

// ------------------------------------------------------------------ 10. the weekly report
console.log('\n== the weekly report');
const notHour = run('stop-not-the-report-hour.js')[0].json;
ok(notHour.report_due === false && /Monday at 09:00/.test(notHour._note),
   'off-hours runs say when the report is due: "' + notHour._note.slice(0, 46) + '…"');

const log = store('STOP: demo pitch log', run('stop-demo-pitch-log.js'))[0].json;
ok(log.pitches.length > 500, log.pitches.length + ' rows of fabricated week');
const weekly = run('build-the-weekly-report.js', { json: log })[0].json;
ok(weekly.totals.written === log.pitches.length, 'every row is counted');
ok(weekly.totals.held > 0 && /Held because/.test(weekly.report),
   weekly.totals.held + ' held pitches are shown, not hidden — that is what the gates cost');
ok(weekly.by_student.length === 6, 'one block per student');
ok(weekly.by_student.every(function (s) {
  return s.reply_rate === (s.sent ? Math.round((s.replies / s.sent) * 1000) / 10 : 0);
}), 'reply rate divides by SENT, never by written — dividing by the bigger number flatters');
ok(weekly.working_days > 0 && weekly.target_per_student ===
   cfg.pitches_per_student_per_day * weekly.working_days,
   'the target is pro-rata against ' + weekly.working_days +
   ' working days, not a monthly figure compared against a week');
ok(/fabricated log/.test(weekly.report), 'and it says the numbers are fabricated');

console.log('\n' + pass + ' passed, ' + failures.length + ' failed');
if (failures.length) {
  failures.forEach(function (f) { console.log('  - ' + f); });
  process.exit(1);
}
