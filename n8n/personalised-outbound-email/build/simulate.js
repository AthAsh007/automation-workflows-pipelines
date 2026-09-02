// Runs the workflow's Code nodes against the real sample CSV and the real
// client-deliverables folder, with the GitHub calls served from local disk.
// Proves the parsing and the copy before anything is imported into n8n.
//
//   node simulate.js [path-to-client-deliverables]
//
// Writes rendered previews to build/preview/.
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const WF = JSON.parse(fs.readFileSync(path.join(ROOT, '..', 'workflow.json'), 'utf8'));
const CSV = path.join(ROOT, '..', 'sample', 'Singapore_Lead_Tracker-Acme - Lead Tracker.csv');
const DELIVERABLES = process.argv[2] ||
  'D:/Work/website-redesign-services/website-growth-services/client-deliverables';
const PREVIEW = path.join(ROOT, 'preview');

const nodeOf = (name) => {
  const n = WF.nodes.find((x) => x.name === name);
  if (!n) throw new Error('no node named ' + name);
  return n;
};
const codeOf = (name) => nodeOf(name).parameters.jsCode;

// n8n hands a node with executeOnce:true only its first item. Honour that here, or the
// simulator happily "passes" a node that would drop every item but the first.
const applyExecuteOnce = (name, items) =>
  nodeOf(name).executeOnce === true ? items.slice(0, 1) : items;

// ---------------------------------------------------------------- csv
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  const src = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  const header = rows.shift();
  return rows.filter((r) => r.some((v) => v.trim() !== ''))
             .map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}

// ---------------------------------------------------------------- n8n shim
const store = {};                       // node name -> array of items

function run(nodeName, inputItems, extraStore) {
  inputItems = applyExecuteOnce(nodeName, inputItems);
  const ctx = Object.assign({}, store, extraStore || {});
  const wrapItems = (arr) => arr.map((j) => ({ json: j }));
  const $input = {
    all: () => wrapItems(inputItems),
    first: () => ({ json: inputItems[0] }),
    last: () => ({ json: inputItems[inputItems.length - 1] })
  };
  const $ = (name) => {
    if (!(name in ctx)) throw new Error('simulate: node "' + name + '" has no recorded output');
    const arr = ctx[name];
    return { all: () => wrapItems(arr), first: () => ({ json: arr[0] }),
             last: () => ({ json: arr[arr.length - 1] }) };
  };
  const fn = new Function('$input', '$', '"use strict";' + codeOf(nodeName));
  const out = fn($input, $);
  const items = out.map((o) => o.json);
  store[nodeName] = items;
  return items;
}

function runBinary(nodeName, inputItems) {
  inputItems = applyExecuteOnce(nodeName, inputItems);
  const ctx = Object.assign({}, store);
  const $input = {
    all: () => inputItems,
    first: () => inputItems[0],
    last: () => inputItems[inputItems.length - 1]
  };
  const $ = (name) => {
    const arr = ctx[name];
    if (!arr) throw new Error('simulate: node "' + name + '" has no recorded output');
    return { all: () => arr.map((j) => ({ json: j })), first: () => ({ json: arr[0] }),
             last: () => ({ json: arr[arr.length - 1] }) };
  };
  const out = new Function('$input', '$', '"use strict";' + codeOf(nodeName))($input, $);
  store[nodeName] = out.map((o) => o.json);
  return out.map((o) => Object.assign({}, o.json, { _binary: o.binary }));
}

// ---------------------------------------------------------------- fake GitHub
const listDeliverables = (domain) => {
  const dir = path.join(DELIVERABLES, domain);
  if (!fs.existsSync(dir)) return [{ message: 'Not Found', status: '404' }];
  return fs.readdirSync(dir, { withFileTypes: true }).map((e) => ({
    name: e.name,
    path: 'client-deliverables/' + domain + '/' + e.name,
    type: e.isDirectory() ? 'dir' : 'file',
    size: e.isFile() ? fs.statSync(path.join(dir, e.name)).size : 0
  }));
};

const readDeliverable = (url) => {
  // url is the api.github.com contents URL our code built; map it back to disk
  const m = decodeURIComponent(String(url || '')).match(/client-deliverables\/([^?]+)/);
  if (!m) return '';
  const p = path.join(DELIVERABLES, ...m[1].split('/'));
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
};

