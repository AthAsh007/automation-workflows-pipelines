// Lays out the two -publish.json files and writes their sticky notes.
// Run: bun build/stickies.ts            (rewrite both -publish.json files, then validate)
//      bun build/stickies.ts --check    (validate only, write nothing)
//
// build.py writes the working files (01-pitch-and-send.json, 02-replies-and-reporting.json).
// The -publish.json files are the submission copies. This script is the source of their
// canvas: it only moves nodes and replaces sticky notes. Node names, parameters and
// connections are never touched, and the run fails if any of them differ afterwards.
//
// Layout: one yellow overview sticky to the left of the flow, then one white section sticky
// per group, laid out as columns left to right. Each group places its nodes on a grid
// (col, row) inside its own sticky, so nodes sit inside exactly one section by construction.
// Geometry follows library/_kit/annotate.ts (node box 100x100, header sized to the text).
import fs from 'fs';
import path from 'path';

const HERE = import.meta.dir;
const OUT = path.join(HERE, '..');
const CHECK = process.argv.includes('--check');

const NODE = 100;         // n8n node box
const COL = 220;          // column pitch inside a group
const ROW = 200;          // row pitch (node + its label underneath)
const PAD_X = 60;         // sticky side padding
const PAD_BOTTOM = 90;    // room for the last row's labels
const MIN_HEADER = 80;    // header room above the first node row
const GROUP_GAP = 60;     // clear space between two section stickies
const BAND_GAP = 100;     // clear space between the upper and the lower band
const MIN_W = 340;
const MAIN_W = 560;
const MAIN_GAP = 80;
const SNAP = 20;
const snap = (v: number) => Math.round(v / SNAP) * SNAP;

type Group = { title: string; text: string; nodes: Record<string, [number, number]> };
type Band = { groups: Group[]; alignTo?: number }; // alignTo: start under that group of band 0
type Spec = { file: string; overview: string; bands: Band[] };

