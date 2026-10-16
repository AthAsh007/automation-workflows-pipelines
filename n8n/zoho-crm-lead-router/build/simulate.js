// Runs both workflows' Code nodes against the sample payloads, the demo leads, the demo
// pipeline and Zoho-shaped responses, so the logic can be checked before anything is imported
// into n8n. No n8n, no Zoho account, no network.
//   node simulate.js
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const FILES = ['01-lead-routing.json', '02-stage-sweep.json'];

// One runner per workflow, NOT one shared map of node names. Both workflows have a node
// called "read the access token" and they are deliberately different — 01 re-attaches the
// token to every lead, 02 only ever needs one item. A flat map would silently test one of
// them twice and report a pass.
function loadWorkflow(file) {
  const wf = JSON.parse(fs.readFileSync(path.join(ROOT, '..', file), 'utf8'));
  const nodes = {};
  for (const n of wf.nodes) if (n.type === 'n8n-nodes-base.code') nodes[n.name] = n;
  const store = {};
  return function run(nodeName, inputItems) {
    const node = nodes[nodeName];
    if (!node) throw new Error('no Code node named "' + nodeName + '" in ' + file);
    const items = node.executeOnce === true ? inputItems.slice(0, 1) : inputItems;
    const wrap = (arr) => arr.map((j) => ({ json: j }));
    const $input = { all: () => wrap(items), first: () => ({ json: items[0] }),
                     last: () => ({ json: items[items.length - 1] }) };
    const $ = (name) => {
      const arr = store[name];
      if (!arr) throw new Error('simulate: node "' + name + '" has no recorded output');
      return { all: () => wrap(arr), first: () => ({ json: arr[0] }),
               last: () => ({ json: arr[arr.length - 1] }) };
    };
    const out = new Function('$input', '$', '"use strict";' + node.parameters.jsCode)($input, $);
    store[nodeName] = out.map((o) => o.json);
    return store[nodeName];
  };
}

const run = loadWorkflow(FILES[0]);
const run2 = loadWorkflow(FILES[1]);

const sample = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, '..', 'sample', f), 'utf8'));

let failures = 0;
const expect = (label, got, want) => {
  const ok = String(got) === String(want);
  console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  ' + label.padEnd(52) + got);
  if (!ok) { failures++; console.log('        expected: ' + want); }
};

// =====================================================================  WORKFLOW 1
console.log('\n== 01 lead routing — the config node');
const cfg = run('config', [{}]);
expect('DRY_RUN ships true', cfg[0].dry_run, true);
expect('zoho_enabled is false with no credentials', cfg[0].zoho_enabled, false);
expect('notify_enabled is false with no webhook', cfg[0].notify_enabled, false);
expect('Zoho triggers are suppressed by default', JSON.stringify(cfg[0].zoho_triggers), '[]');
expect('routing rules are loaded', cfg[0].routing_rules.length, 7);
expect('the last rule matches anything',
       JSON.stringify(cfg[0].routing_rules[6].match), '{}');

console.log('\n== 01 — reading three different intake shapes');
const demo = run('load a demo lead', [{}]);
expect('three demo leads', demo.length, 3);

// config sits IN the data path between the trigger and the parser, so the chain is run as it
// is actually wired rather than each node in isolation. A config node that returned a single
// settings object would collapse three leads into one here, and the next assertion is the
// one that catches it.
const viaConfig = run('config', demo);
expect('config passes all three items through', viaConfig.length, 3);
expect('and still carries the settings', viaConfig[0].dry_run, true);
expect('with the payload under lead', viaConfig[0].lead.source, 'website');

const read = run('read the lead', viaConfig);
expect('three leads out, not one', read.length, 3);
expect('website form -> name', read[0].full_name, 'Priya Raman');
expect('website form -> wants', read[0].wants, 'quote');
expect('forwarded email -> email found in the body', read[1].email, 'tom.auber@example.org');
expect('forwarded email -> wants', read[1].wants, 'support');
expect('phone note -> email found in free text', read[2].email, 'dana.whitlock@example.net');
expect('phone note -> wants', read[2].wants, 'demo');
expect('all three are usable', read.filter((r) => r._ok).length, 3);