// ---------------------------------------------------------------- run
const cfg = run('config', [{}])[0];
// Simulation-only overrides: the shipped config has these blank on purpose.
cfg.github_enabled = true;
cfg.github_auth = 'Bearer SIMULATED';
cfg.from_email = 'hello@acme.example';
cfg.from_header = 'Acme <hello@acme.example>';
store['config'] = [cfg];

const allRows = parseCsv(fs.readFileSync(CSV, 'utf8'));

// The live sheet has the redesign link filled in; this sample CSV predates that
// column being populated, so stand one in for every domain the repo actually has.
let linked = 0;
for (const r of allRows) {
  // The sample export predates both the "Ready for outreach" stage and the rename of
  // Status to Contact Status. The live sheet has both.
  r['Contact Status'] = r['Status'];
  if (r['Task Progress'] === 'e. Redesigned') r['Task Progress'] = 'Ready for outreach';
  const domain = String(r['Website / Link'] || '').toLowerCase()
    .replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  if (domain && fs.existsSync(path.join(DELIVERABLES, domain))) {
    r['Link to the redesign website'] = 'https://deliverables.acme.example/' + domain;
    // The sample CSV ships every Email as "TBD"; stand in an obviously fake one so
    // the copy path is actually exercised. Nothing is sent from here.
    if (!/@/.test(r['Email'])) r['Email'] = 'hello@' + domain;
    linked++;
  }
}
console.log('CSV rows: ' + allRows.length + ', redesign links stood in for: ' + linked);

const picked = run('pick sendable rows', allRows);
if (picked[0] && picked[0]._nothing_to_send) {
  console.log('nothing eligible to send:');
  console.log(JSON.stringify(picked[0]._summary, null, 2));
  process.exit(0);
}
console.log('picked: ' + picked.length);
console.log('selection summary: ' + JSON.stringify(picked[0]._summary, null, 2));

fs.mkdirSync(PREVIEW, { recursive: true });
const processed = [];
const emails = [];
let collectBugs = 0;

for (const lead of picked) {
  store['Loop over leads'] = [lead];

  const listing = listDeliverables(lead.domain);
  const files = run('pick deliverable files', listing);
  const f = files[0];

  if (!f._has_deliverables) {
    const flagged = run('STOP: no deliverables in repo', [f])[0];
    run('prepare sheet update', [flagged]);
    processed.push(run('record outcome', [flagged])[0]);
    continue;
  }

  store['[cred] GitHub - get pitch notes'] = [{ data: readDeliverable(f.notes_url) }];
  store['[cred] GitHub - get seo geo tip'] = [{ data: readDeliverable(f.seo_url) }];

  const email = run('build email content', [f])[0];
  if (process.env.DEBUG_PARSE) console.log(lead.domain, JSON.stringify(email._parsed));
  store['send this one?'] = [email];
  emails.push(email);

  // attachment branch, with the downloads served from disk
  let ready = email;
  if ((email._attachments || []).length) {
    store['any attachments?'] = [email];
    const parts = run('split attachments', [email]);
    const downloaded = parts.map((a) => ({
      binary: { data: { fileName: 'from-url', mimeType: '', fileSize: a.bytes } }
    }));
    ready = runBinary('collect attachments', downloaded)[0];
    const got = String(ready._attachment_props || '').split(',').filter(Boolean).length;
    if (got !== parts.length) {
      console.log('!! ' + lead.domain + ': planned ' + parts.length +
        ' attachments but collected ' + got);
      collectBugs++;
    }
  } else {
    ready = run('STOP: no attachments', [email])[0];
  }

  store['send this one?'] = [ready];
  const stopped = run('STOP: preview - not sent', [ready])[0];
  run('prepare sheet update', [stopped]);
  processed.push(run('record outcome', [stopped])[0]);

  const slug = lead.domain.replace(/[^a-z0-9.]/g, '-');
  fs.writeFileSync(path.join(PREVIEW, slug + '.html'), email.html, 'utf8');
  fs.writeFileSync(path.join(PREVIEW, slug + '.txt'),
    'SUBJECT: ' + email.subject + '\nTO: ' + email.email + '\n\n' + email.text, 'utf8');
}

