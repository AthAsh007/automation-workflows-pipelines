// n8n template submission linter. A port of the Manexus tools/submission_lint.py,
// changed in one place: n8n's own sticky guidelines (and template 13868) put a
// section sticky *behind* the nodes it describes. So a node fully inside a
// section sticky, below its heading text, is correct. A node partly covered by
// a sticky, a node under the heading text, any node on the overview sticky,
// and any two stickies overlapping are still errors.
//
// usage: bun lint.ts <file.json> [...]

import { textHeight, nodeSize, graph } from './annotate';

const GENERIC = /^(Code|Edit Fields|HTTP Request|If|Merge|Switch|Set|NoOp|No Operation|Webhook|Sticky Note|Function|Wait|Filter|Loop Over Items|Gmail|Slack|Google Sheets|Telegram|OpenAI|Basic LLM Chain|AI Agent|Schedule Trigger|When clicking .*|Aggregate|Split Out|Respond to Webhook|Discord|Twilio)\s*\d*$/i;
const SECRET = /(sk-[A-Za-z0-9]{20,}|sk-proj-[A-Za-z0-9_\-]{20,}|Bearer\s+[A-Za-z0-9_\-.]{25,}|AIza[0-9A-Za-z_\-]{30,}|xox[baprs]-[A-Za-z0-9\-]{10,}|ghp_[A-Za-z0-9]{30,}|SG\.[A-Za-z0-9_\-]{20,}|AC[0-9a-f]{32}|key-[0-9a-f]{32})/;
const PERSONAL = /(hooks\.slack\.com\/services\/T[A-Z0-9]{6,}|discord\.com\/api\/webhooks\/\d{17,}|[A-Za-z0-9._%+\-]+@(?!example\.|yourcompany|your-|company\.com|email\.com)[A-Za-z0-9.\-]+\.(com|io|net|org|co|xyz)\b|\+(?!\d{0,4}555)\d{10,15}|docs\.google\.com\/spreadsheets\/d\/[A-Za-z0-9_-]{25,})/g;

// docs/SANITIZATION.md, applied to human-facing text (sticky notes, titles)
const BANNED = ['seamless', 'seamlessly', 'robust', 'cutting-edge', 'leverage', 'elevate', 'unlock', 'empower',
  'supercharge', 'game-changer', 'revolutionary', 'transformative', 'innovative', 'state-of-the-art', 'best-in-class',
  'world-class', 'industry-leading', 'delve', 'utilize', 'facilitate', 'harness', 'foster', 'bolster', 'pivotal',
  'holistic', 'synergy', 'tapestry', 'testament', 'landscape', 'realm', 'end-to-end', 'all-in-one', 'next-generation',
  'streamline', 'in today\'s', 'it\'s worth noting', 'needless to say', 'in conclusion', 'whether you\'re'];

export type LintResult = { errors: string[]; warnings: string[] };

