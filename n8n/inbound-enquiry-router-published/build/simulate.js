// Runs both workflows' Code nodes against the sample form payloads and tracker rows,
// so the logic can be checked before anything is imported into n8n.
//   node simulate.js
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const WF = {};
for (const f of ['01-capture-and-reply.json', '02-chase-and-digest.json']) {
  const wf = JSON.parse(fs.readFileSync(path.join(ROOT, '..', f), 'utf8'));
  for (const n of wf.nodes) if (n.type === 'n8n-nodes-base.code') WF[n.name] = n;
}
const sample = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, '..', 'sample', f), 'utf8'));

const store = {};
const applyExecuteOnce = (name, items) =>
  WF[name].executeOnce === true ? items.slice(0, 1) : items;

function run(nodeName, inputItems, overrides) {
  const node = WF[nodeName];
  if (!node) throw new Error('no Code node named ' + nodeName);
  const items = applyExecuteOnce(nodeName, inputItems);
  const ctx = Object.assign({}, store, overrides || {});
  const wrap = (arr) => arr.map((j) => ({ json: j }));
  const $input = { all: () => wrap(items), first: () => ({ json: items[0] }),
                   last: () => ({ json: items[items.length - 1] }) };
  const $ = (name) => {
    const arr = ctx[name];
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
  console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  ' + label.padEnd(42) + got);
  if (!ok) { failures++; console.log('        expected: ' + want); }
};

// ---------------------------------------------------------------- config
const cfg = run('config', [{}])[0];
// Simulation-only: the shipped config has these blank on purpose.
cfg.areas = cfg.areas.map((a) => Object.assign({}, a, {
  email: a.owner.toLowerCase() + '@example.com' }));
cfg.reply_to = 'hello@example.com';
cfg.digest_to = 'owner@example.com';
cfg.digest_enabled = true;
store['config'] = [cfg];
console.log('config: mode ' + cfg.mode + ', chase after ' + cfg.chase_after_hours + 'h, ' +
  cfg.questions.length + ' standard questions\n');

// ---------------------------------------------------------------- workflow 1
console.log('--- workflow 1: an enquiry arrives ---');

const runCapture = (payload, label) => {
  const read = run('read the form fields', [payload])[0];
  if (!read._looks_real) {
    const stopped = run('STOP: spam or incomplete', [read])[0];
    console.log('  ' + label + ': rejected — ' + stopped._reason);
    return null;
  }
  const owned = run('assign an owner', [read])[0];
  const replied = run('write the first reply', [owned])[0];
  const row = run('row for the sheet', [replied])[0];
  return { read, owned, replied, row };
};

const cf7 = runCapture(sample('contact-form-7.json'), 'Contact Form 7');
expect('contact name read', cf7.read.contact, 'Rachel Okonkwo');
expect('email read', cf7.read.email, 'r.okonkwo@brightpath-dental.example');
expect('postcode read', cf7.read.postcode, 'SW1A 1AA');
expect('routed to area', cf7.owned.area, 'South');
expect('routed to owner', cf7.owned.owner, 'Priya');
expect('matched on prefix', cf7.owned._matched_on, 'SW');
expect('stage while previewing', cf7.replied.stage, 'New');
expect('sheet row has a Ref', /^CE-\d{8}-\d{4}$/.test(cf7.row.Ref), 'true');
expect('sheet row column count', Object.keys(cf7.row).filter((k) => k[0] !== '_').length, 20);

const wpf = runCapture(sample('wpforms.json'), 'WPForms');
if (!wpf) { console.log('  FAIL  WPForms payload was rejected'); process.exit(1); }
expect('nested payload flattened', wpf.read.contact, 'Tom Beasley');
expect('company from another name', wpf.read.company, 'Beasley Logistics');
expect('postcode dug out of message', wpf.read.postcode, 'EN3 7QW');
expect('routed to area', wpf.owned.area, 'North');
expect('matched on prefix', wpf.owned._matched_on, 'EN');

runCapture(sample('spam.json'), 'honeypot spam');

// the three standard questions must actually be in the email
const q = cfg.questions[0];
expect('questions in the html', cf7.replied.customer_html.includes(q.slice(0, 30)), 'true');
expect('questions in the text', cf7.replied.customer_text.includes(q), 'true');
expect('ref in the subject', cf7.replied.customer_subject.includes(cf7.read.ref), 'true');
expect('owner subject names the area', cf7.replied.owner_subject.startsWith('[South]'), 'true');

// live mode moves the stage on, because a reply really was sent
store['config'] = [Object.assign({}, cfg, { mode: 'live', send_enabled: true, live_send: true })];
const live = run('write the first reply', [cf7.owned])[0];
expect('stage when live', live.stage, 'Questions sent');
store['config'] = [cfg];

// an unroutable postcode still lands on someone
const orphan = run('assign an owner', [Object.assign({}, cf7.read, { postcode: 'ZZ99 9ZZ' })])[0];
expect('unknown postcode falls back', orphan.owner, cfg.fallback.owner);
expect('fallback flagged as no email', orphan._owner_has_email, 'false');

// ---------------------------------------------------------------- workflow 2
console.log('\n--- workflow 2: the morning run ---');

// Push the sample rows back in time so "48 hours ago" means something today.
const rows = sample('tracker-rows.json');
const hoursAgo = (h) => new Date(Date.now() - h * 3600000).toISOString().slice(0, 16).replace('T', ' ');
const ages = { 'CE-20260825-1001': 72, 'CE-20260828-1002': 6, 'CE-20260830-1003': 96,
               'CE-20260826-1004': 200, 'CE-20260824-1005': 120 };
for (const r of rows) { r['Last touch'] = hoursAgo(ages[r.Ref]); }

const analysis = run('find what has gone quiet', rows)[0];
expect('rows read', analysis.rows_read, 5);
expect('open enquiries', analysis.open_count, 4);
expect('owners to nudge', analysis.groups.length, 1);
expect('enquiries to chase', analysis.stalled_count, 1);
expect('Won row left alone', analysis.board.Won, 1);
expect('recently touched not chased', JSON.stringify(analysis.groups[0].items.map((i) => i.ref)),
       JSON.stringify(['CE-20260825-1001']));
expect('chase cap respected (1005 had 2)',
       analysis.groups.every((g) => g.items.every((i) => i.ref !== 'CE-20260824-1005')), 'true');
expect('missing owner email flagged', analysis.no_owner_email.length, 1);
expect('  ...and it is the right one', analysis.no_owner_email[0].ref, 'CE-20260830-1003');

const groups = run('split by owner', [analysis]);
const nudge = run('write the nudge', [groups[0]])[0];
expect('nudge names the owner', nudge.nudge_subject.includes(nudge.owner), 'true');
expect('nudge lists the company', nudge.nudge_text.includes('Brightpath Dental'), 'true');
expect('nudge says how long', /quiet for \d+ days/.test(nudge.nudge_text), 'true');

const chases = run('record the chase', [{}]);
expect('one sheet update per enquiry', chases.length, 1);
expect('chase counter incremented', chases[0]['Chases sent'], 1);
expect('update matches on Ref', chases[0].Ref, 'CE-20260825-1001');

const digest = run('build the morning digest', [analysis])[0];
expect('digest counts the open ones', digest.open_count, 4);
expect('digest shows every stage', Object.keys(digest.board).sort().join(','),
       'New,Questions sent,Quoting,Won');
expect('digest flags the missing owner email', digest.digest_html.includes('No owner email'), 'true');
expect('digest would send', digest._send_digest, 'true');

// a quiet day: nothing stalled, digest still goes
const calm = rows.map((r) => Object.assign({}, r, { 'Last touch': hoursAgo(1) }));
const calmAnalysis = run('find what has gone quiet', calm)[0];
expect('quiet day: nothing to chase', calmAnalysis._has_stalled, 'false');
const calmDigest = run('build the morning digest', [calmAnalysis])[0];
expect('quiet day: digest still sends', calmDigest._send_digest, 'true');
expect('quiet day: says so', calmDigest.digest_text.includes('Nothing has gone quiet'), 'true');

// every date shape a cell can hold must still be chased
console.log('\n  date formats the chaser must survive:');
const shapes = [
  ['what we write',      '2026-08-25 09:12'],
  ['date only',          '2026-08-25'],
  ['en-GB reformatted',  '25/08/2026 09:12'],
  ['en-US reformatted',  '08/25/2026 09:12'],
  ['dotted',             '25.08.2026'],
  ['Sheets serial',      '46259.3833']
];
for (const [label, when] of shapes) {
  const probe = [Object.assign({}, rows[0], { 'Last touch': when, 'Chases sent': '0' })];
  const seen = run('find what has gone quiet', probe)[0];
  expect('  ' + label, seen.stalled_count, 1);
}
const unreadable = run('find what has gone quiet',
  [Object.assign({}, rows[0], { 'Last touch': 'last Tuesday', 'Received': '' })])[0];
expect('  unreadable date is not chased', unreadable.stalled_count, 0);

console.log('\n--- the digest, as it would arrive ---\n');
console.log(digest.digest_text);

console.log('\n--- the nudge, as it would arrive ---\n');
console.log(nudge.nudge_text);

console.log('\n' + (failures ? failures + ' CHECK(S) FAILED' : 'all checks passed'));
process.exitCode = failures ? 1 : 0;
