// Structural checks from GUIDELINES §8, on both workflow files. Exit 1 on any failure.
//   bun validate.js
const fs = require('fs');
const path = require('path');
const FILES = ['01-reprice-and-announce.json', '02-whatsapp-enquiries.json'];
let fails = 0;
const check = (ok, label) => { console.log((ok ? '  ok    ' : '  FAIL  ') + label); if (!ok) fails++; };

const configs = [];
for (const f of FILES) {
  console.log(f);
  const raw = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  const wf = JSON.parse(raw);
  const names = new Set(wf.nodes.map((n) => n.name));
  check(names.size === wf.nodes.length, 'node names are unique');
  check(!/\$env/.test(raw), 'no $env anywhere');
  const cfg = wf.nodes.filter((n) => n.name === 'config');
  check(cfg.length === 1 && cfg[0].type === 'n8n-nodes-base.code', 'exactly one config, a Code node');
  configs.push(cfg[0].parameters.jsCode);
  check(wf.settings.executionOrder === 'v1', 'executionOrder v1');
  check(!raw.includes('"credentials"'), 'no credential ids embedded');
  const keys = cfg[0].parameters.jsCode.match(/^const [A-Z_]*(KEY|TOKEN|PASSWORD|WHATSAPP|FROM)\s*=\s*'[^']+'/gm);
  check(!keys, 'every key / number ships blank' + (keys ? ': ' + keys.join(', ') : ''));
  check(/const TEST_RUN\s*=\s*true;/.test(cfg[0].parameters.jsCode), 'TEST_RUN ships true');
  const sticky = wf.nodes.filter((n) => /start here/.test((n.parameters || {}).content || ''));
  check(sticky.length === 1 && sticky[0].position[1] === Math.min(...wf.nodes.map((n) => n.position[1])),
    'one "start here" note, topmost on the canvas');

  let bad = [];
  for (const [from, c] of Object.entries(wf.connections)) {
    if (!names.has(from)) bad.push(from);
    for (const out of c.main || []) for (const t of out) if (!names.has(t.node)) bad.push(from + ' -> ' + t.node);
  }
  check(!bad.length, 'every connection resolves' + (bad.length ? ': ' + bad.join('; ') : ''));

  for (const n of wf.nodes.filter((n) => n.type === 'n8n-nodes-base.if')) {
    const outs = (wf.connections[n.name] || {}).main || [];
    check(outs.length === 2 && outs[0].length && outs[1].length, 'IF "' + n.name + '" has both branches wired');
  }
  const targets = new Set();
  for (const c of Object.values(wf.connections)) for (const out of c.main || []) for (const t of out) targets.add(t.node);
  const orphans = wf.nodes.filter((n) => !/Trigger|webhook|stickyNote/i.test(n.type) && !targets.has(n.name)).map((n) => n.name);
  check(!orphans.length, 'no unreachable node' + (orphans.length ? ': ' + orphans.join(', ') : ''));

  for (const n of wf.nodes.filter((n) => n.type === 'n8n-nodes-base.code')) {
    try { new Function('$input', '$', '$execution', n.parameters.jsCode); }
    catch (e) { check(false, 'jsCode parses: ' + n.name + ' (' + e.message + ')'); }
  }
  check(true, wf.nodes.filter((n) => n.type === 'n8n-nodes-base.code').length + ' Code nodes parse');
}
check(configs[0] === configs[1], 'config is identical in both workflows');
console.log(fails ? '\n' + fails + ' failure(s)' : '\nall checks passed');
process.exit(fails ? 1 : 0);
