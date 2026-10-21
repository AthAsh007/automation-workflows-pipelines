// Structural check on both workflows and their -publish.json copies.
//   bun build/validate.mjs
//
// JSON parses; names unique; every connection resolves; every node reachable; IFs wired on
// both sides; merges fed on both inputs; per-item IFs rejoin at one merge; every Code node
// parses; every $('Node') reference — in code or in a parameter expression — names a node
// in the same file; HTTP calls degrade instead of failing; config ships safe; the PHI check
// sits in front of the rule; stickies follow n8n's template rules and never overlap; the
// publish copies differ from the working files only by de-identification and layout.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, '..');
const CLIENT = 'Trialbridge';
const JOB_URL = 'https://example.com/jobs/~022093811915701331307/';

const PER_ITEM_IFS = {
  '01-activity-guard': ['creating this activity?'],
  '02-recruitment-reporting': ['writing the dashboard?', 'sheet in use?']
};
// Code nodes that fold many items into one answer. executeOnce would silently drop the rest.
const FOLDERS = {
  '01-activity-guard': ['decide the next activity', 'build the run summary', 'STOP: every open deal is covered'],
  '02-recruitment-reporting': ['compute the KPIs', 'rows for the gaps tab', 'rows for the by rep tab',
    'rows for the by practice tab', "pick last week's row"]
};

