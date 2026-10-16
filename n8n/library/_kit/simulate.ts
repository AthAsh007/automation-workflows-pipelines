// Runs a built workflow with no n8n and no network.
//
// Code nodes run their real jsCode. IF, Switch, Merge, Aggregate, Split Out,
// Wait, NoOp and Respond to Webhook are evaluated here. Any node that would
// call a service returns the scenario's mock for it, or passes its input
// through. Two properties are enforced on every spec:
//
//   the shipped config (first scenario) reaches no node that needs a credential
//   and no node that sends, posts or writes;
//   at least one scenario reaches an outward node, so the live path is exercised.

import type { Scenario } from './spec';

type Item = { json: any };
const AsyncFn = Object.getPrototypeOf(async function () {}).constructor;

function nowShim() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    toISO: () => d.toISOString(),
    toISODate: () => d.toISOString().slice(0, 10),
    toMillis: () => d.getTime(),
    toFormat: (f: string) => f.replace('yyyy', String(d.getFullYear())).replace('MM', pad(d.getMonth() + 1)).replace('dd', pad(d.getDate()))
      .replace('HH', pad(d.getHours())).replace('mm', pad(d.getMinutes())),
    weekday: ((d.getDay() + 6) % 7) + 1,
    hour: d.getHours(),
    toString: () => d.toISOString(),
  };
}

export type SimResult = {
  ran: string[];
  outputs: Record<string, any[]>;
  outwardRan: string[];
  serviceRan: string[];
  failures: string[];
};

