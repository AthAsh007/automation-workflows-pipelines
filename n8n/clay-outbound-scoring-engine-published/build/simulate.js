// Runs both workflows' Code nodes against the demo prospects, demo replies and demo pipeline,
// down the path an import with nothing configured takes, plus the enrichment, verification,
// Zoho, Smartlead and AI paths with stand-in API responses. Checks the logic before anything
// is imported into n8n.
//   bun simulate.js            (add --show to print the summary, the call list and the alert)
const fs = require('fs');
const path = require('path');
const SHOW = process.argv.includes('--show');

function load(file) {
  const wf = JSON.parse(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'));
  const nodes = {};
  for (const n of wf.nodes) if (n.type === 'n8n-nodes-base.code') nodes[n.name] = n;
  return nodes;
}
let failures = 0;
const expect = (label, got, want) => {
  const ok = String(got) === String(want);
  console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  ' + label.padEnd(52) + String(got).slice(0, 66));
  if (!ok) { failures++; console.log('        expected: ' + want); }
};

// A stand-in for n8n's Code node runtime: $input, and $('node') over whatever each node
// produced earlier in this simulated run. `put` records the output of a non-Code node (an IF
// branch, an HTTP call) so later Code nodes can read it.
function harness(WF, overrides) {
  const store = {};
  const api = {
    store,
    put(name, items) { store[name] = items; return items; },
    run(name, items) {
      const node = WF[name];
      if (!node) throw new Error('no Code node named ' + name);
      if (node.executeOnce) items = items.slice(0, 1);
      const wrap = (a) => a.map((j) => ({ json: j }));
      const $input = { all: () => wrap(items), first: () => ({ json: items[0] }) };
      const $ = (n) => {
        const a = store[n];
        if (!a) throw new Error('simulate: "' + n + '" has no recorded output');
        return { all: () => wrap(a), first: () => ({ json: a[0] }), itemMatching: (i) => ({ json: a[i] }) };
      };
      let src = node.parameters.jsCode;
      if (name === 'config' && overrides) {
        for (const [k, v] of Object.entries(overrides)) {
          const re = new RegExp('^const ' + k + '\\s*=.*$', 'm');
          if (!re.test(src)) throw new Error('override ' + k + ' not found in config');
          src = src.replace(re, 'const ' + k + ' = ' + v + ';');
        }
      }
      const out = new Function('$input', '$', '"use strict";' + src)($input, $);
      store[name] = out.map((o) => o.json);
      return store[name];
    }
  };
  return api;
}
const byId = (list, id) => list.find((p) => p.clay_row_id === id) || {};

// ============================================================ 01: nothing configured
function run01(overrides) {
  const W = load('01-score-enrich-and-route.json');
  const h = harness(W, overrides);
  const cfg = h.run('config', h.run('load the demo prospects', [{}]))[0];
  h.run('read the prospects', h.store.config);
  h.run('score and tier', h.store['read the prospects']);
  const planned = h.run('plan the enrichment', h.store['score and tier']);
  const funded = h.put('worth a credit?', planned.filter((p) => p._needs_enrich));
  const enriched = h.run('use the demo enrichment', funded);
  const skipped = h.run('not worth a credit', planned.filter((p) => !p._needs_enrich));
  const needs = h.run('who needs verifying', enriched.concat(skipped));
  const verdicts = h.run('verification without a key', needs);
  const run = h.run('decide what goes where', verdicts)[0];
  const zoho = h.run('build the Zoho upsert', [run])[0];
  return { h, cfg, planned, funded, needs, verdicts, run, zoho };
}

console.log('--- 01 score, enrich and route: nothing configured ---');
const A = run01();
expect('mode', A.cfg.mode, 'preview');
expect('nothing enabled', [A.cfg.enrich_enabled, A.cfg.verifier_enabled, A.cfg.zoho_enabled, A.cfg.smartlead_enabled, A.cfg.notify_enabled].join(), 'false,false,false,false,false');
const P = A.h.store['score and tier'];
expect('twelve rows read', P.length, 12);
expect('Clay column names mapped', byId(P, 'r-101').email + ' / ' + byId(P, 'r-101').employees, 'dana.reyes@ledgerly.example / 320');
expect('comma list read as technologies', byId(P, 'r-102').technologies.join('|'), 'salesforce|outreach');
expect('seniority read off the title', ['r-101', 'r-102', 'r-103', 'r-104'].map((i) => byId(P, i).seniority).join(), 'vp,c-level,director,manager');
expect('Dana: A at 95', byId(P, 'r-101').tier + ' ' + byId(P, 'r-101').score, 'A 95');
expect('Marcus: clamped to 100', byId(P, 'r-102').score, 100);
expect('Tom: B at 60', byId(P, 'r-104').tier + ' ' + byId(P, 'r-104').score, 'B 60');
expect('Sam: C at 35', byId(P, 'r-109').tier + ' ' + byId(P, 'r-109').score, 'C 35');
expect('intern is Reject whatever the score', byId(P, 'r-106').tier + ' / ' + byId(P, 'r-106').disqualified_by, 'Reject / Student or intern');
expect('under 10 employees is Reject', byId(P, 'r-111').tier + ' / ' + byId(P, 'r-111').disqualified_by, 'Reject / Under 10 employees');
expect('duplicate caught on email, any case', byId(P, 'r-107')._duplicate_of, 'r-101');
expect('row with no name is not usable', byId(P, 'r-108')._hold, 'not enough to score: no name');
expect('persona: economic buyer', byId(P, 'r-105').persona, 'Economic buyer');
expect('persona: operator', byId(P, 'r-103').persona, 'Operator');
expect('persona: champion', byId(P, 'r-104').persona, 'Champion');
expect('action by tier', byId(P, 'r-104').recommended_action, 'Sequence B, call on any reply');
expect('score breakdown kept', byId(P, 'r-104').score_breakdown.join(', '), 'Manager +10, Revenue-owning title +10, Mid size +15, Target industry +20, Core market +5');

console.log('\n--- 01: the credit budget ---');
expect('only A/B missing an email are funded', A.funded.map((p) => p.clay_row_id).join(), 'r-102,r-103,r-110,r-112');
expect('highest scores win the budget; 80 waits', A.funded.map((p) => p.score).sort((a, b) => b - a).join() + ' > ' + byId(A.planned, 'r-105').score, '100,95,90,90 > 80');
expect('C never enriched', byId(A.planned, 'r-109')._enrich_skip, 'tier C: not worth a credit');
expect('Reject never enriched', byId(A.planned, 'r-106')._enrich_skip, 'tier Reject: not worth a credit');
expect('duplicate never enriched', byId(A.planned, 'r-107')._enrich_skip, 'duplicate, never enriched');
expect('has an email, not enriched', byId(A.planned, 'r-101')._enrich_skip, 'already has a work email');
expect('over budget waits for next run', byId(A.planned, 'r-105')._enrich_skip, 'over ENRICH_BUDGET (4 a run): enrich next run');
expect('Apollo body built for funded only', A.funded.every((p) => p._enrich_body) && !A.planned.filter((p) => !p._needs_enrich).some((p) => p._enrich_body), true);
const B2 = run01({ ENRICH_BUDGET: 2 });
expect('budget 2 funds exactly two', B2.funded.length, 2);
expect('budget 2 counts two credits', B2.run.counts.credits_used, 2);

console.log('\n--- 01: verification ---');
const V = A.verdicts;
expect('only A/B with an email are checked', V.filter((p) => p._needs_verify).map((p) => p.clay_row_id).join(), 'r-102,r-103,r-110,r-112,r-101,r-104');
expect('catch-all is not verified', byId(V, 'r-103').email_status + ' ' + byId(V, 'r-103')._verified, 'catch_all false');
expect('C is never sent to the verifier', byId(V, 'r-109')._needs_verify, false);

console.log('\n--- 01: routing ---');
const R = A.run;
expect('Zoho gets A, B and C with a usable email', R.crm.map((p) => p.clay_row_id).join(), 'r-102,r-103,r-112,r-101,r-104,r-109');
expect('campaign A: verified A only', (R.campaign.A || []).map((p) => p.clay_row_id).join(), 'r-102,r-112,r-101');
expect('campaign B', (R.campaign.B || []).map((p) => p.clay_row_id).join(), 'r-104');
const held = (id) => { const h = R.held.find((x) => x.clay_row_id === id); return h ? h._where + ': ' + h._why : 'not held'; };
expect('catch-all: Zoho only', held('r-103'), 'Zoho only: email catch_all: held from the campaign');
expect('C: Zoho only', held('r-109'), 'Zoho only: tier C is never sequenced');
expect('invalid: back to Clay', held('r-110'), 'left in Clay: email invalid: send it back through the waterfall');
expect('over budget: left in Clay', held('r-105'), 'left in Clay: over ENRICH_BUDGET (4 a run): enrich next run: nothing to match on in Zoho yet');
expect('duplicate: nowhere', held('r-107'), 'nowhere: duplicate of r-101 in this run');
expect('counts by tier', ['A', 'B', 'C', 'Reject'].map((t) => t + ' ' + R.counts.by_tier[t]).join(', '), 'A 6, B 1, C 1, Reject 2');
expect('credits used / budget / saved', [R.counts.credits_used, R.counts.credits_budget, R.counts.credits_saved].join(' / '), '4 / 4 / 7');

console.log('\n--- 01: Zoho and Smartlead payloads, preview ---');
const Z = A.zoho;
expect('one upsert, six records', Z._count, 6);
expect('upsert endpoint', Z._zoho.url, 'https://www.zohoapis.com/crm/v8/Leads/upsert');
expect('duplicate check on Email', Z._zoho.body.duplicate_check_fields.join(), 'Email');
expect('status by tier', Z._zoho.body.data.map((r) => r.Lead_Status).join('|'), 'Qualified - A|Qualified - A|Qualified - A|Qualified - A|Qualified - B|Nurture');
expect('blank custom fields not written', 'Fit_Score' in Z._zoho.body.data[0], false);
expect('no empty Owner lookup', Z._zoho.body.data.some((r) => r.Owner), false);
expect('catch-all noted on the lead', /catch_all: not sequenced/.test(Z._zoho.body.data[1].Description), true);
const zp = A.h.run('STOP: preview - Zoho payload shown', [Z])[0];
expect('Zoho preview reason', zp._reason, 'TEST_RUN is true, mode preview');
const pushes = A.h.run('build the Smartlead pushes', [zp]);
expect('preview still builds both tier pushes', pushes.map((p) => p.tier + ':' + p.count + ':' + p.campaign_id).join(), 'A:3:<SMARTLEAD_CAMPAIGNS.A>,B:1:<SMARTLEAD_CAMPAIGNS.B>');
expect('custom fields travel with the lead', JSON.stringify(pushes[0]._body.lead_list[0].custom_fields), '{"tier":"A","persona":"Economic buyer","fit_score":"100","recommended_action":"Call today, then sequence A","clay_row_id":"r-102"}');
expect('block and unsubscribe lists respected', Object.values(pushes[0]._body.settings).join(), 'false,false,false');
const sp = A.h.run('STOP: preview - Smartlead payload shown', pushes)[0];
expect('Smartlead preview reason', sp._reason, 'TEST_RUN is true and TEST_CAMPAIGN_ID is blank');
A.h.put('after the campaign step', [sp]);
const S = A.h.run('build the run summary', [sp])[0];
expect('summary counts tiers', /Tiers: A 6 · B 1 · C 1 · Reject 2/.test(S.summary), true);
expect('summary counts credits', /4 of 4 credits used, 7 saved/.test(S.summary), true);
expect('summary lists every hold', S.held.length, 8);
if (SHOW) console.log('\n' + S.summary + '\n');

console.log('\n--- 01: test mode redirects and caps ---');
const T = run01({ TEST_CAMPAIGN_ID: "'camp-test'", SMARTLEAD_API_KEY: "'sl-key'" });
expect('mode test', T.cfg.mode, 'test');
expect('Zoho still not written in test', T.cfg.zoho_enabled, false);
const tp = T.h.run('build the Smartlead pushes', [{}]);
expect('every push to the test campaign, capped at 3', tp.map((p) => p.campaign_id + ':' + p.count).join(), 'camp-test:3');

console.log('\n--- 01: live, with stand-in API answers ---');
const L = run01({ TEST_RUN: 'false', SMARTLEAD_API_KEY: "'sl-key'", SMARTLEAD_CAMPAIGNS: "{ A: '1001', B: '' }",
  ZOHO_CLIENT_ID: "'id'", ZOHO_CLIENT_SECRET: "'s'", ZOHO_REFRESH_TOKEN: "'r'" });
expect('mode live, Zoho and Smartlead on', [L.cfg.mode, L.cfg.zoho_enabled, L.cfg.smartlead_enabled].join(), 'live,true,true');
const bad = L.h.run('read the access token', [{ error: 'invalid_client' }])[0];
expect('Zoho 200-with-error read as a failure', bad._authed + ' / ' + bad._hint.slice(0, 40), 'false / ZOHO_CLIENT_ID and ZOHO_CLIENT_SECRET be');
const good = L.h.run('read the access token', [{ access_token: 'tok', expires_in: 3600 }])[0];
expect('token put on the request', good._authed + ' ' + good._access_token + ' ' + good._count, 'true tok 6');
const ans = L.h.run("read Zoho's answers", [{ data: [
  { code: 'SUCCESS', action: 'insert', details: { id: '9001' } }, { code: 'SUCCESS', action: 'update', details: { id: '9002' } },
  { code: 'INVALID_DATA', message: 'invalid data', details: { api_name: 'Lead_Status' } },
  { code: 'SUCCESS', action: 'insert', details: { id: '9003' } }, { code: 'SUCCESS', action: 'insert', details: { id: '9004' } },
  { code: 'SUCCESS', action: 'insert', details: { id: '9005' } }] }])[0];
expect('per-record results read', ans.inserted + ' new, ' + ans.updated + ' updated, ' + ans.refused.length + ' refused', '4 new, 1 updated, 1 refused');
expect('the refused record named', ans.refused[0].email, 'nora.quinn@vaultline.example');
const lp = L.h.run('build the Smartlead pushes', [ans]);
expect('live: tier without a campaign is skipped, said', lp.map((p) => p.campaign_id).join() + ' | ' + lp[0].skipped.join(), '1001 | tier B: no campaign id in SMARTLEAD_CAMPAIGNS');
L.h.put('pushing to Smartlead?', lp);
const sr = L.h.run("read Smartlead's answer", [{ ok: true, upload_count: 3, already_added_to_campaign: 0 }])[0];
expect('Smartlead answer read', sr._outcome + ' ' + sr.added, 'pushed to Smartlead 3');

// Enrichment and verification with stand-in answers.
const E = run01({ ENRICH_API_KEY: "'k'", VERIFIER_API_KEY: "'v'" });
const fundedE = E.funded;
const re = E.h.run('read the enrichment', [
  { person: { email: 'marcus.obi@freightline.example', phone_numbers: [{ sanitized_number: '+12025550102' }] } },
  { person: { email: 'email_not_unlocked@domain.com' } },
  { error: { message: 'insufficient credits' } },
  { person: {} }]);
expect('email found', re[0].email + ' ' + re[0]._enrich_result, 'marcus.obi@freightline.example email found');
expect('locked email is not a guess', re[1].email + '|' + re[1]._enrich_result, '|no verified email found');
expect('failed call says so', re[2]._enrich_result, 'call failed: insufficient credits');
expect('credits count every funded call', fundedE.length, 4);
E.h.put('verify with a key?', [{ email: 'a@x.example' }, { email: 'b@x.example' }, { email: 'c@x.example' }]);
const va = E.h.run('apply the verification', [{ result: 'ok' }, {}, { result: 'catch_all' }]);
expect('verifier: ok / no answer / catch-all', va.map((p) => p.email_status + ':' + p._verified).join(), 'ok:true,unknown:false,catch_all:false');
const nv = E.h.run('verification without a key', [{ _needs_verify: true, email: 'real@x.example' }]);
expect('real row without a verifier is held', nv[0].email_status + ' ' + nv[0]._verified, 'unverified false');

// ============================================================ 02: replies
console.log('\n--- 02: demo replies, keyword rules ---');
const W2 = load('02-classify-replies-and-call-list.json');
const h2 = harness(W2);
const c2 = h2.run('config', h2.run('load the demo replies', [{}]));
const replies = h2.run('read the reply', c2);
expect('six replies read', replies.length, 6);
expect('quoted history cut off', replies[0].text, 'Thanks, the timing is actually good. Can you send a couple of slots for Thursday?');
expect('lead id and email read', replies[3].lead_id + ' ' + replies[3].lead_email, 'demo-4 nora.quinn@vaultline.example');
const cls = h2.run('classify by keywords', replies);
expect('six classes', cls.map((r) => r.class).join(), 'interested,not_now,referral,unsubscribe,out_of_office,needs_human');
expect('referral email found in the text', cls[2].referral_email, 'jamie.cole@stackmart.example');
const fu = h2.run('decide the follow-up', cls);
expect('out-of-office changes nothing', fu[4]._write_zoho + ' ' + fu[4]._task, 'false null');
expect('not-now task due in 60 days', fu[1]._task.due_date, new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10));
expect('unsubscribe: opt-out, no task', fu[3]._opt_out + ' ' + fu[3]._task, 'true null');
const zu = h2.run('build the Zoho updates', fu)[0];
expect('five lead updates, OOO left out', zu._count, 5);
expect('statuses written', zu._zoho.body.data.map((r) => r.Lead_Status).join('|'), 'Replied - Interested|Replied - Not now|Replied - Referral|Unsubscribed|Replied - Needs review');
expect('opt-out written for the unsubscribe', zu._zoho.body.data[3].Email_Opt_Out, true);
const zup = h2.run('STOP: preview - Zoho updates shown', [zu])[0];
expect('preview shows the four tasks', zup.then_tasks.length, 4);
const un = h2.run('unsubscribes for Smartlead', fu);
expect('one unsubscribe, with its lead id', un.map((u) => u.lead_id + ' ' + u._url).join(), 'demo-4 https://server.smartlead.ai/api/v1/leads/demo-4/unsubscribe');
const al = h2.run('compose the team alert', fu)[0];
expect('alert: interested, referral, needs a person', al._count, 3);
if (SHOW) console.log('\n' + al.text + '\n');