export function lint(raw: string): LintResult {
  const errs: string[] = [], warns: string[] = [];
  let d: any;
  try { d = JSON.parse(raw); } catch (e: any) { return { errors: [`INVALID JSON: ${e.message}`], warnings: [] }; }
  const nodes: any[] = d.nodes || [], conns = d.connections || {};
  if (!nodes.length) return { errors: ['no nodes'], warnings: [] };

  const names = nodes.map(n => n.name);
  const dupes = [...new Set(names.filter((n, i) => names.indexOf(n) !== i))];
  if (dupes.length) errs.push(`duplicate node names: ${dupes.join(', ')}`);
  const nameset = new Set(names);

  for (const [src, spec] of Object.entries<any>(conns)) {
    if (!nameset.has(src)) errs.push(`connection source "${src}" is not a node`);
    for (const outs of Object.values<any>(spec || {})) for (const br of outs || []) for (const l of br || [])
      if (!nameset.has(l.node)) errs.push(`connection "${src}" -> "${l.node}" targets a missing node`);
  }

  const isSticky = (n: any) => (n.type || '').includes('stickyNote');
  const real = nodes.filter(n => !isSticky(n));
  const stick = nodes.filter(isSticky);
  const { succ, pred, subsOf, parentOf } = graph(d);

  // disconnected / dangling
  for (const n of real) {
    const isTrig = /trigger|webhook/i.test(n.type);
    if (!isTrig && !pred[n.name]?.length && !parentOf[n.name]) errs.push(`node "${n.name}" has no input (dangling)`);
  }
  // every IF false branch / switch fallback lands somewhere
  for (const n of real) {
    const outs = (conns[n.name]?.main || []) as any[];
    if (n.type === 'n8n-nodes-base.if' && !(outs[1] || []).length) errs.push(`IF "${n.name}" false branch goes nowhere; land it on a STOP: node`);
    if (n.type === 'n8n-nodes-base.if' && !(outs[0] || []).length) errs.push(`IF "${n.name}" true branch goes nowhere`);
    if (n.type === 'n8n-nodes-base.switch') {
      const k = (n.parameters?.rules?.values || []).length;
      for (let i = 0; i <= k; i++) if (!(outs[i] || []).length) errs.push(`Switch "${n.name}" output ${i} goes nowhere`);
    }
  }

  // geometry
  type R = { name: string; x: number; y: number; w: number; h: number };
  const nodeRects: R[] = real.map(n => { const s = nodeSize(n, !!subsOf[n.name], !!parentOf[n.name]); return { name: n.name, x: n.position[0], y: n.position[1], w: s.w, h: s.h }; });
  const stickRects = stick.map(n => ({ name: n.name, x: n.position[0], y: n.position[1], w: n.parameters.width || 240, h: n.parameters.height || 160,
    color: String(n.parameters.color ?? ''), head: textHeight(n.parameters.content || '', n.parameters.width || 240) }));
  const ov = (a: any, b: any, gap: number) => a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;
  const inside = (a: any, b: any) => a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h;

  for (let i = 0; i < nodeRects.length; i++) for (let j = i + 1; j < nodeRects.length; j++)
    if (ov(nodeRects[i], nodeRects[j], 20)) errs.push(`nodes overlap: "${nodeRects[i].name}" & "${nodeRects[j].name}"`);
  for (const s of stickRects) for (const n of nodeRects) {
    if (!ov(s, n, 0)) continue;
    if (s.color === '4') { errs.push(`overview sticky "${s.name}" covers node "${n.name}"`); continue; }
    if (!inside(n, s)) errs.push(`sticky "${s.name}" partly covers node "${n.name}"`);
    else if (n.y < s.y + s.head - 4) errs.push(`node "${n.name}" sits on the heading text of "${s.name}"`);
  }
  for (let i = 0; i < stickRects.length; i++) for (let j = i + 1; j < stickRects.length; j++)
    if (ov(stickRects[i], stickRects[j], 0)) errs.push(`stickies overlap: "${stickRects[i].name}" & "${stickRects[j].name}"`);
  for (const s of stickRects) if (s.head > s.h + 4) errs.push(`sticky "${s.name}" text overflows its height (${s.head} > ${s.h})`);

  // connections drawn through other nodes (n8n draws a horizontal-tangent bezier)
  const rectOf = Object.fromEntries(nodeRects.map(r => [r.name, r]));
  for (const [s, outs] of Object.entries(succ)) for (const [, t] of outs) {
    const a = rectOf[s], b = rectOf[t];
    if (!a || !b) continue;
    const x0 = a.x + a.w, y0 = a.y + a.h / 2, x3 = b.x, y3 = b.y + b.h / 2;
    const k = Math.max(60, Math.abs(x3 - x0) / 2);
    for (let i = 1; i < 40; i++) {
      const u = i / 40, v = 1 - u;
      const x = v ** 3 * x0 + 3 * v * v * u * (x0 + k) + 3 * v * u * u * (x3 - k) + u ** 3 * x3;
      const y = v ** 3 * y0 + 3 * v * v * u * y0 + 3 * v * u * u * y3 + u ** 3 * y3;
      const hit = nodeRects.find(r => r.name !== s && r.name !== t && x > r.x + 6 && x < r.x + r.w - 6 && y > r.y + 6 && y < r.y + r.h - 6);
      if (hit) { errs.push(`connection "${s}" -> "${t}" is drawn through node "${hit.name}"`); break; }
    }
  }

  // left to right
  let back = 0;
  for (const [s, outs] of Object.entries(succ)) for (const [, t] of outs) {
    const a = real.find(n => n.name === s), b = real.find(n => n.name === t);
    if (a && b && b.position[0] < a.position[0] - 40) back++;
  }
  if (back) warns.push(`${back} connection(s) run right-to-left`);

  // naming
  const gen = real.filter(n => GENERIC.test(n.name || '')).map(n => n.name);
  if (gen.length) errs.push(`generic node names: ${gen.join(', ')}`);

  // stickies and description
  if (stick.length < 3) errs.push(`only ${stick.length} sticky notes (need an overview + one per section)`);
  const yellow = stick.filter(n => String(n.parameters?.color) === '4');
  if (yellow.length !== 1) errs.push(`need exactly one yellow (color 4) sticky, found ${yellow.length}`);
  const body = stick.map(n => n.parameters?.content || '').join('\n').replace(/[’‘]/g, "'").toLowerCase();
  for (const sec of [["who's it for", "who it's for"], ['how it works', 'what it does'], ['how to set up', 'setup'], ['requirements'], ['customi']])
    if (!sec.some(v => body.includes(v))) errs.push(`no sticky covers the section "${sec[0]}"`);
  const descWords = Math.max(0, ...yellow.map(n => (n.parameters.content || '').split(/\s+/).length));
  if (descWords < 150) warns.push(`description sticky is ${descWords} words; aim for ~200`);
  if (descWords > 420) warns.push(`description sticky is ${descWords} words; aim for ~200`);

  // copy rules on human-facing text
  const prose = stick.map(n => n.parameters?.content || '').join('\n') + '\n' + (d.name || '');
  if (/[—–]/.test(prose)) errs.push('em or en dash in sticky text or title (docs/SANITIZATION.md)');
  if (/[“”‘’]/.test(prose)) errs.push('curly quotes in sticky text or title');
  const lower = prose.toLowerCase();
  for (const w of BANNED) if (new RegExp(`(^|[^a-z])${w.replace(/[-']/g, m => '\\' + m)}([^a-z]|$)`).test(lower)) errs.push(`banned copy word "${w}" (docs/SANITIZATION.md)`);

  // title
  const title: string = d.name || '';
  if (!title) errs.push('workflow has no name');
  else {
    if ([...title].some(ch => ch.codePointAt(0)! > 0x2100)) errs.push(`title contains emoji/symbol: ${title}`);
    const words = title.split(/\s+/);
    if (words.length < 4) errs.push(`title too short (${words.length} words): ${title}`);
    if (words.length > 16) warns.push(`title is long (${words.length} words)`);
    if (!words.some(w => ['to', 'on', 'in', 'from', 'with', 'for', 'into', 'across', 'via'].includes(w.toLowerCase()))) errs.push(`title lacks a preposition: ${title}`);
    const capped = words.slice(1).filter(w => /^[A-Z]/.test(w) && w !== w.toUpperCase());
    if (capped.length > Math.max(2, Math.floor(words.length / 2))) errs.push(`title looks Title Cased: ${title}`);
    if (!/^[A-Z]/.test(title)) errs.push(`title should start with a capital verb: ${title}`);
  }

  // provenance, secrets, privacy
  // Provenance: Upwork links and brief references anywhere; "the client" only in the
  // description text, where it means a person, not a column or a variable in code.
  for (const [re, why, where] of [
    [/upwork\.com/i, 'an Upwork link', raw],
    [/\bthe brief\b|\btheir brief\b|\bthe job post\b/i, 'a reference to an originating brief', raw],
    [/\bthe client\b|\bour client\b/i, 'a reference to an originating client', prose],
  ] as const) {
    const m = where.match(re); if (m) errs.push(`contains ${why}: "${m[0]}"`);
  }
  const sec = raw.match(SECRET); if (sec) errs.push(`possible hardcoded credential: ${sec[0].slice(0, 22)}...`);
  for (const m of new Set(raw.match(PERSONAL) || [])) warns.push(`possible personal identifier: ${m}`);
  if (raw.includes('�')) errs.push('mojibake (U+FFFD) in content');
  if (d.pinData && Object.keys(d.pinData).length) errs.push('pinData present');

  // house rules (docs/CONFIG-NODE.md)
  if (/\$env\b|\$vars\b/.test(raw)) errs.push('reads $env or $vars; settings belong in the config node');
  const cfg = real.filter(n => n.name === 'config');
  if (cfg.length !== 1 || cfg[0].type !== 'n8n-nodes-base.code') errs.push('need exactly one Code node named "config"');
  if (d.settings?.executionOrder !== 'v1') errs.push('settings.executionOrder must be "v1"');
  for (const n of real) for (const v of Object.values<any>(n.credentials || {})) if (v?.id) errs.push(`credential id embedded on "${n.name}"`);
  // a secret-named const with a value long enough to be a real credential (ids like JIRA_PROJECT_KEY = 'BUG' pass)
  const keyLit = raw.match(/const [A-Z_]*(API_KEY|SECRET|PASSWORD|_TOKEN|PRIVATE_KEY|ACCESS_KEY|SECRET_KEY) *= *'[^'\s]{12,}'/);
  if (keyLit) errs.push(`non-empty secret literal in config: ${keyLit[0].slice(0, 40)}`);
  for (const n of real.filter(n => n.type === 'n8n-nodes-base.code')) {
    try { new (Object.getPrototypeOf(async function () {}).constructor)(n.parameters.jsCode); }
    catch (e: any) { errs.push(`Code node "${n.name}" does not parse: ${e.message}`); }
  }
  return { errors: [...new Set(errs)], warnings: [...new Set(warns)] };
}

if (import.meta.main) {
  let bad = 0;
  for (const p of process.argv.slice(2)) {
    const { errors, warnings } = lint(await Bun.file(p).text());
    console.log(`=== ${p}`);
    for (const x of errors) console.log(`  ERROR  ${x}`);
    for (const x of warnings) console.log(`  warn   ${x}`);
    if (!errors.length && !warnings.length) console.log('  OK');
    bad += errors.length;
  }
  console.log(`\n${bad} error(s)`);
  process.exit(bad ? 1 : 0);
}
