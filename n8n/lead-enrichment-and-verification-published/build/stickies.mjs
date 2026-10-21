// Writes the sticky notes of both workflow files from one source, so the working file and the
// -publish.json can never disagree about them. n8n Creator Hub sticky rules:
//   - one yellow overview sticky to the left of the flow (### How it works, ### Setup)
//   - one white section sticky per group ("## N. Name" + under 50 words), sized to sit behind its nodes
//   - no sticky overlaps another, every node sits inside exactly one section
/// House rules: GUIDELINES §10.2; tools/restyle_stickies.mjs --check passes on the output./n// Groups are listed by node id, so they survive renames and either file's layout.
//
// Run:   bun stickies.mjs              rewrite the stickies of both files
//        bun stickies.mjs <file.json>  just that file (build.py calls this after writing)
//        bun stickies.mjs --check      validate only, write nothing
import fs from 'fs';
import path from 'path';

import { fileURLToPath } from 'url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEV = path.join(HERE, '..', '01-enrich-and-verify.json');
const PUBLISH = path.join(HERE, '..', '01-enrich-and-verify-publish.json');
// The job post link lives in build.py; validate.py expects it on the working file's canvas.
const JOB_URL = (fs.readFileSync(path.join(HERE, 'build.py'), 'utf8').match(/^JOB_URL = '([^']+)'/m) || [])[1];

const TITLE = 'Enrich and verify partnership leads from Google Sheets into Instantly';

const OVERVIEW = `## ${TITLE}

For outreach teams who need a verified decision maker at each organisation on a raw list.

### How it works
1. Every weekday at 07:00 it reads a batch of new rows from the Organisations tab.
2. Keyword rules give each organisation a category. An optional AI call classifies the rest.
3. Apollo finds decision makers at each organisation. Each contact is scored against your ICP.
4. Every address goes to an email verifier. Anything not clearly valid is held back, never sent.
5. Both sheet tabs are updated, safe contacts go to an Instantly campaign, and a summary is posted.

### Setup
1. Create a Google Sheet with an \`Organisations\` tab and a \`Contacts\` tab. Row 1 headings must match \`ORG_COLUMNS\` and \`CONTACT_COLUMNS\` in the \`config\` node.
2. Add a Google Sheets credential to the four \`[cred] Sheets\` nodes.
3. In \`config\`, set \`SHEET_ID\` (the long id in the sheet URL).
4. In \`config\`, add \`APOLLO_API_KEY\`, \`VERIFIER_API_KEY\`, \`INSTANTLY_API_KEY\` and \`INSTANTLY_CAMPAIGN_ID\`. Optional: \`AI_API_KEY\` and \`ALERT_WEBHOOK_URL\`.
5. Run once with \`TEST_RUN = true\` and read the list in \`STOP: not pushed\`. Set \`TEST_RUN = false\` to go live.

### Requirements
- A Google account for Sheets
- Apollo, MillionVerifier and Instantly API keys
- Optional: an Anthropic API key and a Slack incoming webhook
- A blank key skips that step instead of failing the run

### Customization tips
- Batch size, categories, title rules and accepted verifier statuses are in \`config\`.
- To use another verifier or Smartlead, change its URL in \`config\` and the body of the matching HTTP node.`;