console.log('\n--- 02: the AI reading is checked, not trusted ---');
const h3 = harness(W2, { OPENAI_API_KEY: "'k'" });
h3.run('config', [{}]);
const req = h3.run('build the AI request', replies);
expect('strict schema, fixed classes', req[0]._ai_body.response_format.json_schema.schema.properties.class.enum.length, 6);
const ai = (c, conf, ref) => ({ choices: [{ message: { content: JSON.stringify({ class: c, confidence: conf, referral_email: ref || '' }) } }] });
const ap = h3.run('apply the AI reading', [ai('interested', 0.9), ai('not_now', 0.3), ai('referral', 0.9, 'ceo@stackmart.example'),
  ai('interested', 0.95), { error: 'timeout' }, ai('spam', 0.9)]);
expect('confident answer used', ap[0].class + ' ' + ap[0].classified_by, 'interested AI (gpt-4o-mini)');
expect('low confidence goes to a person', ap[1].class, 'needs_human');
expect('invented referral email dropped', '[' + ap[2].referral_email + ']', '[]');
expect('unsubscribe beats the model', ap[3].class + ' / ' + ap[3].classified_by, 'unsubscribe / keyword rules (unsubscribe always wins)');
expect('failed call keeps the keyword read', ap[4].class + ' / ' + ap[4].classified_by, 'out_of_office / keyword rules (AI answer did not parse)');
expect('class outside the list ignored', ap[5].classified_by, 'keyword rules (AI answer did not parse)');

