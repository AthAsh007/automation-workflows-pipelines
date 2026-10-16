// Layout and sticky notes, after the official n8n template
// "Auto-generate sticky notes and rename nodes" (n8n.io/workflows/13868).
//
// That template asks a model to group nodes, then does the geometry in code:
// node dimensions from n8n's own canvas rules, one sticky per group sized to
// its nodes plus room for the heading text, a main overview sticky to the left
// of everything, and collision passes until nothing overlaps. We keep the
// geometry and drop the model: a spec already names its groups, in flow order.
//
// The one change: groups are laid out as columns, left to right in flow order,
// so stickies cannot collide by construction and the collision pass is a check
// rather than a repair.

export const GRID = 16;
export const NODE = 100;        // regular node box (n8n canvas)
export const SUB = 80;          // AI sub-node (circular config node)
export const AI_PARENT_W = 256; // configurable node with sub-node ports
const DX = 220;                 // layer pitch inside a group
const ROW_GAP = 70;             // vertical gap between lanes
const PAD_X = 48;               // sticky side padding (13868: 3 * GRID)
const PAD_BOTTOM = 64;          // 13868: STICKY_BOTTOM_PADDING
const GROUP_GAP = 48;           // clear space between two group stickies
const MIN_STICKY_W = 320;
const MAIN_W = 520;
const MAIN_GAP = 80;            // 13868: GAP_MAIN_TO_WORKFLOW

const snap = (v: number) => Math.round(v / GRID) * GRID;

export type Box = { x: number; y: number; w: number; h: number };

export function nodeSize(n: any, isAiParent: boolean, isSub: boolean): { w: number; h: number } {
  if (isSub) return { w: SUB, h: SUB };
  if (isAiParent) return { w: AI_PARENT_W, h: NODE };
  return { w: NODE, h: NODE };
}