// ------------------------------------------------------------------ 01 PITCH AND SEND
const PITCH: Spec = {
  file: '01-pitch-and-send-publish.json',
  overview: `## Send personalised brand deal pitches from Airtable with Instantly

For agencies and talent managers who pitch brands for creators at volume and need every pitch checked before it goes out.

### How it works
1. A weekday schedule loads creators, brands, inboxes and the pitch log from Airtable.
2. Each creator is matched to brands in their niche and budget.
3. Facts are built in code. An AI model writes the pitch from those facts only.
4. An audit holds pitches that are thin, templated or quote numbers not in the records.
5. Only inboxes proven healthy can send. Pitches go to an Instantly campaign.
6. Every pitch, sent or held, is logged to Airtable. A summary is posted to Slack.

### Setup
1. Open \`config\` and set \`AIRTABLE_API_KEY\` and \`AIRTABLE_BASE_ID\`.
2. In \`config\`, set \`AI_API_KEY\` (Anthropic) for \`AI - write the pitch\`.
3. In \`config\`, set \`SEND_API_KEY\` and \`CAMPAIGN_ID\` (Instantly).
4. In \`config\`, set \`ALERT_WEBHOOK_URL\` to a Slack incoming webhook.
5. Keep \`TEST_RUN = true\` for the first run and open \`STOP: not sent\`. Then set it to false.

### Requirements
- Airtable base with Students, Brands, Inboxes and Pitches tables
- Instantly, Anthropic and Slack (each optional: a blank key skips that step)

### How to customize
- Gate strictness: \`MIN_FACTS\`, \`BANNED_PHRASES\`, \`MIN_WORDS\` and \`MAX_WORDS\`.
- Volume and inbox health: \`PITCHES_PER_STUDENT_PER_DAY\` and \`MIN_WARMUP_DAYS\`.`,
  bands: [{
    groups: [
      { title: 'Trigger and config',
        text: '`Run it now` is for tests. The weekday schedule runs production. `config` is the only node you edit.',
        nodes: { 'Run it now': [0, 0], 'Every weekday, 08:00': [0, 1], 'config': [1, 0] } },
      { title: 'Load the roster',
        text: 'The `[cred]` nodes read four Airtable tables with the key in `config`. No key: `STOP: demo roster` builds demo data that can never be emailed.',
        nodes: { 'Airtable configured?': [0, 0], '[cred] Airtable - students': [1, 0],
          '[cred] Airtable - brand targets': [2, 0], '[cred] Airtable - inboxes': [3, 0],
          '[cred] Airtable - the pitch log': [4, 0], 'read the roster': [5, 0],
          'STOP: demo roster': [1, 1], 'one roster': [6, 0] } },
      { title: 'Match brands to creators',
        text: 'Pairs creators with brands in their niche and budget. `STOP: nothing to pitch` reports which filter removed the volume.',
        nodes: { 'match brands to students': [0, 0], 'anything to pitch?': [1, 0],
          'STOP: nothing to pitch': [2, 1] } },
      { title: 'Write the pitch',
        text: 'Facts are built in code. `AI - write the pitch` needs `AI_API_KEY`. `STOP: no writer` keeps the draft for a person to finish.',
        nodes: { 'build the pitch': [0, 0], 'writer configured?': [1, 0],
          'AI - write the pitch': [2, 0], 'apply the written pitch': [3, 0],
          'STOP: no writer': [2, 1], 'one list of pitches': [4, 0] } },
      { title: 'Gate each pitch',
        text: '`audit the pitch` holds weak copy. `assign a healthy inbox` fails closed on warmup, bounces, spam and caps.',
        nodes: { 'audit the pitch': [0, 0], 'assign a healthy inbox': [1, 0],
          'sending this one?': [2, 0] } },
      { title: 'Send through Instantly',
        text: 'The `[cred] Instantly` node needs `SEND_API_KEY`. `STOP: not sent` lists every held or preview pitch with its reason.',
        nodes: { 'payload for the campaign': [0, 0], '[cred] Instantly - add to the campaign': [1, 0],
          'record what was sent': [2, 0], 'STOP: not sent': [0, 1], 'what happened': [3, 0] } },
      { title: 'Log every pitch',
        text: 'Sent and held pitches are written to Airtable. `confirm the log` flags gaps. `STOP: not logged` means logging is off.',
        nodes: { 'logging the pitches?': [0, 0], 'rows for the pitch log': [1, 0],
          '[cred] Airtable - log the pitches': [2, 0], 'confirm the log': [3, 0],
          'STOP: not logged': [1, 1], 'logged': [4, 0] } },
      { title: 'Report the run',
        text: 'Posts the run summary to Slack. `STOP: no alert webhook` means no URL is set.',
        nodes: { 'build the run summary': [0, 0], 'alert configured?': [1, 0],
          'Post the run summary': [2, 0], 'STOP: no alert webhook': [2, 1], 'End': [3, 0] } },
    ],
  }],
};

