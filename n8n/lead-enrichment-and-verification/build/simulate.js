// Runs every Code node in the workflow against the sample data, in the order n8n would run
// them, with the three HTTP calls faked from sample/*.json. Nothing here talks to a network.
//   node simulate.js
//
// Two scenarios, because both matter:
//   A  everything configured — Apollo, the AI classifier, a verifier, a test campaign
//   B  nothing configured, DEMO_VERIFIER on — the state the workflow ships in, and the one
//      the walkthrough video is recorded in
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const wf = JSON.parse(fs.readFileSync(path.join(ROOT, '..', '01-enrich-and-verify.json'), 'utf8'));
const NODES = {};
for (const n of wf.nodes) if (n.type === 'n8n-nodes-base.code') NODES[n.name] = n;
const sample = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, '..', 'sample', f), 'utf8'));

const ORGS = sample('organisations.json');
const APOLLO = sample('apollo-people.json');
const VERDICTS = sample('verifier-verdicts.json');
const AI = sample('ai-replies.json');

let failures = 0;
const expect = (label, got, want) => {
  const ok = String(got) === String(want);
  console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  ' + String(label).padEnd(46) + got);
  if (!ok) { failures++; console.log('        expected: ' + want); }
};

// ---------------------------------------------------------------- the little n8n
// Enough of the Code-node runtime to run the real jsCode unchanged: $input, $('node'),
// and the item pairing the parse nodes use to line a provider's answer back up with the
// contact it was about.
function makeRuntime() {
  const store = {};

  const accessor = (arr) => {
    const wrap = (a) => a.map((j) => ({ json: j }));
    return {
      all: (branch) => wrap(branch === undefined ? arr : (arr._branches ? arr._branches[branch] || [] : arr)),
      first: () => ({ json: arr[0] }),
      last: () => ({ json: arr[arr.length - 1] }),
      itemMatching: (i) => {
        const src = arr._branches ? arr._branches[0] || arr : arr;
        if (!src[i]) throw new Error('no paired item ' + i);
        return { json: src[i] };
      }
    };
  };

  function run(nodeName, inputItems, extra) {
    const node = NODES[nodeName];
    if (!node) throw new Error('no Code node named ' + nodeName);
    const items = inputItems.map((j) => (j && j.json ? j.json : j));
    const $input = {
      all: () => items.map((j) => ({ json: j })),
      first: () => ({ json: items[0] }),
      last: () => ({ json: items[items.length - 1] })
    };
    const ctx = Object.assign({}, store, extra || {});
    const $ = (name) => {
      if (!ctx[name]) throw new Error('simulate: node "' + name + '" has no recorded output');
      return accessor(ctx[name]);
    };
    const out = new Function('$input', '$', '"use strict";' + node.parameters.jsCode)($input, $);
    store[nodeName] = out.map((o) => o.json);
    return store[nodeName];
  }

  return { run: run, store: store, record: (name, arr) => { store[name] = arr; } };
}

// ---------------------------------------------------------------- the fake providers
const aiReply = (org) => AI[org.org_name] || { error: { message: 'no sample reply' } };

const apolloReply = (org) => APOLLO[org.domain] || APOLLO[org.org_name]
  || { people: [], message: 'no sample for ' + (org.domain || org.org_name) };

const verifierReply = (contact) => VERDICTS[contact.email]
  // Not in the sample file: exactly what a timeout or a spent credit looks like.
  || { email: contact.email };

