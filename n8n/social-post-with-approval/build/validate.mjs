// Structural check on the built workflows.     Run: bun validate.mjs
//
// GUIDELINES §8 executed rather than remembered, on all four files (working + -publish): the
// failures that are invisible until import — a connection to a renamed node, a $('name') that
// no longer exists, an IF whose false branch goes nowhere, a Code node that does not parse, a
// sticky note on top of another — plus the ones specific to a pipeline whose mistakes land on a
// company page.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, '..');
const FILES = ['01-draft-and-approve.json', '01-draft-and-approve-publish.json',
  '02-publish-on-approval.json', '02-publish-on-approval-publish.json'];
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

const problems = [];
const notes = [];
const check = (cond, msg) => { if (!cond) problems.push(msg); };
const loaded = {};

for (const f of FILES) {
  const p = path.join(OUT, f);
  if (!fs.existsSync(p)) { problems.push(f + ' does not exist — run bun build.mjs'); continue; }
  const raw = fs.readFileSync(p, 'utf8');
  let wf;
  try { wf = JSON.parse(raw); } catch (e) { problems.push(f + ' is not valid JSON: ' + e.message); continue; }
  loaded[f] = wf;
  const nodes = wf.nodes;
  const byName = new Map(nodes.map((n) => [n.name, n]));
  const isPublish = f.endsWith('-publish.json');

  check(!raw.includes('$env'), f + ': reads $env');
  const cfg = nodes.filter((n) => n.name === 'config');
  check(cfg.length === 1 && cfg[0].type === 'n8n-nodes-base.code', f + ': needs exactly one Code node named config');
  check(wf.settings && wf.settings.executionOrder === 'v1', f + ': executionOrder is not v1');

  const names = nodes.map((n) => n.name);
  const dupes = names.filter((n, i) => names.indexOf(n) !== i);
  check(!dupes.length, f + ': duplicate node names: ' + dupes.join(', '));

  // connections resolve, and every node is reached
  const reached = new Set();
  for (const [src, o] of Object.entries(wf.connections)) {
    check(byName.has(src), f + ': connection from "' + src + '", which is not a node');
    for (const group of o.main || []) for (const c of group) {
      check(byName.has(c.node), f + ': "' + src + '" connects to "' + c.node + '", which is not a node');
      reached.add(c.node);
      const t = byName.get(c.node);
      if (t && t.type === 'n8n-nodes-base.merge') {
        check(c.index < (t.parameters.numberInputs || 2), f + ': "' + src + '" feeds input ' + c.index + ' of "' + c.node + '", which has ' + (t.parameters.numberInputs || 2));
      }
    }
  }
  const STARTERS = ['n8n-nodes-base.manualTrigger', 'n8n-nodes-base.scheduleTrigger', 'n8n-nodes-base.stickyNote'];
  for (const n of nodes) {
    if (!STARTERS.includes(n.type)) check(reached.has(n.name), f + ': nothing connects to "' + n.name + '"');
    if (n.type === 'n8n-nodes-base.scheduleTrigger' || n.type === 'n8n-nodes-base.manualTrigger') {
      check(wf.connections[n.name], f + ': trigger "' + n.name + '" is wired to nothing');
    }
  }

  // IF: both branches land. Switch: every rule plus the fallback lands.
  for (const n of nodes) {
    const o = (wf.connections[n.name] || {}).main || [];
    if (n.type === 'n8n-nodes-base.if') {
      check(o.length === 2 && o[0].length && o[1].length, f + ': IF "' + n.name + '" does not wire both branches');
    }
    if (n.type === 'n8n-nodes-base.switch') {
      const rules = n.parameters.rules.values.length;
      check(o.length === rules + 1 && o.every((g) => g.length), f + ': Switch "' + n.name + '" must wire ' + (rules + 1) + ' outputs');
    }
  }

  // every $('name') reference points at a node in this workflow
  for (const n of nodes) {
    const s = JSON.stringify(n.parameters);
    for (const m of s.matchAll(/\$\(\\?['"]([^'"\\]+)\\?['"]\)/g)) {
      check(byName.has(m[1]), f + ': "' + n.name + '" references $(\'' + m[1] + '\'), which is not a node');
    }
  }

  // Code nodes parse
  for (const n of nodes.filter((x) => x.type === 'n8n-nodes-base.code')) {
    try { new AsyncFunction('$json', '$', 'items', '$binary', '$input', n.parameters.jsCode); }
    catch (e) { problems.push(f + ': Code node "' + n.name + '" does not parse: ' + e.message); }
    const sets = /_stopped\s*:/.test(n.parameters.jsCode);
    if (n.name.startsWith('STOP: ')) check(sets, f + ': "' + n.name + '" is a STOP but never sets _stopped');
    else check(!sets, f + ': "' + n.name + '" sets _stopped but is not named STOP:');
  }

  // credentials: none embedded, and every service node is [cred]
  for (const n of nodes) {
    check(!n.credentials, f + ': "' + n.name + '" carries a credential');
    const svc = ['n8n-nodes-base.googleSheets', 'n8n-nodes-base.discord'].includes(n.type)
      || (n.type === 'n8n-nodes-base.httpRequest' && /linkedin\.com|llm_base_url|report_webhook_url|_render_url/.test(JSON.stringify(n.parameters)) && !/download/.test(n.name));
    if (svc) check(n.name.startsWith('[cred] '), f + ': "' + n.name + '" talks to a service but is not prefixed [cred]');
  }
  for (const m of raw.matchAll(/(?:_KEY|_TOKEN|_PASSWORD|_SECRET)\s*=\s*'([^']+)'/g)) {
    problems.push(f + ': a key/token constant has a non-empty literal: ' + m[1].slice(0, 6) + '...');
  }

  // stickies: none overlap another; overview yellow and left of every node
  const st = nodes.filter((n) => n.type === 'n8n-nodes-base.stickyNote').map((n) => ({
    name: n.name, x: n.position[0], y: n.position[1], w: n.parameters.width, h: n.parameters.height, color: n.parameters.color, content: n.parameters.content }));
  for (let i = 0; i < st.length; i++) for (let j = i + 1; j < st.length; j++) {
    const a = st[i], b = st[j];
    check(!(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h), f + ': sticky "' + a.name + '" overlaps "' + b.name + '"');
  }
  const real = nodes.filter((n) => n.type !== 'n8n-nodes-base.stickyNote');
  for (let i = 0; i < real.length; i++) for (let j = i + 1; j < real.length; j++) {
    const a = real[i].position, b = real[j].position;
    check(Math.abs(a[0] - b[0]) >= 120 || Math.abs(a[1] - b[1]) >= 120, f + ': nodes "' + real[i].name + '" and "' + real[j].name + '" overlap');
  }
  const main = st.filter((s) => s.color === 1);
  check(main.length === 1, f + ': needs exactly one yellow overview sticky');
  if (main.length) {
    const minX = Math.min(...nodes.filter((n) => n.type !== 'n8n-nodes-base.stickyNote').map((n) => n.position[0]));
    check(main[0].x + main[0].w < minX, f + ': the overview sticky is not left of the nodes');
    check(/^### How it works$/m.test(main[0].content) && /^### Setup$/m.test(main[0].content), f + ': overview needs ### How it works and ### Setup');
  }
  for (const s of st.filter((x) => x.color === 7)) check(/^## \d+\. /.test(s.content), f + ': section sticky "' + s.name + '" must start with "## N. "');

  if (isPublish) {
    check(!wf.pinData, f + ': carries pinData');
    check(!/manexus|acme|hermes|96592857/i.test(raw), f + ': still names its origin (manexus/acme/hermes/org id)');
  }

  notes.push(f.padEnd(36) + String(nodes.length).padStart(3) + ' nodes, '
    + nodes.filter((n) => n.type === 'n8n-nodes-base.code').length + ' code, '
    + names.filter((n) => n.startsWith('STOP: ')).length + ' stops, '
    + names.filter((n) => n.startsWith('[cred] ')).length + ' [cred], ' + st.length + ' stickies');
}

// ---------------------------------------------------------------- the safety switch
const cfgSrc = fs.readFileSync(path.join(HERE, 'js', 'config.js'), 'utf8');
for (const [re, msg] of [
  [/^const TEST_RUN\s*=\s*true;/m, 'TEST_RUN must ship as true'],
  [/^const TEST_CHANNEL_ID\s*=\s*'';/m, 'TEST_CHANNEL_ID must ship blank'],
  [/^const LINKEDIN_ACCESS_TOKEN\s*=\s*'';/m, 'LINKEDIN_ACCESS_TOKEN must ship blank'],
  [/^const LLM_API_KEY\s*=\s*'';/m, 'LLM_API_KEY must ship blank'],
  [/^const RENDER_KEY\s*=\s*'';/m, 'RENDER_KEY must ship blank'],
  [/^const DISCORD_CHANNEL_ID\s*=\s*'';/m, 'DISCORD_CHANNEL_ID must ship blank'],
  [/^const SHEET_ID\s*=\s*'';/m, 'SHEET_ID must ship blank (the demo path)'],
  [/^const STATS_ENABLED\s*=\s*false;/m, 'STATS_ENABLED must ship false']
]) check(re.test(cfgSrc), 'config.js: ' + msg);

// both workflows carry the same config, in each pair
for (const [a, b] of [[FILES[0], FILES[2]], [FILES[1], FILES[3]]]) {
  if (!loaded[a] || !loaded[b]) continue;
  const ca = loaded[a].nodes.find((n) => n.name === 'config');
  const cb = loaded[b].nodes.find((n) => n.name === 'config');
  check(ca && cb && ca.parameters.jsCode === cb.parameters.jsCode, a + ' and ' + b + ' carry different config nodes');
}

// the publish call never retries; the token is read before it
for (const f of [FILES[2], FILES[3]]) {
  const wf = loaded[f];
  if (!wf) continue;
  const pub = wf.nodes.find((n) => n.name === '[cred] LinkedIn - publish the post');
  check(pub && !pub.retryOnFail, f + ': the LinkedIn publish node must not retry');
  const reg = wf.nodes.find((n) => n.name === '[cred] LinkedIn - register the upload');
  check(reg && reg.parameters.options.response.response.neverError, f + ': register the upload must use neverError so a dead token is alerted');
}

console.log(notes.join('\n'));
if (problems.length) {
  console.log('\n' + problems.length + ' problem(s):');
  problems.forEach((p) => console.log('  - ' + p));
  process.exit(1);
}
console.log('\nvalidate: ok');
