// Prove a regenerated -publish.json still does what its working file does.
//
//   bun _kit/diff.ts <working.json> <publish.json> [republish-spec.json]
//
// With a spec, its renames and removals are applied to the working file first,
// so the only differences allowed are the ones the spec asked for. Checks every
// node's type, version and parameters, every edge, and that no $('X') reference
// names a node that no longer exists.

import { rename, removeNodes } from './republish';

export function diff(w: any, p: any, spec?: any): string[] {
  const out: string[] = [];
  w = structuredClone(w);
  w.nodes = w.nodes.filter((x: any) => !x.type.includes('stickyNote'));
  if (spec) { rename(w, spec.rename || {}); removeNodes(w, spec.remove || []); }
  const P: Record<string, any> = Object.fromEntries(p.nodes.filter((x: any) => !x.type.includes('stickyNote')).map((x: any) => [x.name, x]));
  for (const x of w.nodes) {
    const y = P[x.name];
    if (!y) { out.push(`missing node "${x.name}"`); continue; }
    for (const k of ['type', 'typeVersion', 'parameters', 'onError', 'webhookId', 'executeOnce', 'retryOnFail', 'maxTries'])
      if (JSON.stringify(x[k]) !== JSON.stringify(y[k])) out.push(`changed ${k} on "${x.name}"`);
  }
  for (const n of Object.keys(P)) if (!w.nodes.some((x: any) => x.name === n)) out.push(`added node "${n}"`);
  const edges = (d: any) => new Set(Object.entries<any>(d.connections).flatMap(([s, sp]) =>
    Object.entries<any>(sp).flatMap(([k, outs]) => outs.flatMap((a: any[], i: number) => (a || []).map(l => `${s} -[${k}:${i}]-> ${l.node}#${l.index ?? 0}`)))));
  const a = edges(w), b = edges(p);
  for (const e of a) if (!b.has(e)) out.push(`dropped edge ${e}`);
  for (const e of b) if (!a.has(e)) out.push(`new edge ${e}`);
  const names = new Set(Object.keys(P));
  const refs = /\$\((['"])(.+?)\1\)/g;
  for (const n of Object.values<any>(P)) for (const m of JSON.stringify(n.parameters).replace(/\\"/g, '"').matchAll(refs))
    if (!names.has(m[2])) out.push(`"${n.name}" references missing node "${m[2]}"`);
  return out;
}

if (import.meta.main) {
  const [wp, pp, sp] = process.argv.slice(2);
  const w = JSON.parse(await Bun.file(wp).text()), p = JSON.parse(await Bun.file(pp).text());
  const spec = sp ? JSON.parse(await Bun.file(sp).text()) : undefined;
  const r = diff(w, p, spec);
  for (const x of r) console.log(`  ${x}`);
  console.log(r.length ? `${r.length} difference(s)` : 'IDENTICAL apart from the spec\'s renames and removals');
  process.exit(r.length ? 1 : 0);
}