console.log('\n--- 02: tasks hang off the returned ids ---');
const h4 = harness(W2, { TEST_RUN: 'false', ZOHO_CLIENT_ID: "'id'", ZOHO_CLIENT_SECRET: "'s'", ZOHO_REFRESH_TOKEN: "'r'" });
h4.run('config', [{}]);
h4.run('build the Zoho updates', fu);
h4.run('read the access token', [{ access_token: 'tok' }]);
const tasks = h4.run('build the tasks', [{ data: [
  { code: 'SUCCESS', details: { id: 'L1' } }, { code: 'SUCCESS', details: { id: 'L2' } }, { code: 'SUCCESS', details: { id: 'L3' } },
  { code: 'SUCCESS', details: { id: 'L4' } }, { code: 'DUPLICATE_DATA', message: 'duplicate' }] }])[0];
expect('tasks for interested, not now, referral', tasks._tasks.body.data.map((t) => t.What_Id.id).join(), 'L1,L2,L3');
expect('refused record named, gets no task', tasks.refused[0].email, 'priya@clinicflow.example');
expect('tasks attach to Leads', tasks._tasks.body.data[0].$se_module, 'Leads');

console.log('\n--- 02: the call list ---');
const h5 = harness(W2);
h5.run('config', [{}]);
const pipe = h5.run('use the demo pipeline', [{}]);
const cl = h5.run('rank the call list', pipe)[0];
expect('order: interested newest, referral, A by score', cl.list.map((r) => r.name.split(' ')[0]).join(), 'Owen,Dana,Jamie,Victor,Elena');
expect('no phone stays on, marked', /Victor Hale.*no phone, email victor.hale@shipwise.example/.test(cl.text), true);
const h6 = harness(W2, { CALL_LIST_SIZE: 2 });
h6.run('config', [{}]);
expect('capped at CALL_LIST_SIZE', h6.run('rank the call list', h6.run('use the demo pipeline', [{}]))[0].count, 2);
const h7 = harness(W2, { ZOHO_CLIENT_ID: "'id'", ZOHO_CLIENT_SECRET: "'s'", ZOHO_REFRESH_TOKEN: "'r'" });
h7.run('config', [{}]);
const q = h7.run('build the call list query', [{ access_token: 'tok' }])[0];
expect('COQL query by status', q._coql.body.select_query.includes("where Lead_Status in ('Replied - Interested', 'Replied - Referral', 'Qualified - A')"), true);
const rl = h7.run('read the leads', [{ data: [{ First_Name: 'A', Last_Name: 'B', Company: 'C', Lead_Status: 'Qualified - A', Phone: '1' }], info: { more_records: true } }])[0];
expect('COQL rows read into the demo shape', rl.rows[0].name + ' ' + rl.more, 'A B true');
if (SHOW) console.log('\n' + cl.text + '\n');

console.log(failures ? '\n' + failures + ' FAILURE(S)' : '\nall simulations passed');
process.exit(failures ? 1 : 0);