// ---------------------------------------------------------------- one whole run
function runPipeline(label, tweakConfig, rows) {
  rows = rows || ORGS;
  console.log('\n=== ' + label + ' ===');
  const rt = makeRuntime();
  const run = rt.run;

  const cfg = run('config', [{}])[0];
  tweakConfig(cfg);
  rt.record('config', [cfg]);
  console.log('  mode: ' + cfg.mode + '   apollo: ' + cfg.apollo_enabled + '   verifier: '
    + cfg.verifier_enabled + '   ai: ' + cfg.ai_enabled + '   push: ' + cfg.push_enabled
    + (cfg.forced_preview ? '   (forced to preview)' : ''));

  const batch = run("pick this run's batch", rows);
  if (!batch[0]._has_work) {
    console.log('  nothing to enrich: ' + JSON.stringify(run('STOP: nothing to enrich', batch)[0]));
    return { rt: rt, cfg: cfg, batch: batch };
  }

  const orgs = run('normalise the organisation', batch);

  // IF: AI classification needed?
  const needAi = orgs.filter((o) => o._needs_ai);
  const noAi = orgs.filter((o) => !o._needs_ai);
  let classified = [];
  if (needAi.length) {
    rt.record('AI classification needed?', Object.assign(needAi, { _branches: [needAi, noAi] }));
    classified = run('apply the AI classification', needAi.map(aiReply),
                     { 'AI classification needed?': Object.assign(needAi.slice(), { _branches: [needAi, noAi] }) });
  }
  const keywordOnly = noAi.length ? run('STOP: keyword rules only', noAi) : [];
  const merged = classified.concat(keywordOnly);   // "one list of organisations"

  // IF: Apollo configured?
  let contacts;
  if (cfg.apollo_enabled) {
    contacts = run("read Apollo's people", merged.map(apolloReply),
                   { 'Apollo configured?': Object.assign(merged.slice(), { _branches: [merged, []] }) });
  } else {
    contacts = run('STOP: Apollo not configured', merged);
  }

  const scored = run('score against the ICP', contacts);

  // IF: verification possible?
  const verifiable = scored.filter((c) => c._verifiable);
  const rest = scored.filter((c) => !c._verifiable);
  let verified = [];
  if (verifiable.length) {
    verified = run('apply the verification', verifiable.map(verifierReply),
                   { 'verification possible?': Object.assign(verifiable.slice(), { _branches: [verifiable, rest] }) });
  }
  const held = rest.length ? run('STOP: unverified - held back', rest) : [];
  const all = verified.concat(held);               // "one list of verdicts"

  const decided = run('decide who is safe to email', all);
  const orgRows = run('rows for the organisations tab', decided);

  let summaryInput = orgRows;
  if (orgRows[0]._contacts_to_write) {
    const contactRows = run('rows for the contacts tab', orgRows);
    if (orgRows[0]._any_safe) {
      const payload = run('payload for the campaign', contactRows);
      const replies = payload.map((p, i) => (i === 0
        // First one is refused, to prove a rejection is not recorded as pushed.
        ? { error: 'lead already exists in another campaign' }
        : { id: 'lead_' + (i + 1), campaign: p._campaign_id }));
      summaryInput = run('record what was pushed', replies,
                         { 'payload for the campaign': payload });
    } else {
      summaryInput = run('STOP: not pushed', contactRows);
    }
  } else {
    summaryInput = run('STOP: no contacts found', orgRows);
  }

  const summary = run('build the run summary', summaryInput);
  return { rt: rt, cfg: cfg, batch: batch, orgs: orgs, decided: decided, orgRows: orgRows,
           summary: summary[0], store: rt.store };
}

// =============================================================== A: fully configured
const A = runPipeline('A — Apollo, AI classifier, verifier and a test campaign all configured',
  (cfg) => {
    cfg.apollo_api_key = 'sim-apollo';
    cfg.verifier_api_key = 'sim-verifier';
    cfg.ai_api_key = 'sim-ai';
    cfg.instantly_api_key = 'sim-instantly';
    cfg.campaign_id = 'campaign-test-0001';
    cfg.apollo_enabled = cfg.verifier_enabled = cfg.ai_enabled = true;
    cfg.mode = 'test';
    cfg.test_send = true;
    cfg.preview_only = false;
    cfg.push_enabled = true;
  });

console.log('\n-- the batch');
expect('rows read from the sheet', A.batch[0]._rows_in_sheet, ORGS.length);
expect('organisations picked up', A.batch.length, 10);
expect('the same hospital scraped twice', A.batch[0]._skipped.duplicate, 1);
expect('enriched four days ago, left alone', A.batch[0]._skipped.not_ready, 2);
expect('rows with no name', A.batch[0]._skipped.no_name, 1);

console.log('\n-- classification');
const byName = (list, name) => list.find((o) => o.org_name === name);
expect('hospital, by keyword', byName(A.orgs, 'Northgate East Hospital').category,
       'Hospital / discharge planning');
expect('county office, by keyword',
       byName(A.orgs, 'Lakeshore County Job and Family Services').category,
       'County social services');
expect('treatment centre, by keyword', byName(A.orgs, 'Harborview Recovery Addiction Recovery').category,
       'Addiction treatment');
expect('category already in the sheet wins',
       byName(A.orgs, 'Stale Falls Counseling')._category_matched_on, '');
expect('unplaceable name sent to the AI', byName(A.orgs, 'Southeast Healthcare')._needs_ai, true);

const aiOut = A.store['apply the AI classification'];
const aiFor = (name) => aiOut.find((o) => o.org_name === name);
expect('AI placed it (thinking block skipped)', aiFor('Southeast Healthcare').category,
       'Behavioral health provider');