/** Conservative estimate of rendered markdown height (n8n sticky, ~14px font). */
export function textHeight(content: string, width: number): number {
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

type Wf = { nodes: any[]; connections: Record<string, any> };

export function graph(wf: Wf) {
  const names = new Set(wf.nodes.map(n => n.name));
  const succ: Record<string, [number, string][]> = {};
  const pred: Record<string, string[]> = {};
  const subsOf: Record<string, string[]> = {};
  const parentOf: Record<string, string> = {};
  for (const n of wf.nodes) { succ[n.name] = []; pred[n.name] = []; }
  for (const [s, spec] of Object.entries(wf.connections)) {
    for (const [kind, outs] of Object.entries(spec as any)) {
      (outs as any[]).forEach((arr, bi) => (arr || []).forEach((l: any) => {
        if (!names.has(l.node) || !names.has(s)) return;
        if (kind === 'main') { succ[s].push([bi, l.node]); pred[l.node].push(s); }
        else { (subsOf[l.node] ||= []).includes(s) || subsOf[l.node].push(s); parentOf[s] ||= l.node; }
      }));
    }
  }
  return { succ, pred, subsOf, parentOf };
}

function backEdges(names: string[], succ: Record<string, [number, string][]>) {
  const colour: Record<string, number> = {}; const back = new Set<string>();
  for (const n of names) colour[n] = 0;
  const visit = (n: string) => {
    colour[n] = 1;
    for (const [, t] of succ[n] || []) {
      if (!(t in colour)) continue;
      if (colour[t] === 1) back.add(`${n}->${t}`);
      else if (colour[t] === 0) visit(t);
    }
    colour[n] = 2;
  };
  for (const n of names) if (colour[n] === 0) visit(n);
  return back;
}

export type GroupIn = { title: string; why: string; nodes: string[] };

export function annotate(wf: Wf & { name: string }, groups: GroupIn[], overview: string) {
  const { succ, pred, subsOf, parentOf } = graph(wf);
  const byName: Record<string, any> = Object.fromEntries(wf.nodes.map(n => [n.name, n]));
  const flow = wf.nodes.filter(n => !parentOf[n.name] && !n.type.includes('stickyNote')).map(n => n.name);

  const owner: Record<string, number> = {};
  groups.forEach((g, gi) => g.nodes.forEach(n => {
    if (!byName[n]) throw new Error(`group "${g.title}" names unknown node "${n}"`);
    if (parentOf[n]) throw new Error(`group "${g.title}" lists AI sub-node "${n}"; sub-nodes follow their parent`);
    if (n in owner) throw new Error(`node "${n}" is in two groups`);
    owner[n] = gi;
  }));
  const missing = flow.filter(n => !(n in owner));
  if (missing.length) throw new Error(`nodes in no group: ${missing.join(', ')}`);

  // global longest-path layer, so order inside a group follows the whole flow
  const back = backEdges(flow, succ);
  const layer: Record<string, number> = Object.fromEntries(flow.map(n => [n, 0]));
  for (let i = 0; i <= flow.length; i++) {
    let changed = false;
    for (const s of flow) for (const [, t] of succ[s]) {
      if (back.has(`${s}->${t}`) || !(t in layer)) continue;
      if (layer[t] < layer[s] + 1) { layer[t] = layer[s] + 1; changed = true; }
    }
    if (!changed) break;
  }

  const size = (n: string) => nodeSize(byName[n], !!subsOf[n], !!parentOf[n]);

  // header height is shared by every group so the node rows line up across the canvas
  const sectionText = (gi: number) => `## ${gi + 1}. ${groups[gi].title}\n\n${groups[gi].why}`;

  type Placed = { x: number; y: number };
  const pos: Record<string, Placed> = {};
  const stickies: any[] = [];
  const boxes: { gi: number; box: Box }[] = [];

  // pass 1: local columns and lanes per group, measured from origin 0,0
  const local = groups.map((g, gi) => {
    const members = g.nodes;
    const lmin = Math.min(...members.map(n => layer[n]));
    const cols: Record<number, string[]> = {};
    for (const n of members) (cols[layer[n] - lmin] ||= []).push(n);
    const colIdx = Object.keys(cols).map(Number).sort((a, b) => a - b);
    // lane assignment: follow the parent's lane, branch index drops a lane (layout.py rule)
    const lane: Record<string, number> = {};
    for (const ci of colIdx) {
      const used = new Set<number>();
      const key = (n: string) => {
        const ps = pred[n].filter(p => p in lane);
        const pl = ps.length ? Math.min(...ps.map(p => lane[p])) : 99;
        const bi = Math.min(...ps.flatMap(p => succ[p].filter(([, t]) => t === n).map(([b]) => b)), 0);
        return pl * 10 + bi;
      };
      for (const n of cols[ci].sort((a, b) => key(a) - key(b))) {
        const ps = pred[n].filter(p => p in lane);
        let want = 0;
        if (ps.length) {
          const p0 = ps.reduce((a, b) => (lane[a] <= lane[b] ? a : b));
          const bi = Math.min(...succ[p0].filter(([, t]) => t === n).map(([b]) => b));
          want = lane[p0] + (bi > 0 ? 1 : 0) * Math.min(bi, 3);
        } else {
          // no predecessor inside this group: line up with the cross-group predecessor's lane if known
          const outside = pred[n].find(p => p in pos);
          want = outside ? 0 : used.size;
        }
        while (used.has(want)) want++;
        used.add(want); lane[n] = want;
      }
    }
    // column x: width of the widest node in the column
    const colX: Record<number, number> = {}; let x = 0;
    for (const ci of colIdx) { colX[ci] = x; x += Math.max(...cols[ci].map(n => size(n).w)) + (DX - NODE); }
    const spanW = x - (DX - NODE);
    // lane y: a lane holding an AI parent is taller (sub-nodes hang under it)
    const lanes = Math.max(...Object.values(lane)) + 1;
    const laneH: number[] = Array.from({ length: lanes }, (_, l) =>
      NODE + (members.some(n => lane[n] === l && subsOf[n]) ? 150 : 0));
    const laneY: number[] = []; let y = 0;
    for (let l = 0; l < lanes; l++) { laneY.push(y); y += laneH[l] + ROW_GAP; }
    const spanH = y - ROW_GAP;
    const w = Math.max(MIN_STICKY_W, snap(spanW + PAD_X * 2));
    return { members, lane, cols, colIdx, colX, laneY, spanW, spanH, w, lmin };
  });

  const header = Math.max(...groups.map((_, gi) => textHeight(sectionText(gi), local[gi].w))) + 8;
  const top = 0;                       // sticky top edge for every group
  const rowsTop = snap(top + header);  // first node row

  let gx = 0;
  groups.forEach((g, gi) => {
    const L = local[gi];
    const inner = (L.w - L.spanW) / 2; // centre nodes in a sticky widened for its text
    for (const n of L.members) {
      const ci = layer[n] - L.lmin;
      pos[n] = { x: snap(gx + inner + L.colX[ci]), y: snap(rowsTop + L.laneY[L.lane[n]]) };
      // AI sub-nodes in a row under their parent
      (subsOf[n] || []).forEach((s, k) => {
        pos[s] = { x: snap(pos[n].x + 8 + k * 120), y: snap(pos[n].y + NODE + 60) };
      });
    }
    const h = snap(header + L.spanH + PAD_BOTTOM);
    const box = { x: snap(gx), y: top, w: L.w, h };
    boxes.push({ gi, box });
    stickies.push({
      parameters: { content: sectionText(gi), height: box.h, width: box.w, color: 7 },
      type: 'n8n-nodes-base.stickyNote', typeVersion: 1, position: [box.x, box.y],
      id: hashSticky(wf.name, gi), name: `Section ${gi + 1} note`,
    });
    gx += L.w + GROUP_GAP;
  });

  // equalise heights so the band reads as one strip
  const tallest = Math.max(...stickies.map(s => s.parameters.height));
  for (const s of stickies) s.parameters.height = tallest;

  const mainH = Math.max(tallest, snap(textHeight(overview, MAIN_W) + 24));
  stickies.unshift({
    parameters: { content: overview, height: mainH, width: MAIN_W, color: 4 },
    type: 'n8n-nodes-base.stickyNote', typeVersion: 1, position: [-(MAIN_W + MAIN_GAP), top],
    id: hashSticky(wf.name, 999), name: 'Template overview',
  });

  for (const n of wf.nodes) if (pos[n.name]) n.position = [pos[n.name].x, pos[n.name].y];
  wf.nodes = [...stickies, ...wf.nodes.filter(n => !n.type.includes('stickyNote'))];
  return wf;
}

function hashSticky(seed: string, i: number) {
  let h = 2166136261; const s = seed + ':' + i;
  for (let k = 0; k < s.length; k++) { h ^= s.charCodeAt(k); h = Math.imul(h, 16777619); }
  const a = (h >>> 0).toString(16).padStart(8, '0');
  return `${a}-5717-4c4e-9a00-${a}${(i + 4096).toString(16).padStart(4, '0')}`;
}