const SECTIONS = [
  { title: 'Trigger and settings',
    text: 'Runs every weekday at 07:00, or when you click Run. Every setting and API key is in the `config` node.',
    ids: ['manual', 'sched', 'cfg'] },
  { title: 'Pick a batch',
    text: 'Reads the Organisations tab (Google Sheets credential), takes up to `BATCH_SIZE` rows not enriched recently and cleans each name and domain. `STOP: nothing to enrich` means no row was ready.',
    ids: ['read-raw', 'batch', 'has-work', 'stop-empty', 'normalise'] },
  { title: 'Classify the organisation',
    text: 'Keyword rules set the category. Rows they cannot place go to the AI call when `AI_API_KEY` is set. `STOP: keyword rules only` is the normal path otherwise.',
    ids: ['need-ai', 'ai', 'ai-apply', 'stop-no-ai', 'merge-orgs'] },
  { title: 'Find and score decision makers',
    text: 'Apollo searches each organisation for people in the target roles, then each contact gets an ICP score. With no Apollo key, `STOP: Apollo not configured` uses contacts already on the row.',
    ids: ['apollo-on', 'apollo', 'apollo-read', 'stop-no-apollo', 'merge-contacts', 'score'] },
  { title: 'Verify every address',
    text: 'Each email is checked with the verifier. This fails closed: timeouts, unknown and catch-all results are held back. `STOP: unverified - held back` collects addresses that could not be checked.',
    ids: ['verify-on', 'verify', 'verify-apply', 'stop-unverified', 'merge-verdicts', 'decide'] },
  { title: 'Write to the sheet',
    text: 'Updates the Organisations tab, then writes every contact to the Contacts tab, held ones with the reason. Rows match on an id column, so re-runs update instead of duplicating.',
    ids: ['org-rows', 'write-orgs', 'any-contacts', 'stop-no-contacts', 'contact-rows', 'write-contacts'] },
  { title: 'Push to Instantly',
    text: 'Safe contacts are added to the campaign and marked pushed in the sheet. With `TEST_RUN = true` and no `TEST_CAMPAIGN_ID` nothing is pushed: review the list in `STOP: not pushed`.',
    ids: ['pushing', 'payload', 'instantly', 'pushed', 'mark-pushed', 'stop-not-pushed'] },
  { title: 'Report the run',
    text: 'Counts what was enriched, verified, held and pushed, and posts it to a Slack webhook. A blank `ALERT_WEBHOOK_URL` ends at `STOP: no alert webhook`.',
    ids: ['summary', 'alert-on', 'alert', 'no-alert', 'end'] },
];