// one write-back, using the first lead that has deliverables
const sample = emails[0];
if (sample) {
  const asSent = Object.assign({}, sample, { _outcome: 'sent' });
  console.log('\nsheet write-back for #' + asSent.row_id + ' (' + asSent.domain + '):');
  const upd = run('prepare sheet update', [asSent])[0];
  for (const [k, v] of Object.entries(upd)) {
    if (!k.startsWith('_')) console.log('  ' + k + ': ' + String(v).slice(0, 90).replace(/\n/g, ' / '));
  }
}

const summary = run('build run summary', processed)[0];
console.log('\n' + summary.text);
console.log('\npreviews written to ' + PREVIEW);

// ---------------------------------------------------------------- remaining nodes
// The AI-polish and SMTP paths have no local stand-in, so exercise them against
// stubbed responses. Everything else above ran on real data.
console.log('\n--- optional paths ---');
if (sample) {
  store['build email content'] = [sample];
  const stubbed = {
    choices: [{ message: { content: JSON.stringify({
      subject: 'Two ways ' + sample.domain + ' could look',
      intro: 'We rebuilt your site on spec and put two directions live. Nothing owed either way.'
    }) } }]
  };
  const polished = run('apply polish', [stubbed])[0];
  console.log('apply polish   -> applied: ' + polished._llm_applied);
  console.log('               -> subject: ' + polished.subject);
  console.log('               -> intro carried into html: ' +
    polished.html.includes('Nothing owed either way'));

  const junk = run('apply polish', [{ choices: [{ message: { content: 'not json' } }] }])[0];
  console.log('bad AI response -> falls back to our subject: ' + (junk.subject === sample.subject));

  store['send this one?'] = [sample];
  const sent = run('mark sent', [{ messageId: '<abc@acme>', accepted: [sample.email], rejected: [] }])[0];
  console.log('mark sent      -> outcome ' + sent._outcome + ', accepted ' + sent._accepted);

  const upd = run('prepare sheet update', [sent])[0];
  const rec = run('record outcome', [upd])[0];
  console.log('record outcome -> ' + JSON.stringify(rec));
}

// A greeting check on the shapes this list actually contains.
console.log('\n--- greeting heuristic ---');
const gnames = ['David Ho (Insurance Broker)', 'Karen Tang, CFP', 'Amy Lim Law Practice',
                'Gloria James-Civetta & Co (GJC Law)', 'Acclaim Insurance Brokers', 'Legacy FA'];
const probe = gnames.map((n, i) => ({
  '#': String(900 + i), 'Business Name': n, 'Type': 'Law Firm',
  'Website / Link': 'https://example' + i + '.com', 'Task Progress': 'Ready for outreach',
  'Contact Status': 'Not contacted', 'Email': 'x' + i + '@example.com', 'Method of Contact': 'Email',
  'Link to the redesign website': 'https://deliverables.acme.example/x', 'Priority': 'High'
}));
for (const g of run('pick sendable rows', probe)) {
  console.log('  ' + g.business.padEnd(38) + ' -> ' + g.greeting);
}

// ---------------------------------------------------------------- sheet-authored copy
// A row whose Email Title / Email Content cells are already filled must go out as
// written, with no generated sections and no AI pass.
console.log('\n--- sheet-authored copy ---');
{
  const handWritten = [Object.assign({}, allRows.find((r) => r['Business Name']), {
    '#': '999',
    'Business Name': 'Hand Written Pte Ltd',
    'Website / Link': 'https://harbor-law.example',
    'Task Progress': 'ready for outreach',    // deliberately lower case
    'Contact Status': 'Not contacted',
    'Email': 'someone@harbor-law.example',
    'Method of Contact': 'Email',
    'Link to the redesign website': 'https://deliverables.acme.example/harbor-law.example',
    'Email Title': 'A note about your site',
    'Email Content': 'Hi Gloria,\n\nWe put together two redesigns of harbor-law.example. '
      + 'Have a look here: https://deliverables.acme.example/harbor-law.example\n\nOperator'
  })];

  const lead = run('pick sendable rows', handWritten)[0];
  console.log('lower-case stage matched   : ' + (lead !== undefined && !lead._nothing_to_send));
  console.log('custom subject / body seen : ' + lead._has_custom_subject + ' / ' + lead._has_custom_body);

  store['Loop over leads'] = [lead];
  const f = run('pick deliverable files', listDeliverables(lead.domain))[0];
  store['[cred] GitHub - get pitch notes'] = [{ data: readDeliverable(f.notes_url) }];
  store['[cred] GitHub - get seo geo tip'] = [{ data: readDeliverable(f.seo_url) }];

  const email = run('build email content', [f])[0];
  console.log('copy source                : ' + email._copy_source);
  console.log('subject used verbatim      : ' + (email.subject === 'A note about your site'));
  console.log('body used verbatim         : ' + email.text.includes('Have a look here'));
  console.log('no generated SEO section   : ' + !email.text.includes('TWO SEO FIXES'));
  console.log('wrapped in the same shell  : ' + email.html.startsWith('<div style="display:none'));
  fs.writeFileSync(path.join(PREVIEW, '_sheet-authored.html'), email.html, 'utf8');
}