expect('AI answer in a code fence still parsed', aiFor('Bridgeway House').category,
       'Community non-profit');
expect('AI category that is not on the list refused',
       aiFor('Do Not Contact Test Org').category, 'Unclassified');

console.log('\n-- people');
const apolloOut = A.store["read Apollo's people"];
expect('contacts found across 10 organisations', apolloOut.filter((c) => !c._no_contact).length, 14);
expect('organisations with nobody usable', apolloOut.filter((c) => c._no_contact).length, 1);
expect('locked Apollo emails dropped',
       apolloOut.filter((c) => c.org_name === 'Northgate East Hospital')[0]._apollo_hidden, 1);
expect('capped per organisation',
       apolloOut.filter((c) => c.org_name === 'Northgate East Hospital' && !c._no_contact).length, 3);
expect('no people, no pretending', apolloOut.filter((c) => c.org_name === 'Stale Falls Counseling')[0]._no_contact, true);

console.log('\n-- scoring');
const scored = A.store['score against the ICP'];
const person = (email) => scored.find((c) => c.email === email);
expect('discharge planner scores high', person('marcus.reilly@northgate-health.example').score >= 60, 'true');
expect('discharge planner is tier A', person('marcus.reilly@northgate-health.example').tier, 'A');
expect('billing manager excluded outright', person('angela.prine@northgate-health.example').tier, 'X');
expect('billing manager is not verified at cost',
       person('angela.prine@northgate-health.example')._verifiable, false);

console.log('\n-- verification, the KPI');
const decided = A.decided;
const contact = (email) => decided.find((c) => c.email === email);
expect('deliverable address is on the list', contact('denise.whitfield@northgate-health.example').sending_list, 'Yes');
expect('invalid address rejected', contact('rbaptiste@community-action.example')._verdict, 'rejected');
expect('invalid address held', contact('rbaptiste@community-action.example')._hold_reason.startsWith('verifier says'), 'true');
expect('catch-all held', contact('powens@harborview-recovery.example')._hold_reason.startsWith('risky'), 'true');
expect('unknown held', contact('yfreeman@southside-services.example')._hold_reason.startsWith('risky'), 'true');
expect('no verifier answer at all is held too',
       contact('awhitcomb@adm-board.example')._hold_reason.startsWith('risky'), 'true');
expect('shared mailbox held', contact('info@jfs.lakeshore-county.example')._hold_reason,
       'shared mailbox, not a person');
expect('out of state held', contact('nboyd@riverbend-recovery.example')._hold_reason, 'outside OH');
expect('suppression list held', contact('zak@mentorship-alliance.example')._hold_reason,
       'on the suppression list');
expect('nothing unverified reaches the list',
       decided.filter((c) => c._safe && !c._verified).length, 0);

console.log('\n-- write-back');
expect('one row per organisation', A.orgRows.length, 10);
expect('an org with nobody says so',
       A.orgRows.find((r) => r.Organisation === 'Stale Falls Counseling').Status, 'No contact found');
expect('an org with people says so',
       A.orgRows.find((r) => r.Organisation === 'Harborview Recovery Addiction Recovery').Status, 'Enriched');
const contactRows = A.store['rows for the contacts tab'];
expect('held contacts are written too', contactRows.length,
       decided.filter((c) => !c._no_contact && String(c.email || '').includes('@')).length);
expect('contact row column count', Object.keys(contactRows[0]).filter((k) => k[0] !== '_').length, 18);
expect('no blank Campaign written over a real one',
       Object.keys(contactRows[0]).includes('Campaign'), false);

console.log('\n-- the push');
const pushed = A.store['record what was pushed'];
expect('leads offered to the campaign', A.store['payload for the campaign'].length,
       decided.filter((c) => c._push).length);
expect('campaign rejection is not recorded as pushed', pushed[0]['Sending list'], 'No');
expect('rejection reason kept', pushed[0]['Hold reason'].startsWith('campaign rejected it'), 'true');
expect('accepted leads stamped', pushed[1]['Pushed at'] !== '', 'true');

console.log('\n-- the summary');
expect('verified rate reported', A.summary.verified_rate > 0, 'true');
expect('undeliverable caught', A.summary.undeliverable_caught, 1);
expect('sending list size', A.summary.sending_list, decided.filter((c) => c._safe).length);
console.log('\n' + A.summary.summary_text.split('\n').map((l) => '    ' + l).join('\n'));

