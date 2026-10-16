// Runs both workflows' Code nodes against the sample payloads, the demo leads, the demo
// pipeline and a GoHighLevel-shaped response, so the logic can be checked before anything is
// imported into n8n.
//   node simulate.js
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const FILES = ['01-intake-and-routing.json', '02-follow-up-sequence.json'];
const WF = {};
for (const f of FILES) {
  const wf = JSON.parse(fs.readFileSync(path.join(ROOT, '..', f), 'utf8'));
  for (const n of wf.nodes) if (n.type === 'n8n-nodes-base.code') WF[n.name] = n;
}
const sample = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, '..', 'sample', f), 'utf8'));

const store = {};
const applyExecuteOnce = (name, items) =>
  WF[name].executeOnce === true ? items.slice(0, 1) : items;

function run(nodeName, inputItems) {
  const node = WF[nodeName];
  if (!node) throw new Error('no Code node named ' + nodeName);
  const items = applyExecuteOnce(nodeName, inputItems);
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
}

let failures = 0;
const expect = (label, got, want) => {
  const ok = String(got) === String(want);
  console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  ' + label.padEnd(46) + got);
  if (!ok) { failures++; console.log('        expected: ' + want); }
};

const cfg = run('config', [{}])[0];
console.log('config: mode ' + cfg.mode + ', ghl_enabled ' + cfg.ghl_enabled +
  ', ' + cfg.routing_rules.length + ' routing rules, ' + cfg.sequence.length + ' touches\n');

// ================================================================= 1 — intake and routing
function intake(payload) {
  const c = run('config', [payload]);
  const lead = run('read the lead', c)[0];
  if (!lead._ok) {
    return { lead, rejected: run('STOP: not a usable lead', [lead])[0] };
  }
  const routed = run('route the lead', [lead])[0];
  const payloadItem = run('build the GoHighLevel payload', [routed])[0];
  const shown = run('STOP: GoHighLevel not configured - payload shown', [payloadItem])[0];
  return { lead, routed, payloadItem, shown };
}

console.log('--- 01: a website form ---');
const site = intake(sample('website-form.json'));
expect('source detected', site.lead.source, 'website');
expect('name read', site.lead.name, 'Rachel Okonkwo');
expect('email lowercased', site.lead.email, 'r.okonkwo@brightpath-dental.example');
expect('wants read as a rule', site.lead.wants, 'quote');
expect('routed by the quote rule', site.routed.owner, 'Ben');
expect('filed at the stage', site.routed.stage, 'Quote requested');
expect('tags carry the rule', site.routed.tags.join(','), 'automation-intake,quote');
expect('payload is the upsert endpoint',
  site.payloadItem._ghl.contact.url, 'https://services.leadconnectorhq.com/contacts/upsert');
expect('payload carries the email', site.payloadItem._ghl.contact.body.email, site.lead.email);
expect('preview stop shows the body', !!site.shown.would_post, 'true');

console.log('\n--- 01: a forwarded email ---');
const mail = intake(sample('forwarded-email.json'));
expect('source detected', mail.lead.source, 'email');
expect('name off the from line', mail.lead.name, 'Tom Beasley');
expect('wants read as support', mail.lead.wants, 'support');
expect('routed by the support rule', mail.routed.owner, 'Cara');
expect('filed at the stage', mail.routed.stage, 'Support');

console.log('\n--- 01: a phone note ---');
const call = intake(sample('phone-note.json'));
expect('source detected', call.lead.source, 'phone');
expect('number read', call.lead.phone, '07700 900456');
expect('routed by the source rule', call.routed.owner, 'Ben');
expect('contact_key falls back to the number', call.lead.contact_key, '07700900456');

console.log('\n--- 01: the gates ---');
const spam = intake(sample('spam.json'));
expect('a bot is rejected', spam.lead._ok, 'false');
expect('with both reasons', spam.rejected._reason.includes('honeypot'), 'true');
const unreachable = intake({ 'your-name': 'Someone', 'your-message': 'Ring the office please.' });
expect('no way to reach them is rejected', unreachable.lead._ok, 'false');
expect('for the right reason',
  unreachable.rejected._reason.includes('no email address and no phone number'), 'true');

console.log('\n--- 01: the demo trigger ---');
const demoItems = run('load a demo lead', [{}]);
const demoLeads = run('read the lead', run('config', demoItems));
expect('three demo leads', demoLeads.length, 3);
expect('one per source', demoLeads.map((l) => l.source).join(','), 'website,email,phone');
const demoRouted = run('route the lead', demoLeads);
expect('routed to three owners/stages',
  demoRouted.map((r) => r.owner + '/' + r.stage).join(' | '),
  'Ben/Quote requested | Cara/Support | Ben/New lead');

// ================================================================= 2 — follow-up sequence
console.log('\n--- 02: the demo pipeline, one run ---');
const pipeRows = run('use the demo pipeline', [{}]);
expect('demo pipeline rows', pipeRows.length, 6);
expect('two leads are untouched', pipeRows.filter((r) => r.touches_sent === 0).length, 2);

const mapped = run('read the pipeline', pipeRows)[0];
expect('mapped into the row shape', mapped.rows.length, 6);
expect('named as the demo source', mapped._from, 'the demo pipeline');
expect('no paging to report', mapped.more_pages, 'false');

const plan = run('plan the sequence', [mapped])[0];
expect('rows read', plan.rows_read, 6);
expect('two due', plan.due_count, 2);
expect('one waiting', plan.waiting.length, 1);
expect('three stopped', plan.stopped.length, 3);
expect('the right two, at the right touch',
  plan.due.map((d) => d.name + ':' + d.touch).join(' | '), 'Rachel Okonkwo:1 | Tom Beasley:2');