// ---------------------------------------------------------- 02 REPLIES AND REPORTING
const REPLIES: Spec = {
  file: '02-replies-and-reporting-publish.json',
  overview: `## Classify outreach replies and report weekly from Airtable to Slack

For agencies running cold email at volume who need replies triaged every hour and a clean weekly number.

### How it works
1. An hourly schedule reads new replies from Instantly.
2. Each reply is sorted by ordered rules. The first match wins.
3. A reply that matches no rule is marked unclear and sent to a person.
4. Outcomes are written back to the Airtable pitch log.
5. Interested replies go to Slack as a handover. A short digest follows.
6. Once a week, the lower row posts a report per creator.

### Setup
1. Open \`config\` and set \`AIRTABLE_API_KEY\` and \`AIRTABLE_BASE_ID\`.
2. In \`config\`, set \`SEND_API_KEY\` for \`[cred] Instantly - fetch replies\`.
3. In \`config\`, set \`ALERT_WEBHOOK_URL\` (and optionally \`HANDOVER_WEBHOOK_URL\`).
4. Set \`REPORT_DAY\` and \`REPORT_HOUR\` for the weekly post.
5. Press **Run it now**. With blank keys it uses demo data and writes nothing.

### Requirements
- Airtable base with a Pitches table
- Instantly account and a Slack incoming webhook (each optional)

### How to customize
- Edit \`REPLY_RULES\` in \`config\`. Order is priority.
- \`REPORT_WINDOW_DAYS\` sets the report window.`,
  bands: [
    { groups: [
      { title: 'Trigger and config',
        text: 'One hourly trigger drives both rows. `config` is the only node you edit.',
        nodes: { 'Run it now': [0, 0], 'Every hour': [0, 1], 'config': [1, 0] } },
      { title: 'Read the replies',
        text: 'The `[cred] Instantly` node needs `SEND_API_KEY`. No key: `STOP: demo replies` builds a test batch.',
        nodes: { 'reply feed configured?': [0, 0], '[cred] Instantly - fetch replies': [1, 0],
          'read the replies': [2, 0], 'STOP: demo replies': [1, 1], 'one reply list': [3, 0] } },
      { title: 'Classify the replies',
        text: 'Ordered rules, first match wins. No match means unclear, sent to a person. `STOP: no replies` is a quiet hour.',
        nodes: { 'classify the replies': [0, 0], 'any replies?': [1, 0],
          'decide the next step': [2, 0], 'STOP: no replies': [2, 1] } },
      { title: 'Write outcomes back',
        text: 'The `[cred] Airtable` node upserts on Pitch id. `STOP: replies not logged` means Airtable is off, so suppressions are reported.',
        nodes: { 'logging the replies?': [0, 0], 'rows for the reply log': [1, 0],
          '[cred] Airtable - log the replies': [2, 0], 'confirm the reply log': [3, 0],
          'STOP: replies not logged': [1, 1], 'reply outcomes': [4, 0] } },
      { title: 'Hand over and post the digest',
        text: 'Interested replies go out as their own handover message. The digest follows. A STOP here means that webhook is blank.',
        nodes: { 'build the reply summary': [0, 1], 'handovers to send?': [1, 0],
          'build the handover': [2, 0], 'Post the handover': [3, 0],
          'STOP: nothing to hand over': [2, 1], 'alert configured?': [1, 2],
          'Post the reply summary': [2, 2], 'STOP: no alert webhook': [2, 3],
          'Run complete': [4, 1] } },
    ] },
    { alignTo: 1, groups: [
      { title: 'Wait for the report hour',
        text: 'True one hour a week, set by `REPORT_DAY` and `REPORT_HOUR`. `STOP: not the report hour` is every other hour.',
        nodes: { 'is it the weekly report hour?': [0, 0], 'STOP: not the report hour': [1, 1] } },
      { title: 'Read the pitch log',
        text: 'The `[cred] Airtable` node reads the week. No key: `STOP: demo pitch log` builds a sample week.',
        nodes: { 'pitch log available?': [0, 0], '[cred] Airtable - the pitch log': [1, 0],
          'read the pitch log': [2, 0], 'STOP: demo pitch log': [1, 1], 'one pitch log': [3, 0] } },
      { title: 'Post the weekly report',
        text: 'Sent, held, reply rate and bookings per creator. `STOP: no report webhook` means no URL is set.',
        nodes: { 'build the weekly report': [0, 0], 'posting the report?': [1, 0],
          'Post the weekly report': [2, 0], 'STOP: no report webhook': [2, 1] } },
    ] },
  ],
};