// ---------------------------------------------------------------- test-run mode
// The redirect lives in the SMTP node's parameters as n8n expressions, so pull them
// out of workflow.json and evaluate them the way n8n would.
console.log('\n--- test run (TEST_RUN true, TEST_EMAIL set) ---');
{
  const testCfg = Object.assign({}, cfg, {
    mode: 'test', preview_only: false, test_send: true, live_send: false,
    send_enabled: true, test_email: 'operator@acme.example', bcc_email: 'filed@acme.example'
  });
  const lookup = { config: [testCfg] };
  const $t = (name) => ({ first: () => ({ json: lookup[name][0] }) });

  const smtp = WF.nodes.find((n) => n.name === '[cred] SMTP - send deliverables').parameters;
  const evalExpr = (expr, json) => {
    const inner = String(expr).replace(/^=\{\{/, '').replace(/\}\}$/, '');
    return new Function('$', '$json', 'return (' + inner + ');')($t, json);
  };
  const lead = { email: 'someone@harbor-law.example', subject: 'Two directions for GJC Law' };

  console.log('to      : ' + evalExpr(smtp.toEmail, lead));
  console.log('subject : ' + evalExpr(smtp.subject, lead));
  console.log('bcc     : ' + JSON.stringify(evalExpr(smtp.options.bccEmail, lead)));

  // and the same expressions in live mode
  lookup.config = [Object.assign({}, testCfg, { mode: 'live', test_send: false, live_send: true })];
  console.log('live to : ' + evalExpr(smtp.toEmail, lead));
  console.log('live bcc: ' + JSON.stringify(evalExpr(smtp.options.bccEmail, lead)));

  // summary text in test mode, on a real selection so the cap line is honest
  lookup.config = [testCfg];
  store['config'] = [testCfg];
  run('pick sendable rows', allRows);
  const rows = [
    { _outcome: 'test_send', _row_id: '1', _business: 'GJC Law', _email: 'someone@harbor-law.example',
      _domain: 'harbor-law.example', _sent_to: testCfg.test_email, _skip_reason: '' }
  ];
  console.log('\n' + run('build run summary', rows)[0].text);
  store['config'] = [cfg];
}

// ---------------------------------------------------------------- test batch
// A test run must mail one lead, not the whole daily batch.
console.log('\n--- test batch ---');
{
  const modes = [
    ['preview', Object.assign({}, cfg, { mode: 'preview', test_send: false, live_send: false })],
    ['test',    Object.assign({}, cfg, { mode: 'test',    test_send: true,  live_send: false })],
    ['live',    Object.assign({}, cfg, { mode: 'live',    test_send: false, live_send: true  })]
  ];
  for (const [label, c] of modes) {
    store['config'] = [c];
    const picked = run('pick sendable rows', allRows);
    const sum = picked[0]._summary;
    console.log('  ' + label.padEnd(8) + ' eligible ' + String(sum.eligible).padEnd(3) +
      ' -> picked ' + String(sum.selected).padEnd(3) + ' (cap ' + sum.cap + ', ' + sum.cap_reason + ')');
  }
  store['config'] = [cfg];
}