const fails = [];
const check = (ok, msg) => { console.log((ok ? '  ok   ' : '  FAIL ') + msg); if (!ok) fails.push(msg); };
const words = (md) => md.replace(/[#*`>_\[\]()]/g, ' ').split(/\s+/).filter(Boolean).length;
const isSticky = (n) => n.type === 'n8n-nodes-base.stickyNote';
const NODE = 100;

function structure(file, wf, raw, publish) {
  const nodes = wf.nodes;
  const names = nodes.map((n) => n.name);
  const nameset = new Set(names);
  const byName = Object.fromEntries(nodes.map((n) => [n.name, n]));

  check(names.length === nameset.size, 'node names are unique');
  const targets = {};
  for (const [src, c] of Object.entries(wf.connections)) {
    check(nameset.has(src), 'connection source exists: ' + src);
    (c.main || []).forEach((outs) => (outs || []).forEach((l) => {
      if (!nameset.has(l.node)) check(false, src + ' -> ' + l.node + ' resolves');
      (targets[l.node] = targets[l.node] || new Set()).add(l.index);
    }));
  }
  const TRIGGERS = ['n8n-nodes-base.manualTrigger', 'n8n-nodes-base.scheduleTrigger'];
  const unreachable = nodes.filter((n) => !isSticky(n) && !TRIGGERS.includes(n.type) && !targets[n.name]);
  check(!unreachable.length, 'every node is reachable' + (unreachable.length ? ': ' + unreachable.map((n) => n.name) : ''));
  nodes.filter((n) => TRIGGERS.includes(n.type)).forEach((n) =>
    check(!!wf.connections[n.name], 'trigger is wired: ' + n.name));

  for (const n of nodes) {
    if (n.type === 'n8n-nodes-base.if') {
      const outs = (wf.connections[n.name] || {}).main || [];
      check(outs.length === 2 && outs.every((o) => o && o.length), 'both branches wired: ' + n.name);
    }
    if (n.type === 'n8n-nodes-base.merge') {
      const got = [...(targets[n.name] || [])].sort().join(',');
      check(got === '0,1' && n.parameters.numberInputs === 2, 'both inputs fed: ' + n.name);
    }
  }
  for (const name of PER_ITEM_IFS[file]) {
    const reached = new Set(); const seen = new Set();
    const frontier = ((wf.connections[name] || {}).main || []).flat().map((l) => l.node);
    while (frontier.length) {
      const cur = frontier.pop();
      if (seen.has(cur)) continue;
      seen.add(cur);
      if (byName[cur].type === 'n8n-nodes-base.merge') { reached.add(cur); continue; }
      ((wf.connections[cur] || {}).main || []).flat().forEach((l) => frontier.push(l.node));
    }
    check(reached.size === 1, name + ' rejoins at exactly one merge ' + JSON.stringify([...reached]));
  }

  // Code parses, and every $('X') anywhere names a node in THIS file.
  for (const n of nodes) {
    if (n.type === 'n8n-nodes-base.code') {
      let err = '';
      try { new Function('$', '$json', '$input', '$getWorkflowStaticData', n.parameters.jsCode); }
      catch (e) { err = e.message; }
      check(!err, 'jsCode parses: ' + n.name + (err ? ' — ' + err : ''));
      if (FOLDERS[file].includes(n.name)) check(n.executeOnce !== true, 'no executeOnce on folder: ' + n.name);
      check(!/@include/.test(n.parameters.jsCode), 'includes resolved: ' + n.name);
    }
    if (isSticky(n)) continue;
    const text = JSON.stringify(n.parameters);
    for (const m of text.matchAll(/\$\(\\?['"]([^'"\\]+)\\?['"]\)/g)) {
      if (!nameset.has(m[1])) check(false, n.name + " references $('" + m[1] + "') which exists");
    }
  }
  console.log('  ok   all $(...) references resolve (any failure is listed above)');

  for (const n of nodes) {
    if (n.type === 'n8n-nodes-base.httpRequest' || n.type === 'n8n-nodes-base.slack') {
      check(n.onError === 'continueRegularOutput', 'degrades instead of failing the run: ' + n.name);
    }
    if (n.type === 'n8n-nodes-base.httpRequest') {
      check(n.parameters.options && n.parameters.options.timeout, 'has a timeout: ' + n.name);
    }
    if (/^\[cred\] Pipedrive - (open deals|activities|deal fields)$/.test(n.name)) {
      check(n.alwaysOutputData === true, 'always outputs data: ' + n.name);
    }
  }
  for (const nm of ['[cred] Pipedrive - open deals', '[cred] Pipedrive - activities']) {
    const p = byName[nm].parameters.options.pagination;
    check(p && p.pagination.paginationMode === 'updateAParameterInEachRequest' &&
      /next_start/.test(JSON.stringify(p)) && /more_items_in_collection/.test(JSON.stringify(p)),
      'paginated on start / more_items_in_collection: ' + nm);
  }
  for (const nm of ['[cred] Pipedrive - activities', '[cred] Pipedrive - deal fields']) {
    check(byName[nm].executeOnce === true, 'runs once, not once per deals page: ' + nm);
  }
  const cred = nodes.filter((n) => ['n8n-nodes-base.googleSheets', 'n8n-nodes-base.slack'].includes(n.type));
  cred.forEach((n) => check(n.name.startsWith('[cred] '), 'credentialed node is prefixed [cred]: ' + n.name));

  const cfg = byName.config;
  check(nodes.filter((n) => n.name === 'config').length === 1 && cfg.type === 'n8n-nodes-base.code',
    'exactly one config node, a Code node');
  const cfgjs = cfg.parameters.jsCode;
  check(!raw.includes('$env'), 'no $env anywhere');
  check(wf.settings.executionOrder === 'v1', 'executionOrder is v1');
  check(!nodes.some((n) => n.credentials), 'no credential ids embedded');
  check(/const TEST_RUN\s*=\s*true/.test(cfgjs), 'TEST_RUN ships true');
  check(/const DEMO_PIPELINE\s*=\s*true/.test(cfgjs), 'DEMO_PIPELINE ships true');
  check(/const SLACK_DMS\s*=\s*false/.test(cfgjs), 'SLACK_DMS ships false');
  for (const k of ['COMPANY_DOMAIN', 'API_TOKEN', 'PIPELINE_ID', 'SHEET_ID', 'ALERT_WEBHOOK_URL',
    'MANAGER_WEBHOOK_URL', 'TEST_OWNER_ID']) {
    const m = cfgjs.match(new RegExp('const ' + k + "\\s*=\\s*'([^']*)'"));
    check(!!m && m[1] === '', k + ' ships blank');
  }
  check(!/const \w*(KEY|TOKEN|SECRET|PASSWORD)\w*\s*=\s*'[^']{8,}'/.test(cfgjs), 'no key or token has a value');

  const phi = byName['check the PHI boundary'];
  check(/throw new Error/.test(phi.parameters.jsCode), 'misconfigured PHI read stops the run');
  check(wf.connections['read succeeded?'].main[0][0].node === 'check the PHI boundary' &&
    wf.connections['check the PHI boundary'].main[0][0].node === 'check every deal for a next activity',
    'the PHI check runs before any deal is read');
  check(wf.connections['read succeeded?'].main[1][0].node === 'build the read-failure alert',
    'a failed read goes to its own alert, not to the rule');

  // ---------------------------------------------------------------- stickies
  const st = nodes.filter(isSticky);
  const real = nodes.filter((n) => !isSticky(n));
  const box = (s) => ({ x: s.position[0], y: s.position[1], w: s.parameters.width, h: s.parameters.height });
  const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const inside = (n, b) => n.position[0] >= b.x && n.position[0] + NODE <= b.x + b.w &&
    n.position[1] >= b.y && n.position[1] + NODE <= b.y + b.h;
  const touches = (n, b) => overlap({ x: n.position[0], y: n.position[1], w: NODE, h: NODE }, b);
  const main = st.filter((s) => s.parameters.color === 1);
  check(main.length === 1, 'exactly one yellow overview sticky');
  if (main.length === 1) {
    const m = main[0], c = m.parameters.content, b = box(m);
    for (const h of ['### How it works', '### Setup', '### Requirements', '### How to customize']) {
      check(c.includes('\n' + h + '\n'), 'overview has "' + h + '"');
    }
    check(/^## \S/.test(c), 'overview opens with a ## title');
    check(words(c) >= 100 && words(c) <= 300, 'overview is 100-300 words (' + words(c) + ')');
    check(b.x + b.w <= Math.min(...real.map((n) => n.position[0])), 'overview is left of every node');
  }
  const sections = st.filter((s) => s.parameters.color === 7);
  check(sections.length >= 4, sections.length + ' section stickies');
  for (const s of sections) {
    const b = box(s);
    const covered = real.filter((n) => inside(n, b));
    check(words(s.parameters.content) < 50 && /^## \d+\. \S/.test(s.parameters.content),
      s.name + ': short ## note (' + words(s.parameters.content) + ' words)');
    check(covered.length >= 2, s.name + ' covers ' + covered.length + ' nodes');
  }
  for (const n of real) {
    const homes = sections.filter((s) => touches(n, box(s)));
    check(homes.length === 1 && inside(n, box(homes[0])),
      'node sits inside exactly one section: ' + n.name + ' (' + homes.map((h) => h.name) + ')');
    check(!main.length || !touches(n, box(main[0])), 'overview covers no node: ' + n.name);
  }
  for (let i = 0; i < st.length; i++) for (let j = i + 1; j < st.length; j++) {
    if (overlap(box(st[i]), box(st[j]))) check(false, st[i].name + ' overlaps ' + st[j].name);
  }
  console.log('  ok   no two stickies overlap (any overlap is listed above)');
  for (let i = 0; i < real.length; i++) for (let j = i + 1; j < real.length; j++) {
    const a = real[i].position, b = real[j].position;
    if (Math.abs(a[0] - b[0]) < NODE + 20 && Math.abs(a[1] - b[1]) < NODE + 20) {
      check(false, real[i].name + ' overlaps node ' + real[j].name);
    }
  }

  if (publish) {
    check(!raw.includes(CLIENT) && !/upwork/i.test(raw), 'publish copy names no client and no job link');
    check(!('pinData' in wf), 'no pinData in the publish copy');
    check(/^[A-Z][a-z]+ /.test(wf.name) && wf.name.split(' ').length >= 4, 'title is a sentence: ' + wf.name);
  } else {
    check(raw.includes(JOB_URL), 'the job link is on the working canvas');
  }
  return { cfgjs, nodes: real, connections: wf.connections };
}

const parsed = {};
for (const file of ['01-activity-guard', '02-recruitment-reporting']) {
  for (const publish of [false, true]) {
    const f = file + (publish ? '-publish' : '') + '.json';
    const raw = fs.readFileSync(path.join(OUT, f), 'utf8');
    let wf;
    try { wf = JSON.parse(raw); } catch (e) { check(false, f + ' parses: ' + e.message); continue; }
    console.log('\n== ' + f + '  (' + wf.nodes.filter((n) => !isSticky(n)).length + ' nodes)');
    parsed[f] = structure(file, wf, raw, publish);
  }
  // The publish copy is the same workflow: same nodes, parameters and edges, bar the client name.
  const a = parsed[file + '.json'], b = parsed[file + '-publish.json'];
  if (a && b) {
    const strip = (n) => JSON.stringify({ ...n, position: 0,
      parameters: n.parameters.jsCode ? { ...n.parameters, jsCode: n.parameters.jsCode
        .split(CLIENT + "'s").join("your company's").split(CLIENT).join('your company') } : n.parameters });
    const same = a.nodes.length === b.nodes.length && a.nodes.every((n, i) => strip(n) === strip(b.nodes[i]));
    check(same, file + ': publish copy is functionally identical (de-identification only)');
    check(JSON.stringify(a.connections) === JSON.stringify(b.connections), file + ': same connections');
  }
}

console.log('\n== the two workflows agree');
check(parsed['01-activity-guard.json'].cfgjs === parsed['02-recruitment-reporting.json'].cfgjs,
  'both files carry a byte-identical config node');

console.log('\n== the sheet');
const cfgNode = parsed['01-activity-guard.json'].cfgjs;
const c = new Function(cfgNode)()[0].json;
for (const [tab, cols] of [['Dashboard.csv', c.dashboard_columns], ['Gaps.csv', c.gap_columns],
  ['By rep.csv', c.by_rep_columns], ['By practice.csv', c.by_practice_columns]]) {
  const header = fs.readFileSync(path.join(OUT, 'sheet', tab), 'utf8').replace(/^﻿/, '').split(/\r?\n/)[0].split(',');
  const wanted = Object.values(cols);
  check(wanted.every((v) => header.includes(v)) && header.every((h) => wanted.includes(h)),
    tab + ': headings match the columns the workflow writes');
}

console.log();
if (fails.length) { console.log(fails.length + ' FAILED'); process.exit(1); }
console.log('all checks passed');