expect('a reply stops the sequence',
  plan.stopped.filter((s) => /replied/.test(s.reason)).length, 1);
expect('a stage move stops the sequence',
  plan.stopped.filter((s) => /left the sequence/.test(s.reason)).length, 1);
expect('the cap stops the sequence',
  plan.stopped.filter((s) => /finished \(3 touches\)/.test(s.reason)).length, 1);
expect('waiting says how long is left',
  /not due yet — touch 1 in \d+ h/.test(plan.waiting[0].reason), 'true');
expect('the board still counts every stage',
  Object.keys(plan.board).sort().join(','), 'New lead,Quote requested,Support,Won');

console.log('\n--- 02: the touches ---');
const touches = run('compose the next touch', plan.due);
expect('one touch per due lead', touches.length, 2);
expect('touch 1 is an email', touches[0].channel, 'email');
expect('written to the person', touches[0].body.startsWith('Hi Rachel,'), 'true');
expect('carrying the sequence subject', touches[0].subject, 'Quick check-in on your enquiry');
expect('the request is built', touches[0]._ghl.url,
  'https://services.leadconnectorhq.com/conversations/messages');
expect('as an Email to the contact',
  touches[0]._ghl.body.type + ':' + touches[0]._ghl.body.contactId, 'Email:demo-1001');
expect('one touch per run, not the whole ladder', touches[1].touch, 2);

const sms = run('compose the next touch', [Object.assign({}, touches[0],
  { touch: 3, channel: 'sms', name: 'Dana Whitfield' })])[0];
expect('touch 3 is an SMS', sms.channel + ':' + sms._ghl.body.type, 'sms:SMS');
expect('and carries no subject', sms.subject, '');

const notSent = run('STOP: preview - touches not sent', touches);
expect('preview lists both touches', notSent.length, 2);
expect('and prints the words', notSent[0].body.includes('reached us'), 'true');
expect('naming who and how', notSent[0].to + ' via ' + notSent[0].channel,
  'rachel@brightpath-dental.example via email');

const quiet = run('STOP: nothing due today', [Object.assign({}, plan, { due: [], due_count: 0 })])[0];
expect('a quiet day still reports', quiet.waiting.length, 1);
expect('and what it stopped', quiet.stopped.length, 3);

// ---------------------------------------------------------------- the live read
console.log('\n--- 02: reading GoHighLevel instead ---');
store['config'] = [Object.assign({}, cfg, {
  stages: [{ stage: 'New lead', id: 'stage-new' }],
  seq_touches_field_id: 'cf-touches',
  seq_last_touch_field_id: 'cf-when',
  seq_last_reply_field_id: 'cf-reply'
})];
const ghlRead = run('read the pipeline', [{
  opportunities: [
    { id: 'opp1', contactId: 'c1', pipelineStageId: 'stage-new', assignedTo: 'user-9',
      contact: { id: 'c1', name: 'Ada Lovelace', email: 'ada@example.com', phone: '' },
      customFields: [{ id: 'cf-touches', value: '1' },
                     { id: 'cf-when', value: '2020-01-01 00:00' }] },
    { id: 'opp2', contactId: 'c2', pipelineStageId: 'stage-gone', assignedTo: 'user-9',
      contact: { id: 'c2', name: 'Grace Hopper', email: 'grace@example.com' },
      customFields: [] }
  ],
  meta: { total: 250, nextPageUrl: 'https://services.leadconnectorhq.com/opportunities/search?page=2' }
}])[0];
expect('read as GoHighLevel', ghlRead._from, 'GoHighLevel');
expect('one row per opportunity', ghlRead.rows.length, 2);
expect('stage id turned back into a name', ghlRead.rows[0].stage, 'New lead');
expect('the counter comes from the custom field', ghlRead.rows[0].touches_sent, 1);
expect('the date comes from the custom field', ghlRead.rows[0].last_touch, '2020-01-01 00:00');
expect('the contact comes through', ghlRead.rows[0].email, 'ada@example.com');
expect('an unmapped stage reads as unknown', ghlRead.rows[1].stage, 'unknown');
expect('more pages is reported, not dropped', ghlRead.more_pages, 'true');
expect('and the total with it', ghlRead.total_available, 250);

const ghlPlan = run('plan the sequence', [ghlRead])[0];
expect('the long-quiet lead is due touch 2', ghlPlan.due.map((d) => d.name + ':' + d.touch).join(','),
  'Ada Lovelace:2');
expect('the unmapped stage is stopped, not chased',
  ghlPlan.stopped.filter((s) => /left the sequence/.test(s.reason)).length, 1);
expect('the plan carries the paging flag up', ghlPlan.more_pages, 'true');
expect('and names its source', ghlPlan.source, 'GoHighLevel');
store['config'] = [cfg];

console.log('\n--- the write layer sends nothing itself ---');
expect('flow 1 payload node', Object.keys(WF['build the GoHighLevel payload'].parameters).join(','),
  'jsCode');
expect('flow 2 touch node', Object.keys(WF['compose the next touch'].parameters).join(','), 'jsCode');
expect('flow 2 read node', Object.keys(WF['read the pipeline'].parameters).join(','), 'jsCode');

console.log('\n' + (failures ? failures + ' CHECK(S) FAILED' : 'all checks passed'));
process.exitCode = failures ? 1 : 0;