// ---------------------------------------------------------------- no-deliverables write-back
// A row the repo has nothing for must keep its place in the pipeline: notes and a next
// action, but Task Progress and Contact Status left exactly as they were.
console.log('\n--- no-deliverables write-back ---');
{
  const flagged = processed.find((r) => r._outcome === 'no_deliverables');
  if (flagged) {
    const lead = picked.find((l) => l.row_id === flagged._row_id);
    const upd = run('prepare sheet update',
      [Object.assign({}, lead, { _outcome: 'no_deliverables', _skip_reason: flagged._skip_reason })])[0];
    for (const [k, v] of Object.entries(upd)) {
      if (!k.startsWith('_')) console.log('  ' + k + ': ' + String(v).slice(0, 88).replace(/\n/g, ' / '));
    }
    console.log('  (was: Task Progress "' + lead.task_progress + '", Contact Status "' + lead.status + '")');
  }
}

// ---------------------------------------------------------------- the redesign link
console.log('\n--- redesign link ---');
{
  const base = allRows.find((r) => r['Website / Link'].includes('gjclaw'));
  const mk = (over) => Object.assign({}, base, { '#': '801' }, over);

  // 1. blank link, no custom copy -> not picked at all
  const blank = run('pick sendable rows', [mk({ 'Link to the redesign website': '' })]);
  console.log('blank link, generated copy : picked=' + (blank[0]._nothing_to_send ? 0 : 1) +
    ', reason=' + Object.entries(blank[0]._summary.skipped).filter(([, n]) => n).map(([k]) => k).join(','));

  // 2. blank link, but the row carries its own body -> exempt
  const own = run('pick sendable rows', [mk({
    'Link to the redesign website': '',
    'Email Content': 'Hi Gloria,\n\nSending the files across separately. Shout if anything is off.\n\nOperator'
  })]);
  console.log('blank link, own copy       : picked=' + (own[0]._nothing_to_send ? 0 : 1));

  // 3. requirement switched off -> the email must not ship a dead button
  store['config'] = [Object.assign({}, cfg, { require_redesign_link: false })];
  const lead = run('pick sendable rows', [mk({ 'Link to the redesign website': '' })])[0];
  store['Loop over leads'] = [lead];
  const f = run('pick deliverable files', listDeliverables(lead.domain))[0];
  store['[cred] GitHub - get pitch notes'] = [{ data: readDeliverable(f.notes_url) }];
  store['[cred] GitHub - get seo geo tip'] = [{ data: readDeliverable(f.seo_url) }];
  const email = run('build email content', [f])[0];
  console.log('requirement off, no link   : picked=1');
  console.log('  empty href in html       : ' + /href=""/.test(email.html));
  console.log('  CTA button present       : ' + email.html.includes('See both directions'));
  console.log('  text promises a link     : ' + email.text.includes('See both directions:'));
  console.log('  next-steps line          : ' + email.text.split('WHAT HAPPENS NEXT')[1].trim().split('\n')[0]);
  store['config'] = [cfg];
}

// ---------------------------------------------------------------- attachment budget
// What each client would actually receive, against the configured budget.
console.log('\n--- attachments ---');
{
  const MB = 1048576;
  let pngOnly = 0, withPdfs = 0, none = 0, biggest = 0;
  for (const e of emails) {
    const names = e._attachment_names || [];
    const pdfs = names.filter((n) => /\.pdf$/i.test(n)).length;
    biggest = Math.max(biggest, e._attachment_bytes || 0);
    if (!names.length) none++; else if (pdfs) withPdfs++; else pngOnly++;
  }
  console.log('  mailbox limit     : ' + cfg.mailbox_limit_mb + ' MB  ->  raw budget '
    + (cfg.attach_budget / MB).toFixed(1) + ' MB (~'
    + ((cfg.attach_budget * 1.37 + 262144) / MB).toFixed(1) + ' MB on the wire)');
  console.log('  PNGs + PDFs       : ' + withPdfs + ' of ' + emails.length);
  console.log('  PNGs only         : ' + pngOnly);
  console.log('  nothing attached  : ' + none);
  console.log('  largest payload   : ' + (biggest / MB).toFixed(2) + ' MB raw');
  const sample = emails[0];
  console.log('  example (' + sample.domain + '):');
  for (const a of sample._attachments) console.log('    ' + a.prop + '  ' + a.filename + '  ' + (a.bytes / MB).toFixed(2) + ' MB');
  console.log('  copy line         : ' + sample.text.split('\n').filter((l) => l.startsWith('Attached') || l.startsWith('Both directions are'))[0]);
  console.log('  every planned file collected: ' + (collectBugs === 0));
  if (collectBugs) { console.log('  FAILED: attachments were dropped'); process.exitCode = 1; }
}