const NODE = 100, PAD_X = 40, PAD_BOTTOM = 40, MAIN_W = 620, MAIN_GAP = 80, MIN_W = 300;
const STICKY = 'n8n-nodes-base.stickyNote';
const words = (md) => md.replace(/[#*`>_\[\]()|-]/g, ' ').split(/\s+/).filter(Boolean).length;
const r20 = (v) => Math.ceil(v / 20) * 20;

// Conservative rendered height of sticky markdown (same estimate as the library's annotate.ts).
function textHeight(content, width) {
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
const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const inside = (n, b) => n.x >= b.x && n.y >= b.y && n.x + n.w <= b.x + b.w && n.y + n.h <= b.y + b.h;

function apply(file, { dev, write }) {
  const raw = fs.readFileSync(file, 'utf8');
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  const wf = JSON.parse(raw);
  const errors = [];
  const flow = wf.nodes.filter((n) => n.type !== STICKY);
  const byId = Object.fromEntries(flow.map((n) => [n.id, n]));

  // every node in exactly one section, every section id real
  const owner = {};
  SECTIONS.forEach((s, i) => s.ids.forEach((id) => {
    if (!byId[id]) errors.push(`section ${i + 1} names unknown node id "${id}"`);
    if (id in owner) errors.push(`node id "${id}" is in two sections`);
    owner[id] = i;
  }));
  for (const n of flow) if (!(n.id in owner)) errors.push(`node "${n.name}" is in no section`);

  // every connection resolves
  const names = new Set(flow.map((n) => n.name));
  for (const [src, spec] of Object.entries(wf.connections)) {
    if (!names.has(src)) errors.push(`connection source missing: ${src}`);
    for (const outs of Object.values(spec)) for (const arr of outs) for (const l of arr || [])
      if (!names.has(l.node)) errors.push(`connection target missing: ${src} -> ${l.node}`);
  }
  if (errors.length) return report(file, errors);

  const box = (n) => ({ x: n.position[0], y: n.position[1], w: NODE, h: NODE, name: n.name });
  const content = SECTIONS.map((s, i) => `## ${i + 1}. ${s.title}\n${s.text}`);
  SECTIONS.forEach((s, i) => { if (words(content[i]) >= 50) errors.push(`section ${i + 1} has ${words(content[i])} words`); });

  // one shared top and bottom so the sections read as a single band, nodes inside each
  const spans = SECTIONS.map((s) => {
    const xs = s.ids.map((id) => byId[id].position[0]);
    const x = Math.min(...xs) - PAD_X;
    return { x, w: Math.max(MIN_W, Math.max(...xs) + NODE + PAD_X - x) };
  });
  const header = r20(Math.max(80, ...SECTIONS.map((_, i) => textHeight(content[i], spans[i].w))));
  const ys = flow.map((n) => n.position[1]);
  const top = Math.min(...ys) - header;
  const bottom = Math.max(...ys) + NODE + PAD_BOTTOM;
  const secBoxes = spans.map((s, i) => ({ name: `Section ${i + 1}`, x: s.x, y: top, w: s.w, h: bottom - top }));

  let overview = OVERVIEW;
  if (dev && JOB_URL) overview += `\n\n### Source (working file only)\nJob post: ${JOB_URL}`;
  const mainH = Math.max(r20(textHeight(overview, MAIN_W)), bottom - top);
  const mainBox = { name: 'Overview', x: Math.min(...secBoxes.map((b) => b.x)) - MAIN_GAP - MAIN_W, y: top, w: MAIN_W, h: mainH };
  const mw = words(OVERVIEW);
  if (mw < 100 || mw > 300) errors.push(`overview has ${mw} words; keep 100-300`);

  // geometry checks
  const all = [mainBox, ...secBoxes];
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++)
    if (overlap(all[i], all[j])) errors.push(`${all[i].name} overlaps ${all[j].name}`);
  for (const n of flow) {
    const b = box(n), own = secBoxes[owner[n.id]];
    if (!inside(b, own) || b.y < own.y + header) errors.push(`"${n.name}" is not fully inside ${own.name} below its heading`);
    secBoxes.forEach((s, i) => { if (i !== owner[n.id] && overlap(b, s)) errors.push(`"${n.name}" overlaps ${s.name}`); });
    if (overlap(b, mainBox)) errors.push(`"${n.name}" overlaps the overview`);
    for (const m of flow) if (m !== n && overlap(b, box(m))) errors.push(`"${n.name}" overlaps "${m.name}"`);
  }
  if (errors.length) return report(file, errors);

  const sticky = (id, name, b, text, color) => ({
    parameters: { content: text, height: b.h, width: b.w, color },
    id, name, type: STICKY, typeVersion: 1, position: [b.x, b.y],
  });
  const stickies = [
    sticky('sticky-00', 'Overview', mainBox, overview, 1),
    ...secBoxes.map((b, i) => sticky('sticky-0' + (i + 1), `${i + 1}. ${SECTIONS[i].title}`, b, content[i], 7)),
  ];
  console.log(`ok   ${path.basename(file)}: overview ${mw} words, ${SECTIONS.length} sections ` +
    `(${content.map((c, i) => words(c) + 'w/' + SECTIONS[i].ids.length + 'n').join(', ')}), header ${header}px`);
  if (!write) return true;
  wf.nodes = [...flow, ...stickies];
  fs.writeFileSync(file, (JSON.stringify(wf, null, 2) + '\n').replace(/\n/g, eol));
  return true;
}

function report(file, errors) {
  console.log(`FAIL ${path.basename(file)}\n  - ` + [...new Set(errors)].join('\n  - '));
  return false;
}

const args = process.argv.slice(2);
const check = args.includes('--check');
const files = args.filter((a) => !a.startsWith('--')).map((f) => path.resolve(f));
const targets = files.length ? files : [DEV, PUBLISH];
let ok = true;
for (const f of targets) {
  const dev = path.resolve(f) === path.resolve(DEV);
  ok = apply(f, { dev, write: !check }) && ok;
}
if (!ok) process.exit(1);