// ------------------------------------------------------------------------- geometry
/** Conservative rendered-markdown height (library/_kit/annotate.ts). */
function textHeight(content: string, width: number): number {
  const cpl = Math.max(16, Math.floor((width - 32) / 7.6));
  let h = 28;
  for (const raw of content.split('\n')) {
    const line = raw.replace(/\*\*|`/g, '');
    if (line.startsWith('## ')) h += Math.ceil(line.length / (cpl * 0.62)) * 36;
    else if (line.startsWith('### ')) h += Math.ceil(line.length / (cpl * 0.75)) * 30;
    else if (line.trim() === '') h += 12;
    else h += Math.ceil(line.length / cpl) * 22;
  }
  return h + 28;
}

const words = (md: string) => md.replace(/[#*`>_\[\]()]/g, ' ').split(/\s+/).filter(Boolean).length;

function stickyId(seed: string, i: number) {
  let h = 2166136261; const s = seed + ':' + i;
  for (let k = 0; k < s.length; k++) { h ^= s.charCodeAt(k); h = Math.imul(h, 16777619); }
  const a = (h >>> 0).toString(16).padStart(8, '0');
  return `${a}-5717-4c4e-9a00-${a}${(i + 4096).toString(16).padStart(4, '0')}`;
}

type Box = { name: string; x: number; y: number; w: number; h: number };

function layout(spec: Spec, wf: any) {
  const byName: Record<string, any> = Object.fromEntries(
    wf.nodes.filter((n: any) => n.type !== 'n8n-nodes-base.stickyNote').map((n: any) => [n.name, n]));
  const stickies: any[] = [];
  const boxes: Box[] = [];
  let num = 0;
  let bandTop = 0;
  const band0X: number[] = [];

  spec.bands.forEach((band, bi) => {
    const sized = band.groups.map(g => {
      const cells = Object.values(g.nodes);
      const cols = Math.max(...cells.map(c => c[0])) + 1;
      const rows = Math.max(...cells.map(c => c[1])) + 1;
      const span = (cols - 1) * COL + NODE;
      const w = snap(Math.max(MIN_W, span + 2 * PAD_X));
      return { g, cols, rows, span, w, text: '' };
    });
    sized.forEach(s => { s.text = `## ${++num}. ${s.g.title}\n${s.g.text}`; });
    const header = snap(Math.max(MIN_HEADER, ...sized.map(s => textHeight(s.text, s.w))) + 10);
    let x = bi === 0 ? 0 : band0X[band.alignTo ?? 0];
    let bottom = bandTop;
    for (const s of sized) {
      const inner = (s.w - s.span) / 2;
      for (const [name, [c, r]] of Object.entries(s.g.nodes)) {
        if (!byName[name]) throw new Error(`${spec.file}: unknown node "${name}"`);
        byName[name].position = [snap(x + inner + c * COL), snap(bandTop + header + r * ROW)];
      }
      const h = snap(header + (s.rows - 1) * ROW + NODE + PAD_BOTTOM);
      if (bi === 0) band0X.push(x);
      const box = { name: `Section ${num - sized.length + sized.indexOf(s) + 1}`, x, y: bandTop, w: s.w, h };
      boxes.push(box);
      stickies.push({
        parameters: { content: s.text, height: box.h, width: box.w, color: 7 },
        type: 'n8n-nodes-base.stickyNote', typeVersion: 1, position: [box.x, box.y],
        id: stickyId(wf.name, stickies.length + 1), name: box.name,
      });
      bottom = Math.max(bottom, bandTop + h);
      x += s.w + GROUP_GAP;
    }
    bandTop = snap(bottom + BAND_GAP);
  });

  const mainH = snap(textHeight(spec.overview, MAIN_W) + 20);
  const main = { name: 'Overview', x: -(MAIN_W + MAIN_GAP), y: 0, w: MAIN_W, h: mainH };
  stickies.unshift({
    parameters: { content: spec.overview, height: main.h, width: main.w, color: 1 },
    type: 'n8n-nodes-base.stickyNote', typeVersion: 1, position: [main.x, main.y],
    id: stickyId(wf.name, 0), name: 'Overview',
  });

  wf.nodes = [...stickies, ...wf.nodes.filter((n: any) => n.type !== 'n8n-nodes-base.stickyNote')];
  return wf;
}

// ----------------------------------------------------------------------- validation
function validate(spec: Spec, wf: any, before: any): string[] {
  const errs: string[] = [];
  const stickies = wf.nodes.filter((n: any) => n.type === 'n8n-nodes-base.stickyNote');
  const nodes = wf.nodes.filter((n: any) => n.type !== 'n8n-nodes-base.stickyNote');
  const names = new Set(nodes.map((n: any) => n.name));
  if (names.size !== nodes.length) errs.push('duplicate node names');

  // connections resolve
  for (const [src, outs] of Object.entries(wf.connections || {})) {
    if (!names.has(src)) errs.push(`connection from unknown node "${src}"`);
    for (const arr of Object.values(outs as any)) for (const branch of arr as any[])
      for (const l of branch || []) if (!names.has(l.node)) errs.push(`"${src}" -> unknown "${l.node}"`);
  }

  // nothing but positions and stickies changed
  if (before) {
    const strip = (w: any) => JSON.stringify({
      ...w, nodes: w.nodes.filter((n: any) => n.type !== 'n8n-nodes-base.stickyNote')
        .map((n: any) => ({ ...n, position: null })),
    });
    if (strip(before) !== strip(wf)) errs.push('a node, connection or setting changed (only positions may)');
  }

  // stickies: colours, words, headings, no overlap
  const box = (s: any): Box => ({ name: s.name, x: s.position[0], y: s.position[1], w: s.parameters.width, h: s.parameters.height });
  const overlap = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const main = stickies.filter((s: any) => (s.parameters.color ?? 1) === 1);
  if (main.length !== 1) errs.push(`${main.length} yellow overview stickies, want 1`);
  const sections = stickies.filter((s: any) => s.parameters.color === 7);
  if (sections.length + main.length !== stickies.length) errs.push('sticky with an unexpected colour');
  for (const m of main) {
    const t = m.parameters.content, wc = words(t);
    if (wc < 100 || wc > 300) errs.push(`overview has ${wc} words (100-300)`);
    for (const h of ['## ', '### How it works', '### Setup', '### Requirements', '### How to customize'])
      if (!t.includes(h)) errs.push(`overview missing "${h}"`);
    if (textHeight(t, m.parameters.width) > m.parameters.height + 1) errs.push('overview text taller than its sticky');
  }
  for (const s of sections) {
    const wc = words(s.parameters.content);
    if (wc >= 50) errs.push(`${s.name}: ${wc} words (under 50)`);
    if (!/^## \d+\. /.test(s.parameters.content)) errs.push(`${s.name}: must start with "## N. "`);
  }
  for (const s of stickies) {
    if (/@|https?:\/\//.test(s.parameters.content)) errs.push(`${s.name}: contains an email or URL`);
  }
  const all = stickies.map(box);
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++)
    if (overlap(all[i], all[j])) errs.push(`${all[i].name} overlaps ${all[j].name}`);

  // every node fully inside exactly one section, below its header text
  const secBoxes = sections.map((s: any) => ({ ...box(s), head: textHeight(s.parameters.content, s.parameters.width) }));
  const count: Record<string, number> = {};
  for (const n of nodes) {
    const [x, y] = n.position;
    const inside = secBoxes.filter(b => x >= b.x && x + NODE <= b.x + b.w && y >= b.y && y + NODE + 40 <= b.y + b.h);
    if (inside.length !== 1) { errs.push(`"${n.name}" is inside ${inside.length} sections`); continue; }
    if (y < inside[0].y + Math.max(MIN_HEADER, inside[0].head)) errs.push(`"${n.name}" sits under the header text of ${inside[0].name}`);
    count[inside[0].name] = (count[inside[0].name] || 0) + 1;
    for (const o of all.filter(b => b.name === 'Overview')) if (overlap(o, { name: n.name, x, y, w: NODE, h: NODE })) errs.push(`"${n.name}" under the overview`);
  }
  for (const s of sections) if ((count[s.name] || 0) < 2) errs.push(`${s.name} covers ${count[s.name] || 0} node(s), want 2+`);

  // no two nodes on the same spot
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
    const a = nodes[i].position, b = nodes[j].position;
    if (Math.abs(a[0] - b[0]) < NODE + 20 && Math.abs(a[1] - b[1]) < NODE + 20) errs.push(`"${nodes[i].name}" overlaps "${nodes[j].name}"`);
  }
  return errs;
}

let failed = false;
for (const spec of [PITCH, REPLIES]) {
  const file = path.join(OUT, spec.file);
  const text = fs.readFileSync(file, 'utf8');
  const before = JSON.parse(text);
  let wf = JSON.parse(text);
  if (!CHECK) {
    // every node must be placed by the spec
    const placed = new Set(spec.bands.flatMap(b => b.groups.flatMap(g => Object.keys(g.nodes))));
    const missing = wf.nodes.filter((n: any) => n.type !== 'n8n-nodes-base.stickyNote' && !placed.has(n.name)).map((n: any) => n.name);
    if (missing.length) throw new Error(`${spec.file}: nodes in no group: ${missing.join(', ')}`);
    wf = layout(spec, wf);
  }
  const errs = validate(spec, wf, CHECK ? null : before);
  const secs = wf.nodes.filter((n: any) => n.type === 'n8n-nodes-base.stickyNote' && n.parameters.color === 7).length;
  if (errs.length) { failed = true; console.log(`FAIL ${spec.file}\n  - ` + errs.join('\n  - ')); continue; }
  if (!CHECK) fs.writeFileSync(file, JSON.stringify(wf, null, 2) + '\n');
  console.log(`ok   ${spec.file}: overview + ${secs} sections, ${wf.nodes.length - secs - 1} nodes${CHECK ? ' (checked)' : ' (written)'}`);
}
if (failed) process.exit(1);