console.log('\n== 01 — the same chain on the sample payloads');
const samples = run('read the lead', run('config', [
  sample('website-form.json'), sample('forwarded-email.json'),
  sample('phone-note.json'), sample('spam.json'), sample('no-contact-detail.json')
]));
expect('five in, five out', samples.length, 5);
expect('sample form -> company', samples[0].company, 'Bramley Dental Group');
expect('sample email -> phone found', samples[1].phone, '020 7946 0455');
expect('sample phone note -> wants', samples[2].wants, 'demo');
expect('spam is rejected', samples[3]._ok, false);
expect('spam says why', samples[3]._why, 'reads as spam');
expect('a lead with no contact detail is rejected', samples[4]._ok, false);
expect('and says why', samples[4]._why, 'no email and no phone — nobody could reply');

console.log('\n== 01 — a webhook nests the payload one level deeper');
const hooked = run('read the lead', run('config', [
  { headers: {}, params: {}, query: {}, body: sample('website-form.json') }
]));
expect('the posted body is unwrapped', hooked[0].full_name, 'Marta Olsen');
expect('and it is usable', hooked[0]._ok, true);

console.log('\n== 01 — the rule table');
const routed = run('route the lead', read);
expect('quote -> Ben, Quote Requested', routed[0].owner + '/' + routed[0].status,
       'Ben/Quote Requested');
expect('support -> Cara, Support', routed[1].owner + '/' + routed[1].status, 'Cara/Support');
expect('demo -> Ben, Attempted', routed[2].owner + '/' + routed[2].status, 'Ben/Attempted');
expect('the winning rule is recorded', routed[1]._routed_by, '{"wants":"support"}');
expect('base tag is on every lead',
       routed.every((r) => r.tags.indexOf('automation-intake') >= 0), true);

// A lead matching nothing must still land somewhere.
const unmatched = run('route the lead', [{ source: 'carrier-pigeon', wants: '' }]);
expect('an unmatched lead still gets an owner', unmatched[0].owner, 'Ada');
expect('and is tagged unrouted', unmatched[0].tags.indexOf('unrouted') >= 0, true);

console.log('\n== 01 — the Zoho request');
const payload = run('build the Zoho payload', routed);
expect('posts to /crm/v8/Leads',
       payload[0]._zoho.url, 'https://www.zohoapis.com/crm/v8/Leads');
expect('body is a data array', Array.isArray(payload[0]._zoho.body.data), true);
expect("Zoho's own rules are NOT triggered",
       JSON.stringify(payload[0]._zoho.body.trigger), '[]');
expect('Last_Name is set', payload[0]._zoho.body.data[0].Last_Name, 'Raman');
expect('Lead_Status comes from the rule', payload[0]._zoho.body.data[0].Lead_Status,
       'Quote Requested');
expect('a blank Owner id is omitted, not sent empty',
       'Owner' in payload[0]._zoho.body.data[0], false);
expect('Company falls back rather than failing Zoho validation',
       payload[2]._zoho.body.data[0].Company, 'Ferris Group');
expect('custom fields are mapped by API name',
       payload[0]._zoho.body.data[0].Enquiry_Type, 'quote');

console.log('\n== 01 — with no credential, the payload is the output');
const preview = run('STOP: Zoho not configured - payload shown', payload);
expect('outcome is a preview', preview[0]._outcome, 'preview — nothing written');
expect('it says DRY_RUN is why', preview[0]._reason.indexOf('DRY_RUN') >= 0, true);
expect('and carries the real body', preview[0].would_post.data[0].Last_Name, 'Raman');

console.log('\n== 01 — a failed token refresh is caught from the BODY, not the status');
const badToken = run('read the access token', [{ error: 'invalid_client' }]);
expect('not authenticated', badToken[0]._authed, false);
expect('the hint names the cause',
       badToken[0]._hint.indexOf('data centre') >= 0, true);
const goodToken = run('read the access token',
                      [{ access_token: 'x.y.z', expires_in: 3600 }]);
expect('a good refresh re-attaches every lead', goodToken.length, 3);
expect('each lead carries the token', goodToken[0]._access_token, 'x.y.z');

console.log('\n== 01 — Zoho answers 200 but rejects the record');
const partial = run('STOP: filed in Zoho CRM', [{ data: [
  { code: 'MANDATORY_NOT_FOUND', message: 'required field not found', details: {} }] }]);
expect('a 200 with a bad per-record code is NOT reported as filed',
       partial[0]._outcome, 'Zoho accepted the request but rejected the record');
const filed = run('STOP: filed in Zoho CRM', [{ data: [
  { code: 'SUCCESS', message: 'record added', details: { id: '4876876004200000012' } }] }]);
expect('a real success reports the id', filed[0].zoho_id, '4876876004200000012');

