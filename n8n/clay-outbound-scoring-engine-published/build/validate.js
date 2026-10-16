// Structural checks from GUIDELINES §8, on both workflow files. Exit 1 on any failure.
//   bun validate.js
const fs = require('fs');
const path = require('path');
const FILES = ['01-score-enrich-and-route.json', '02-classify-replies-and-call-list.json'];
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
  const cfgSrc = cfg[0].parameters.jsCode;
  configs.push(cfgSrc);
  check(wf.settings.executionOrder === 'v1', 'executionOrder v1');
  check(!raw.includes('"credentials"'), 'no credential ids embedded');
  const keys = cfgSrc.match(/^const [A-Z_]*(KEY|TOKEN|PASSWORD|SECRET|CLIENT_ID|CAMPAIGN_ID|WEBHOOK_URL)\s*=\s*'[^']+'/gm);
  check(!keys, 'every key, secret, id and webhook ships blank' + (keys ? ': ' + keys.join(', ') : ''));
  const camp = cfgSrc.match(/SMARTLEAD_CAMPAIGNS\s*=\s*\{([^}]*)\}/);
  check(camp && !/:\s*'[^']+'/.test(camp[1]), 'SMARTLEAD_CAMPAIGNS ships blank');
  const owners = cfgSrc.match(/OWNER_BY_TIER\s*=\s*\{([^}]*)\}/);
  check(owners && !/:\s*'[^']+'/.test(owners[1]), 'OWNER_BY_TIER ships blank');
  check(/const TEST_RUN\s*=\s*true;/.test(cfgSrc), 'TEST_RUN ships true');
  const sticky = wf.nodes.filter((n) => /start here/.test((n.parameters || {}).content || ''));
  check(sticky.length === 1 && sticky[0].position[1] === Math.min(...wf.nodes.map((n) => n.position[1])),
    'one "start here" note, topmost on the canvas');

  const bad = [];
  for (const [from, c] of Object.entries(wf.connections)) {
    if (!names.has(from)) bad.push(from);
    for (const out of c.main || []) for (const t of out) if (!names.has(t.node)) bad.push(from + ' -> ' + t.node);
  }
  check(!bad.length, 'every connection resolves' + (bad.length ? ': ' + bad.join('; ') : ''));

  for (const n of wf.nodes.filter((n) => n.type === 'n8n-nodes-base.if')) {
    const outs = (wf.connections[n.name] || {}).main || [];
    check(outs.length === 2 && outs[0].length && outs[1].length, 'IF "' + n.name + '" has both branches wired');
  }
  for (const n of wf.nodes.filter((n) => n.onError === 'continueErrorOutput')) {
    const outs = (wf.connections[n.name] || {}).main || [];
    check(outs.length === 2 && outs[1].length, '"' + n.name + '" error output lands on a named node');
  }
  for (const n of wf.nodes.filter((n) => n.type === 'n8n-nodes-base.merge')) {
    const ins = new Set();
    for (const c of Object.values(wf.connections)) for (const out of c.main || []) for (const t of out)
      if (t.node === n.name) ins.add(t.index);
    check(ins.size === n.parameters.numberInputs, 'merge "' + n.name + '" has every input wired');
  }
  const targets = new Set();
  for (const c of Object.values(wf.connections)) for (const out of c.main || []) for (const t of out) targets.add(t.node);
  const orphans = wf.nodes.filter((n) => !/Trigger|webhook|stickyNote/i.test(n.type) && !targets.has(n.name)).map((n) => n.name);
  check(!orphans.length, 'no unreachable node' + (orphans.length ? ': ' + orphans.join(', ') : ''));

  // Every $('X') reference inside code or expressions names a node in this workflow.
  const refs = [...raw.matchAll(/\$\(\\?['"]([^'"\\]+)\\?['"]\)/g)].map((m) => m[1]);
  const missing = [...new Set(refs.filter((r) => !names.has(r)))];
  check(!missing.length, "every $('node') reference resolves" + (missing.length ? ': ' + missing.join(', ') : ''));

  for (const n of wf.nodes.filter((n) => n.type === 'n8n-nodes-base.code')) {
    try { new Function('$input', '$', '$execution', n.parameters.jsCode); }
    catch (e) { check(false, 'jsCode parses: ' + n.name + ' (' + e.message + ')'); }
  }
  check(true, wf.nodes.filter((n) => n.type === 'n8n-nodes-base.code').length + ' Code nodes parse');
}
check(configs[0] === configs[1], 'config is identical in both workflows');
console.log(fails ? '\n' + fails + ' failure(s)' : '\nall checks passed');
process.exit(fails ? 1 : 0);
