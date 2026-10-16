// Regenerate a -publish.json from an existing working workflow.
//
//   bun _kit/republish.ts <working.json> <republish-spec.json> <out-publish.json> [SUBMISSION.md]
//
// The spec:
// {
//   "title":   "Route inbound leads ... into GoHighLevel",
//   "rename":  { "old node name": "New node name", ... },
//   "remove":  ["End"],                       // pass-through sinks; their incoming edges go too
//   "groups":  [{ "title": "...", "why": "...", "nodes": ["New node name", ...] }, ...],
//   "overview": "## Title\n\n**Who's it for**\n..."   // the yellow sticky, five headings
// }
//
// Renames follow the "Apply Renames" step of n8n template 13868: the node, the
// connections key, every connection target, and every $('X') / $("X") /
// $node["X"] / $items("X") reference inside parameters all move together.
// Then the workflow is laid out and annotated like the library, and linted.

import { annotate } from './annotate';
import { lint } from './lint';

type Spec = { title: string; rename?: Record<string, string>; remove?: string[]; groups: any[]; overview: string };

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function rename(d: any, map: Record<string, string>) {
  const names = new Set(d.nodes.map((n: any) => n.name));
  for (const [o, n] of Object.entries(map)) {
    if (!names.has(o)) throw new Error(`rename: node "${o}" not found`);
    if (names.has(n) && n !== o) throw new Error(`rename: "${n}" already exists`);
  }
  const fix = (v: any): any => {
    if (typeof v === 'string') {
      let s = v;
      for (const [o, n] of Object.entries(map)) {
        s = s.replace(new RegExp(`\\$\\((['"])${esc(o)}\\1\\)`, 'g'), (_m, q) => `$(${q}${n}${q})`)
             .replace(new RegExp(`\\$node\\[(['"])${esc(o)}\\1\\]`, 'g'), (_m, q) => `$node[${q}${n}${q}]`)
             .replace(new RegExp(`\\$items\\((['"])${esc(o)}\\1`, 'g'), (_m, q) => `$items(${q}${n}${q}`);
      }
      return s;
    }
    if (Array.isArray(v)) return v.map(fix);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fix(x)]));
    return v;
  };
  for (const node of d.nodes) {
    if (map[node.name]) node.name = map[node.name];
    if (!node.type.includes('stickyNote')) node.parameters = fix(node.parameters);
  }
  const conns: any = {};
  for (const [src, spec] of Object.entries<any>(d.connections)) {
    for (const outs of Object.values<any>(spec)) for (const arr of outs || []) for (const l of arr || []) if (map[l.node]) l.node = map[l.node];
    conns[map[src] || src] = spec;
  }
  d.connections = conns;
}

export function removeNodes(d: any, names: string[]) {
  const gone = new Set(names);
  for (const n of names) if (!d.nodes.some((x: any) => x.name === n)) throw new Error(`remove: node "${n}" not found`);
  for (const n of names) if (d.connections[n] && Object.values<any>(d.connections[n]).some((o: any[]) => o.some(a => a?.length)))
    throw new Error(`remove: "${n}" has outgoing connections; only sinks can be removed`);
  d.nodes = d.nodes.filter((n: any) => !gone.has(n.name));
  for (const n of names) delete d.connections[n];
  for (const spec of Object.values<any>(d.connections))
    for (const k of Object.keys(spec)) spec[k] = spec[k].map((arr: any[]) => (arr || []).filter(l => !gone.has(l.node)));
}

if (import.meta.main) {
  const [src, specPath, out, md] = process.argv.slice(2);
  const d = JSON.parse(await Bun.file(src).text());
  const spec: Spec = JSON.parse(await Bun.file(specPath).text());
  d.nodes = d.nodes.filter((n: any) => !n.type.includes('stickyNote'));
  rename(d, spec.rename || {});
  removeNodes(d, spec.remove || []);
  for (const n of d.nodes) { delete n.notes; delete n.notesInFlow; for (const c of Object.values<any>(n.credentials || {})) delete c.id; }
  d.name = spec.title;
  annotate(d, spec.groups, spec.overview);
  d.pinData = {}; d.tags = []; d.meta = { templateCredsSetupCompleted: true };
  d.settings = { ...(d.settings || {}), executionOrder: 'v1' };
  delete d.id; delete d.versionId; delete d.active;
  const raw = JSON.stringify(d, null, 2);
  const { errors, warnings } = lint(raw);
  for (const x of errors) console.log(`  ERROR  ${x}`);
  for (const x of warnings) console.log(`  warn   ${x}`);
  if (errors.length) { console.log(`not written: ${errors.length} error(s)`); process.exit(1); }
  await Bun.write(out, raw + '\n');
  if (md) await Bun.write(md, `# ${spec.title}\n\n${spec.overview.split('\n').slice(1).join('\n').trim()}\n`);
  console.log(`wrote ${out} (${d.nodes.length} nodes)`);
}