// =============================================================== B: the shipped state
const B = runPipeline('B — nothing configured, DEMO_VERIFIER on (how the walkthrough is filmed)',
  (cfg) => {
    cfg.demo_verdicts = true;
    cfg.forced_preview = true;
    cfg.mode = 'preview';
    cfg.preview_only = true;
    cfg.push_enabled = false;
  });

console.log('\n-- it still runs end to end');
expect('runs on the sheet contacts alone', B.store['STOP: Apollo not configured'].length, 10);
expect('contacts found without Apollo',
       B.decided.filter((c) => !c._no_contact).length, 7);
expect('demo verdicts applied', B.decided.filter((c) => c._demo_verdict).length > 0, 'true');
expect('demo verdicts are labelled in the sheet',
       B.decided.find((c) => c._demo_verdict).email_status.includes('(demo)'), 'true');
expect('nothing is pushed in preview', B.store['payload for the campaign'] === undefined, 'true');
expect('the review screen is populated', B.store['STOP: not pushed'].length > 0, 'true');
expect('and it says why', B.store['STOP: not pushed'][0]._why.includes('DEMO_VERIFIER'), 'true');

console.log('\n' + B.summary.summary_text.split('\n').map((l) => '    ' + l).join('\n'));

// =============================================================== C: an empty morning
const C = runPipeline('C — a morning with nothing new in the sheet', (cfg) => { cfg.dummy = 1; },
  ORGS.map((r) => Object.assign({}, r, { Status: 'Enriched' })));
expect('the run ends, and says why', C.batch[0]._has_work, false);

// =============================================================== D: a header-only tab
// The read node has alwaysOutputData on, so this arrives as one empty item. Without that,
// n8n skips every node downstream and the run ends green at the Sheets node, with no reason.
const D = runPipeline('D — the Organisations tab has nothing but a header row',
  (cfg) => { cfg.dummy = 1; }, [{}]);
expect('the empty tab is recognised', D.batch[0]._sheet_empty, true);
expect('and it names the tab to check', D.rt.store['STOP: nothing to enrich'][0]._outcome,
       'the sheet is empty');

// =============================================================== E: the seed file itself
// The demo seed in sheet/ is what somebody pastes into the Organisations tab before they
// record the walkthrough. If it does not produce a sending list, the walkthrough has nothing
// to show, so it is checked here rather than discovered on camera.
// Char codes rather than escapes, so the newline and carriage-return cases stay readable.
const LF = 10, CR = 13, BOM = 0xFEFF;

const parseCsv = (text) => {
  const rows = [];
  let row = [], field = '', quoted = false;
  const t = text.charCodeAt(0) === BOM ? text.slice(1) : text;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    const code = t.charCodeAt(i);
    if (quoted) {
      if (ch === '"' && t[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (code === LF) { row.push(field); rows.push(row); row = []; field = ''; }
    else if (code !== CR) field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const head = rows.shift();
  return rows.filter((r) => r.length === head.length)
             .map((r) => Object.fromEntries(head.map((h, n) => [h, r[n]])));
};

const seed = parseCsv(fs.readFileSync(path.join(ROOT, '..', 'sheet',
  'seed-organisations-demo.csv'), 'utf8'));

const E = runPipeline('E — the demo seed file, in the state the workflow ships in',
  (cfg) => {
    cfg.demo_verdicts = true;
    cfg.forced_preview = true;
    cfg.mode = 'preview';
    cfg.preview_only = true;
    cfg.push_enabled = false;
  }, seed);

expect('seed rows parsed', seed.length, 14);
expect('organisations picked up', E.batch.length, 10);
expect('the walkthrough has a sending list', E.summary.sending_list > 0, 'true');
expect('and something held, with reasons', E.summary.held > 0, 'true');
expect('no fabricated address at a real domain',
       E.decided.filter((c) => c._safe && !String(c.email).endsWith('.example')).length, 0);

console.log('\n  the sending list this seed produces:');
for (const c of E.decided.filter((x) => x._safe)) {
  console.log('    ' + String(c.score).padStart(3) + '  ' + c.tier + '  '
    + String(c.full_name || '(no name)').padEnd(18) + String(c.title || '').padEnd(30) + c.email);
}
console.log('\n  held back:');
for (const c of E.decided.filter((x) => !x._safe)) {
  console.log('    ' + String(c.org_name || '').padEnd(54) + (c._hold_reason || ''));
}


console.log('\n' + (failures ? failures + ' CHECK(S) FAILED' : 'all checks passed'));
process.exit(failures ? 1 : 0);