console.log('\n== 01 — the notification is composed from the routing, not the write');
const note = run('compose the lead notification', routed);
expect('one message for the batch', note[0]._count, 3);
expect('it names the owner', note[0].text.indexOf('owner: Ben') >= 0, true);
expect('it is not sent with no webhook', note[0]._send, false);

// =====================================================================  WORKFLOW 2
console.log('\n== 02 stage sweep — the demo pipeline');
// The second workflow carries its own copy of the same config node.
const cfg2 = run2('config', [{}]);
expect('both workflows read the same settings', cfg2[0].dry_run, cfg[0].dry_run);
const pipe = run2('use the demo pipeline', [{}]);
expect('six demo deals', pipe.length, 6);
const deals = run2('read the pipeline', pipe);
expect('all six read', deals.length, 6);
expect('next_step is trimmed to a string', typeof deals[0].next_step, 'string');

console.log('\n== 02 — the rule: no open deal without a next action');
const checked = run2('check every deal', deals);
const count = (v) => checked.filter((d) => d.verdict === v).length;
expect('two need a next action created', count('create'), 2);
expect('one is escalated, not stacked', count('escalate'), 1);
expect('two are already compliant', count('ok'), 2);
expect('one closed deal is skipped entirely', count('skip'), 1);
expect('the overdue one is NOT given a second task',
       checked.find((d) => d.verdict === 'escalate').next_step,
       'Waiting on their legal review');
expect('stalled is reported separately from the verdict',
       checked.filter((d) => d.stalled && d.verdict !== 'skip').length, 2);
expect('the IF flag is computed once', checked[0]._has_work, true);

console.log('\n== 02 — a fully compliant pipeline creates nothing');
const compliant = run2('check every deal', deals.map((d) => ({
  ...d, next_step: 'Booked', closing_date: '2099-01-01'
})));
expect('no work when every open deal has a next step',
       compliant.filter((d) => d.verdict === 'create').length, 0);
expect('the flag says so', compliant[0]._has_work, false);
const nothing = run2('STOP: every open deal has a next action', compliant);
expect('and the stop node says which', nothing[0]._reason,
       'every open deal already has a next step recorded');

console.log('\n== 02 — the Zoho Tasks request');
run2('check every deal', deals);
const tasks = run2('compose the next action', checked);
expect('one call for the whole batch', tasks[0]._count, 2);
expect('posts to /crm/v8/Tasks', tasks[0]._zoho.url,
       'https://www.zohoapis.com/crm/v8/Tasks');
expect('every task is related to its deal', tasks[0]._zoho.body.data[0].What_Id,
       '4876876004100000001');
expect('AND carries the module name, or it attaches to nothing',
       tasks[0]._zoho.body.data[0].$se_module, 'Deals');
expect('the task text comes from the stage', tasks[0]._zoho.body.data[0].Subject,
       'Qualify: confirm budget, authority and timeline');
expect('Due_Date is a date, not a datetime',
       /^\d{4}-\d{2}-\d{2}$/.test(tasks[0]._zoho.body.data[0].Due_Date), true);

console.log('\n== 02 — the COQL query is built from config, not hardcoded');
const q = run2('build the deal query', [{ _access_token: 'x.y.z' }]);
expect('selects the fields the sweep needs',
       q[0].query.indexOf('Next_Step') >= 0, true);
expect('filters on the configured open stages',
       q[0].query.indexOf("'Qualification'") >= 0, true);
expect('and is capped at the Zoho page limit',
       q[0].query.indexOf('limit 200') >= 0, true);

console.log('\n== 02 — the digest reports what nobody wants to hear');
const digest = run2('compose the digest', checked);
expect('created counted', digest[0].created, 2);
expect('escalated counted', digest[0].escalated, 1);
expect('stalled counted', digest[0].stalled, 2);
expect('it says the run used demo data',
       digest[0].text.indexOf('demo pipeline') >= 0, true);
expect('it is not posted with no webhook', digest[0]._send, false);

console.log('\n== 02 — a failed read does NOT fall back to demo deals');
const noread = run2('STOP: could not read the pipeline', [{ error: { message: 'INVALID_QUERY' } }]);
expect('the sweep reports it did not run', noread[0]._outcome, 'sweep did not run');
expect('and says no tasks were created',
       noread[0]._reason.indexOf('no tasks were created') >= 0, true);

console.log('\n' + (failures ? failures + ' FAILED' : 'all checks passed'));
process.exit(failures ? 1 : 0);