export async function simulate(wf: any, scenario: Scenario, meta: { outward: Set<string>; service: Set<string> }, cfgOverride?: (code: string) => string): Promise<SimResult> {
  const nodes: Record<string, any> = Object.fromEntries(wf.nodes.filter((n: any) => !n.type.includes('stickyNote')).map((n: any) => [n.name, n]));
  const conns = wf.connections;
  const failures: string[] = [];
  const out: Record<string, Item[][]> = {};       // node -> outputs[branch] -> items
  const inputs: Record<string, Item[][]> = {};    // node -> inputs[index] -> items
  const ran: string[] = [];
  const staticData: any = {};

  // AI sub-nodes are not run as steps
  const sub = new Set<string>();
  for (const [s, spec] of Object.entries<any>(conns)) for (const k of Object.keys(spec)) if (k !== 'main') sub.add(s);

  const accessor = (name: string, curIndex = 0) => {
    if (!nodes[name]) throw new Error(`Referenced node doesn't exist: ${name}`);
    if (!(name in out)) throw new Error(`Node '${name}' hasn't been executed`);
    // n8n: first()/last()/all() read output 0 unless a branch index is passed;
    // .item follows pairing, approximated here by index over whichever output has items.
    const branch = (b = 0) => out[name][b] || [];
    const flat = out[name].flat();
    return {
      first: (b = 0) => { const a = branch(b); if (!a.length) throw new Error(`Node '${name}' output ${b} has no items`); return a[0]; },
      last: (b = 0) => { const a = branch(b); return a[a.length - 1]; },
      all: (b = 0) => branch(b),
      get item() { return flat[Math.min(curIndex, flat.length - 1)]; },
      isExecuted: true,
    };
  };
  const $ = (cur: number) => (name: string) => accessor(name, cur);

  const evalExpr = (v: any, item: Item | undefined, idx: number): any => {
    if (typeof v !== 'string' || !v.startsWith('=')) return v;
    const s = v.slice(1);
    const ctx = { $json: item?.json ?? {}, $: $(idx), $now: nowShim(), $today: nowShim(), $execution: { id: 'sim', mode: 'manual' }, $workflow: { name: wf.name }, $input: { item, all: () => [], first: () => item } };
    const run = (code: string) => new Function(...Object.keys(ctx), `return (${code});`)(...Object.values(ctx));
    const whole = s.match(/^\{\{([\s\S]*)\}\}$/);
    if (whole && !whole[1].includes('}}')) return run(whole[1]);
    return s.replace(/\{\{([\s\S]*?)\}\}/g, (_, c) => { const r = run(c); return typeof r === 'object' ? JSON.stringify(r) : String(r); });
  };

  const deepEval = (v: any, item: Item, idx: number): any =>
    typeof v === 'string' ? evalExpr(v, item, idx) : Array.isArray(v) ? v.map(x => deepEval(x, item, idx)) :
    v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, deepEval(x, item, idx)])) : v;

  const test = (cond: any, item: Item, idx: number) => {
    const l = evalExpr(cond.leftValue, item, idx), r = evalExpr(cond.rightValue, item, idx);
    const op = cond.operator.operation;
    const num = (x: any) => Number(x);
    switch (op) {
      case 'true': return l === true || l === 'true';
      case 'false': return l === false || l === 'false';
      case 'equals': return cond.operator.type === 'number' ? num(l) === num(r) : String(l) === String(r);
      case 'notEquals': return String(l) !== String(r);
      case 'contains': return String(l).includes(String(r));
      case 'notEmpty': return !(l === undefined || l === null || l === '' || (Array.isArray(l) && !l.length));
      case 'empty': return l === undefined || l === null || l === '' || (Array.isArray(l) && !l.length);
      case 'gt': return num(l) > num(r);
      case 'gte': return num(l) >= num(r);
      case 'lt': return num(l) < num(r);
      case 'lte': return num(l) <= num(r);
      default: throw new Error(`simulator: unsupported operator ${op}`);
    }
  };
  const evalConds = (c: any, item: Item, idx: number) => {
    const rs = c.conditions.map((x: any) => test(x, item, idx));
    return c.combinator === 'or' ? rs.some(Boolean) : rs.every(Boolean);
  };

  const norm = (r: any): Item[] => {
    if (r === undefined || r === null) return [];
    const arr = Array.isArray(r) ? r : [r];
    return arr.map((x: any) => (x && typeof x === 'object' && 'json' in x ? { json: x.json } : { json: x }));
  };

  async function exec(name: string, items: Item[]): Promise<Item[][]> {
    const n = nodes[name]; const t: string = n.type; const p = n.parameters || {};
    const mock = scenario.mocks?.[name];
    const cfg = out['config'] ? out['config'][0][0]?.json : {};
    if (mock !== undefined) {
      const r = typeof mock === 'function' ? mock(items.map(i => i.json), { cfg }) : mock;
      return [norm(r)];
    }
    switch (t) {
      case 'n8n-nodes-base.code': {
        let code: string = p.jsCode;
        if (name === 'config' && cfgOverride) code = cfgOverride(code);
        const base = { $: $(0), $now: nowShim(), $today: nowShim(), $execution: { id: 'sim', mode: 'manual' }, $workflow: { name: wf.name },
          $getWorkflowStaticData: () => staticData, console: { log: () => {} } };
        if (p.mode === 'runOnceForEachItem') {
          const res: Item[] = [];
          for (let i = 0; i < items.length; i++) {
            const ctx = { ...base, $: $(i), $json: items[i].json, $input: { item: items[i], all: () => items, first: () => items[0] }, $itemIndex: i };
            const r = await new AsyncFn(...Object.keys(ctx), code)(...Object.values(ctx));
            res.push(...norm(r));
          }
          return [res];
        }
        const ctx = { ...base, $json: items[0]?.json ?? {}, $input: { all: () => items, first: () => items[0] ?? { json: {} }, last: () => items[items.length - 1], item: items[0] } };
        return [norm(await new AsyncFn(...Object.keys(ctx), code)(...Object.values(ctx)))];
      }
      case 'n8n-nodes-base.if': {
        const yes: Item[] = [], no: Item[] = [];
        items.forEach((it, i) => (evalConds(p.conditions, it, i) ? yes : no).push(it));
        return [yes, no];
      }
      case 'n8n-nodes-base.switch': {
        const rules = p.rules.values; const outs: Item[][] = rules.map(() => []); outs.push([]);
        items.forEach((it, i) => {
          const k = rules.findIndex((r: any) => evalConds(r.conditions, it, i));
          outs[k < 0 ? rules.length : k].push(it);
        });
        return outs;
      }
      case 'n8n-nodes-base.merge': return [(inputs[name] || []).flat()];
      case 'n8n-nodes-base.aggregate': return [[{ json: { data: items.map(i => i.json) } }]];
      case 'n8n-nodes-base.splitOut': {
        const f = p.fieldToSplitOut;
        return [items.flatMap(it => (it.json[f] || []).map((x: any) => ({ json: { ...it.json, ...(typeof x === 'object' ? x : { [f]: x }) } })))];
      }
      case 'n8n-nodes-base.respondToWebhook': items.forEach((it, i) => deepEval(p.responseBody, it, i)); return [items];
      default:
        // service / pass-through: still evaluate parameters so a broken expression fails here, not in n8n
        items.forEach((it, i) => deepEval(p, it, i));
        if (t === 'n8n-nodes-base.googleSheets' && !p.operation) return [[]];   // a read with no mock returns no rows
        if (t.includes('langchain.agent')) return [items.map(it => ({ json: { output: {} } }))];
        return [items];
    }
  }

  // topological run from the start trigger
  const names = Object.keys(nodes);
  const succ: Record<string, [number, string, number][]> = Object.fromEntries(names.map(n => [n, []]));
  for (const [s, spec] of Object.entries<any>(conns)) (spec.main || []).forEach((arr: any[], bi: number) =>
    (arr || []).forEach(l => succ[s]?.push([bi, l.node, l.index || 0])));
  const reachable = new Set<string>();
  const walk = (n: string) => { if (reachable.has(n)) return; reachable.add(n); for (const [, t] of succ[n]) walk(t); };
  if (!nodes[scenario.start]) return { ran, outputs: {}, outwardRan: [], serviceRan: [], failures: [`start node "${scenario.start}" not found`] };
  walk(scenario.start);
  const indeg: Record<string, number> = {};
  for (const n of reachable) indeg[n] = 0;
  for (const s of reachable) for (const [, t] of succ[s]) if (reachable.has(t)) indeg[t]++;
  const queue = [scenario.start]; const done = new Set<string>();
  const startItems = (scenario.input && scenario.input.length ? scenario.input : [{}]).map(j => ({ json: j }));
  inputs[scenario.start] = [startItems];

  while (queue.length) {
    const name = queue.shift()!;
    if (done.has(name)) continue; done.add(name);
    const got = (inputs[name] || []).flat();
    const isMerge = nodes[name].type === 'n8n-nodes-base.merge';
    if (got.length || name === scenario.start || (isMerge && got.length)) {
      try {
        const res = name === scenario.start ? [startItems] : await exec(name, got);
        out[name] = res; ran.push(name);
        res.forEach((items, bi) => {
          if (!items.length) return;
          for (const [b, t, ti] of succ[name]) if (b === bi) { ((inputs[t] ||= [])[ti] ||= []).push(...items); }
        });
      } catch (e: any) {
        failures.push(`[${scenario.name}] node "${name}" threw: ${e.message}`);
        out[name] = [[]];
      }
    }
    for (const [, t] of succ[name]) if (reachable.has(t) && --indeg[t] === 0) queue.push(t);
  }

  const outputs = Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.flat().map(i => i.json)]));
  const outwardRan = ran.filter(n => meta.outward.has(n));
  const serviceRan = ran.filter(n => meta.service.has(n) && n !== scenario.start);
  const x = scenario.expect;
  for (const r of x.reached || []) if (!ran.includes(r)) failures.push(`[${scenario.name}] expected to reach "${r}"`);
  for (const r of x.notReached || []) if (ran.includes(r)) failures.push(`[${scenario.name}] must not reach "${r}"`);
  if (x.outward === 'none' && outwardRan.length) failures.push(`[${scenario.name}] outward node(s) ran: ${outwardRan.join(', ')}`);
  if (x.outward === 'some' && !outwardRan.length) failures.push(`[${scenario.name}] expected an outward node to run`);
  if (scenario.check) { try { failures.push(...scenario.check(outputs).map(m => `[${scenario.name}] ${m}`)); } catch (e: any) { failures.push(`[${scenario.name}] check threw: ${e.message}`); } }
  return { ran, outputs, outwardRan, serviceRan, failures };
}
