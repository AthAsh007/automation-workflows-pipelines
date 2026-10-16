// Build library templates from _specs/*.ts.
//
//   bun _kit/build.ts                 build every spec
//   bun _kit/build.ts invoice slack   build specs whose file name contains any of the words
//   bun _kit/build.ts --index         rebuild library/README.md only
//
// For each spec: assemble -> annotate (layout + stickies) -> lint -> simulate
// every scenario. Files are written only when all of that passes:
//   <slug>-can-publish/<slug>-publish.json
//   <slug>-can-publish/SUBMISSION-<slug>.md
//   <slug>-can-publish/README.md

import { Glob } from 'bun';
import { mkdirSync, rmSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { configNode, uid, type N8nNode } from './n';
import type { Spec } from './spec';
import { annotate } from './annotate';
import { lint } from './lint';
import { simulate } from './simulate';

const LIB = join(dirname(import.meta.path), '..');
const SPECS = join(LIB, '_specs');

export function overview(s: Spec) {
  const d = s.description;
  return [
    `## ${s.title}`, '',
    "**Who's it for**", d.who, '',
    '**How it works**', ...d.how.map((x, i) => `${i + 1}. ${x}`), '',
    '**How to set up**', ...d.setup.map((x, i) => `${i + 1}. ${x}`), '',
    '**Requirements**', ...d.requirements.map(x => `- ${x}`), '',
    '**How to customize**', ...d.customize.map(x => `- ${x}`),
  ].join('\n');
}

export function assemble(s: Spec, cfgOverrides: Record<string, any> = {}) {
  const cfg = configNode({ title: s.title, ...s.config }, cfgOverrides);
  const list: N8nNode[] = [cfg, ...s.nodes.flat()];
  const seen = new Set<string>();
  for (const n of list) { if (seen.has(n.name)) throw new Error(`duplicate node name "${n.name}"`); seen.add(n.name); }
  const outward = new Set(list.filter(n => n._outward).map(n => n.name));
  const service = new Set(list.filter(n => n._service).map(n => n.name));
  const connections: Record<string, any> = {};
  for (const e of s.edges) {
    let from: string, bi = 0, to: string, kind = 'main', ti = 0;
    if (e.length === 2) [from, to] = e as [string, string];
    else if (e.length === 3 && typeof e[1] === 'number') [from, bi, to] = e as [string, number, string];
    else if (e.length === 3) { [from, to, kind] = e as [string, string, string]; }
    else [from, bi, to, ti] = e as [string, number, string, number];
    if (!seen.has(from)) throw new Error(`edge from unknown node "${from}"`);
    if (!seen.has(to)) throw new Error(`edge to unknown node "${to}"`);
    const slot = ((connections[from] ||= {})[kind] ||= []);
    while (slot.length <= bi) slot.push([]);
    slot[bi].push({ node: to, type: kind, index: ti });
  }
  const nodes = list.map(n => {
    const { _outward, _service, _sub, ...rest } = n;
    return { id: uid(`${s.slug}:${n.name}`), ...rest, position: [0, 0] };
  });
  const wf = { name: s.title, nodes, connections, pinData: {}, settings: { executionOrder: 'v1' }, meta: { templateCredsSetupCompleted: true }, tags: [] as string[] };
  return { wf, outward, service };
}

export async function buildOne(s: Spec, write = true) {
  const problems: string[] = [];
  const { wf, outward, service } = assemble(s);
  annotate(wf, s.groups, overview(s));
  const raw = JSON.stringify(wf, null, 2);
  const L = lint(raw);
  problems.push(...L.errors.map(x => `lint: ${x}`));

  // copy length checks on the spec text
  const words = overview(s).split(/\s+/).length;
  if (words < 150 || words > 420) problems.push(`description is ${words} words (150-420)`);
  for (const g of s.groups) { const w = g.why.split(/\s+/).length; if (w < 12 || w > 80) problems.push(`section "${g.title}" note is ${w} words (12-80)`); }

  const results: { name: string; ran: number; outward: string[]; ends: string[] }[] = [];
  if (!s.scenarios.length) problems.push('no scenarios');
  for (const [i, sc] of s.scenarios.entries()) {
    if (i === 0 && sc.overrides && Object.keys(sc.overrides).length) problems.push('first scenario must use the shipped config (no overrides)');
    const override = sc.overrides ? () => configNode({ title: s.title, ...s.config }, sc.overrides).parameters.jsCode : undefined;
    const r = await simulate(wf, sc, { outward, service }, override);
    problems.push(...r.failures);
    if (i === 0) {
      if (r.outwardRan.length) problems.push(`shipped config ran outward node(s): ${r.outwardRan.join(', ')}`);
      if (r.serviceRan.length) problems.push(`shipped config ran credentialed node(s): ${r.serviceRan.join(', ')}`);
      if (r.ran.length < 4) problems.push(`shipped config run only reached ${r.ran.length} nodes`);
    }
    const ends = r.ran.filter(n => !(wf.connections as any)[n]?.main?.some((a: any[]) => a?.length));
    results.push({ name: sc.name, ran: r.ran.length, outward: r.outwardRan, ends });
  }
  if (!results.some(r => r.outward.length)) problems.push('no scenario exercises an outward node (the live path is untested)');

  const dir = join(LIB, `${s.slug}-can-publish`);
  if (write && !problems.length) {
    mkdirSync(dir, { recursive: true });
    await Bun.write(join(dir, `${s.slug}-publish.json`), raw + '\n');
    const body = overview(s).split('\n').slice(1).join('\n').trim();
    await Bun.write(join(dir, `SUBMISSION-${s.slug}.md`), `# ${s.title}\n\n${body}\n`);
    await Bun.write(join(dir, 'README.md'), readme(s, wf, service, results));
  }
  return { problems, warnings: L.warnings, results, nodes: wf.nodes.length };
}

function readme(s: Spec, wf: any, service: Set<string>, results: any[]) {
  const d = s.description;
  const cfg = [...s.config.consts, ...(s.config.safety === 'test_run'
    ? [{ name: 'TEST_RUN', value: true, note: 'ships true. Nothing reaches a real recipient or system.' }, { name: 'TEST_EMAIL', value: '', note: 'blank means preview only; set it and sends are redirected there' }]
    : [{ name: 'DRY_RUN', value: true, note: 'ships true. The run computes and reports, and writes nothing.' }])];
  const fmt = (v: any) => typeof v === 'string' ? (v === '' ? "`''`" : `\`'${v.length > 40 ? v.slice(0, 37) + '...' : v}'\``) : `\`${JSON.stringify(v).slice(0, 40)}\``;
  return [
    `# ${s.title}`, '', s.summary, '',
    `Import \`${s.slug}-publish.json\` into n8n. It runs on import with no credentials: the shipped \`config\` takes the built-in sample path and stops on a named \`STOP:\` node before anything is sent or written.`, '',
    "## Who it's for", '', d.who, '',
    '## How it works', '', ...d.how.map((x, i) => `${i + 1}. ${x}`), '',
    '## Sections on the canvas', '', ...s.groups.map((g, i) => `${i + 1}. **${g.title}.** ${g.why}`), '',
    '## Setup', '', ...d.setup.map((x, i) => `${i + 1}. ${x}`), '',
    '## Settings in `config`', '', '| Setting | Ships as | What it does |', '|---|---|---|',
    ...cfg.map(k => `| \`${k.name}\` | ${fmt(k.value)} | ${k.note.replace(/\|/g, '/')} |`), '',
    '## Nodes that need a credential', '',
    ...(service.size ? [...service].map(n => `- \`${n}\``) : ['- none']), '',
    '## Requirements', '', ...d.requirements.map(x => `- ${x}`), '',
    '## Customising', '', ...d.customize.map(x => `- ${x}`), '',
    '## Verified', '',
    'Every scenario below was run by `_kit/simulate.ts`: the real Code-node JavaScript and IF/Switch logic, with service calls replaced by canned responses.', '',
    '| Scenario | Nodes run | Sends or writes | Ends at |', '|---|---|---|---|',
    ...results.map(r => `| ${r.name} | ${r.ran} | ${r.outward.length ? r.outward.map((x: string) => `\`${x}\``).join(', ') : 'none'} | ${r.ends.map((x: string) => `\`${x}\``).join(', ')} |`), '',
  ].join('\n');
}

async function writeIndex() {
  const rows: string[] = [];
  const cats: Record<string, string[]> = {};
  for await (const f of new Glob('*.ts').scan(SPECS)) {
    const s: Spec = (await import(join(SPECS, f))).default;
    const folder = `${s.slug}-can-publish`;
    if (!existsSync(join(LIB, folder))) continue;
    (cats[s.category] ||= []).push(`| [${folder}](${folder}/) | ${s.title} | ${s.summary} |`);
  }
  for (const c of Object.keys(cats).sort()) { rows.push(`### ${c}`, '', '| Folder | Template title | What it does |', '|---|---|---|', ...cats[c].sort(), ''); }
  const total = Object.values(cats).reduce((a, b) => a + b.length, 0);
  const md = [
    '# Template library', '',
    `${total} single-workflow templates built to the n8n template submission rules. Each folder holds the importable \`-publish.json\`, its \`SUBMISSION-*.md\` description page and a README.`, '',
    'Every one follows [`../../docs/CONFIG-NODE.md`](../../docs/CONFIG-NODE.md): one `config` Code node, no `$env`, optional services behind an `*_enabled` gate that lands on a named `STOP:` node, and a `TEST_RUN`/`DRY_RUN` switch that ships in its safe position.', '',
    '## How they are made', '',
    'Nothing here is hand-edited JSON. A template is a spec in [`_specs/`](_specs/) and [`_kit/build.ts`](_kit/build.ts) turns it into files:', '',
    '1. **Assemble.** Builders in [`_kit/n.ts`](_kit/n.ts) emit only parameter shapes copied from workflows that have already been imported into n8n.',
    '2. **Annotate.** [`_kit/annotate.ts`](_kit/annotate.ts) lays the graph out left to right and adds stickies the way n8n\'s own template 13868 (*Auto-generate sticky notes and rename nodes*) does: one section sticky sized around its nodes with room for the heading, and the yellow description sticky to the left of everything. Sections are columns in flow order, so no sticky can overlap a node or another sticky.',
    '3. **Lint.** [`_kit/lint.ts`](_kit/lint.ts) is the submission linter: title shape, descriptive names, the five description headings, no overlaps, no secrets or personal identifiers, no `$env`, plus the copy rules in [`../../docs/SANITIZATION.md`](../../docs/SANITIZATION.md).',
    '4. **Simulate.** [`_kit/simulate.ts`](_kit/simulate.ts) runs each workflow with no n8n and no network: the real Code-node JavaScript and IF/Switch logic, with service calls replaced by canned responses. The shipped config must reach no credentialed node and send nothing; at least one scenario must exercise the live path.', '',
    'A spec that fails any step writes nothing.', '',
    '```bash', 'cd n8n/library', 'bun _kit/build.ts            # build all', 'bun _kit/build.ts invoice    # build specs matching a word', 'bun _kit/lint.ts <file.json> # lint any workflow file', '```', '',
    '## Templates', '', ...rows,
  ].join('\n');
  await Bun.write(join(LIB, 'README.md'), md + '\n');
  console.log(`index: ${total} templates`);
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  if (args.includes('--index')) { await writeIndex(); process.exit(0); }
  const files: string[] = [];
  for await (const f of new Glob('*.ts').scan(SPECS)) if (!args.length || args.some(a => f.includes(a))) files.push(f);
  files.sort();
  let failed = 0;
  for (const f of files) {
    let r;
    try { r = await buildOne((await import(join(SPECS, f))).default); }
    catch (e: any) { r = { problems: [`build threw: ${e.message}`], warnings: [], results: [], nodes: 0 }; }
    if (r.problems.length) { failed++; console.log(`FAIL ${f}`); for (const p of r.problems) console.log(`   - ${p}`); }
    else console.log(`ok   ${f}  (${r.nodes} nodes; ${r.results.map(x => `${x.name}: ${x.ran} run${x.outward.length ? ', ' + x.outward.length + ' outward' : ''}`).join(' | ')})${r.warnings.length ? '  warn: ' + r.warnings.join('; ') : ''}`);
  }
  console.log(`\n${files.length - failed}/${files.length} built`);
  if (!args.length || args.includes('--all')) await writeIndex();
  process.exit(failed ? 1 : 0);
}
