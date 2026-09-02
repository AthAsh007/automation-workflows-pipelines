#!/usr/bin/env node
// Build ONE self-contained 1080x1350 LinkedIn post template from a spec file.
//
//   node build_post_template.js <spec.json> <out.html> [--assets <dir>] [--history <file>]
//                               [--slot <n>] [--force]
//
// Inline CSS, inline SVG logo, no external fetches — the renderer loads the file over
// file:// with no network, so anything fetched is a guaranteed blank.
//
// This replaces the bank-builder that carried a hardcoded POSTS array. A daily cron
// writes one spec per day; the array version could not express that without editing
// the script on every run.
//
// Exit codes: 0 built · 1 spec rejected or rotation collision (nothing written) · 2 usage.
//
// Visual language: ../reference/DESIGN.md. Guardrails: ../reference/GUARDRAILS.md.

'use strict';

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Palette. These exact values, nothing else. `#E3245A` appears in some older
// reference docs and is stale.
// ---------------------------------------------------------------------------
const C = {
  bg: '#050505',
  pink: '#DC2056',
  white: '#FFFFFF',
  muted: '#A8A8A8',
  line: '#303030',
  cardBorder: '#262626',
  cardBg: '#0B0B0B',
};

// A publishing week. The cron is `0 8 * * 1-5`, so five consecutive posts. No two
// posts inside this many slots may share a layout or a pillar. Measured in publish
// slots, not build dates: a bank rendered in one sitting is fine, two published
// posts repeating inside a week is not.
const WINDOW_SLOTS = 5;

const LAYOUTS = {
  timeline: { items: [4, 4], arity: 2, focal: 'last node' },
  cards:    { items: [3, 3], arity: 3, focal: 'last card' },
  grid:     { items: [4, 4], arity: 2, focal: 'band', needs: ['band'] },
  split:    { items: [2, 2], arity: 2, focal: 'right column' },
  stat:     { items: [3, 3], arity: 2, focal: 'figure', needs: ['statBig', 'statSub'] },
  stack:    { items: [5, 5], arity: 2, focal: 'last bar' },
};

// ---------------------------------------------------------------------------
// Spec validation. Every check here caught a real defect at least once; a spec that
// gets past this point produces a template the layout validator accepts.
// ---------------------------------------------------------------------------

const REQUIRED = ['date', 'slug', 'pillar', 'category', 'headline', 'subhead', 'type', 'items', 'footer'];

function fail(messages) {
  console.error('REJECTED — the spec is not buildable:');
  for (const m of messages) console.error('  - ' + m);
  console.error('Nothing was written.');
  process.exit(1);
}

function warn(message) {
  console.error('WARNING: ' + message);
}

function validate(spec) {
  const errs = [];

  for (const key of REQUIRED) {
    const v = spec[key];
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) {
      errs.push(`missing required field: ${key}`);
    }
  }
  if (errs.length) fail(errs);

  const layout = LAYOUTS[spec.type];
  if (!layout) {
    fail([`type "${spec.type}" is not a layout — use one of ${Object.keys(LAYOUTS).join(', ')}`]);
  }

  for (const extra of layout.needs || []) {
    if (!spec[extra]) errs.push(`layout "${spec.type}" requires "${extra}"`);
  }

  const [min, max] = layout.items;
  if (spec.items.length < min || spec.items.length > max) {
    errs.push(
      `layout "${spec.type}" takes ${min === max ? min : `${min}-${max}`} items, got ${spec.items.length}`
    );
  }
  for (const [i, item] of spec.items.entries()) {
    if (!Array.isArray(item) || item.length !== layout.arity) {
      errs.push(`items[${i}] must be an array of ${layout.arity} — see DESIGN.md for the shape`);
    }
  }
  if (spec.type === 'split') {
    for (const [i, item] of spec.items.entries()) {
      if (Array.isArray(item) && !Array.isArray(item[1])) {
        errs.push(`split items[${i}][1] must be an array of row strings`);
      }
    }
  }

  // Exactly one pink phrase in the headline. Two pink lines out of three reads as
  // shouting; zero loses the third pink zone the design depends on.
  const ems = (spec.headline.match(/<em>/g) || []).length;
  if (ems !== 1) {
    errs.push(`headline needs exactly one <em>phrase</em>, found ${ems}`);
  }

  // Any pink outside the three sanctioned zones — logo mark, headline <em>, focal
  // element — is a fourth zone. The zones are structural, so hand-written colour in
  // the copy is always the wrong way to get one.
  const copy = JSON.stringify([spec.headline, spec.subhead, spec.items, spec.footer, spec.band]);
  if (/#DC2056|#dc2056|style\s*=/.test(copy)) {
    errs.push('inline colour or style in the copy — pink lives in the three structural zones only');
  }

  const size = spec.headlineSize === undefined ? 96 : Number(spec.headlineSize);
  if (!Number.isFinite(size) || size < 70 || size > 130) {
    errs.push(`headlineSize ${spec.headlineSize} is outside 70-130px — see the sizing note in DESIGN.md`);
  }
  // The content box is 932px and bold Arial caps run ~0.60em per character, so a long
  // line at a large size probably overflows. Deliberately a WARNING, not a rejection:
  // the estimate is crude — punctuation and spaces are far narrower than 0.60em — and
  // it rejected `SUCCESS. FAILURE. / UNKNOWN.` at 96px, which is a shipped post that
  // fits. The blocking check is validate_linkedin_layout.js, which measures the real
  // rendered geometry instead of guessing at it.
  const longest = spec.headline
    .split(/<br\s*\/?>/i)
    .map((l) => l.replace(/<[^>]+>/g, '').trim().length)
    .reduce((a, b) => Math.max(a, b), 0);
  if (longest && longest * size * 0.6 > 932) {
    warn(
      `headline line of ${longest} chars at ${size}px may overflow the 932px box ` +
      `(estimate ~${Math.floor(932 / (longest * 0.6))}px) — if the validator agrees, ` +
      'shorten the words rather than the type'
    );
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(spec.date || '')) {
    errs.push('date must be YYYY-MM-DD — the publisher refuses a caption and image with different dates');
  }

  if (errs.length) fail(errs);
  return { ...spec, headlineSize: size };
}

// ---------------------------------------------------------------------------
// Rotation guard. Both checks exist because both mistakes reached the live page:
// two posts shipped the same timeline layout on one day, and two shipped the same
// pillar on one day. Rotate the layout AND the argument — do not re-skin one.
// ---------------------------------------------------------------------------

function readHistory(file) {
  if (!fs.existsSync(file)) return { windowSlots: WINDOW_SLOTS, entries: [] };
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return { windowSlots: parsed.windowSlots || WINDOW_SLOTS, entries: parsed.entries || [] };
  } catch (err) {
    // A corrupt history would silently disable the guard, which is worse than stopping.
    console.error(`history file ${file} is unreadable: ${err.message}`);
    process.exit(1);
  }
}

function checkRotation(spec, history, slot, force) {
  const collisions = [];
  for (const past of history.entries) {
    if (past.slug === spec.slug) continue; // a rebuild of the same day is not a repeat
    const gap = slot - past.slot;
    if (gap <= 0 || gap >= WINDOW_SLOTS) continue;
    if (past.layout === spec.type) {
      collisions.push(`layout "${spec.type}" also used by slot ${past.slot} ${past.slug}, ${gap} slot(s) back`);
    }
    if (past.pillar === spec.pillar) {
      collisions.push(`pillar "${spec.pillar}" also used by slot ${past.slot} ${past.slug}, ${gap} slot(s) back`);
    }
  }
  if (!collisions.length) return;

  if (force) {
    // --force exists for a genuine re-run of a cancelled day, not for pushing a
    // repeat through. It is loud on purpose.
    console.error('WARNING — rotation collision overridden with --force:');
    collisions.forEach((c) => console.error('  ' + c));
    return;
  }
  console.error(`COLLISION — a layout or pillar repeats inside ${WINDOW_SLOTS} publish slots:`);
  collisions.forEach((c) => console.error('  ' + c));
  console.error('Change the layout, change the argument, or pass --force for a genuine re-run.');
  console.error('Nothing was written.');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Layout bodies.
// ---------------------------------------------------------------------------

const esc = (s) => String(s);

function timeline(items) {
  const rows = items.map(([title, desc], i) => {
    const last = i === items.length - 1;
    return `
      <div class="titem${last ? ' last' : ''}">
        <div class="tcol">
          <div class="circle${last ? ' focal' : ''}">${String(i + 1).padStart(2, '0')}</div>
          ${last ? '' : '<div class="tline"></div>'}
        </div>
        <div class="tbody">
          <div class="ttitle${last ? ' focal' : ''}">${esc(title)}</div>
          <div class="tdesc">${esc(desc)}</div>
        </div>
      </div>`;
  }).join('');
  return `    <div class="timeline">${rows}
    </div>`;
}

function cards(items) {
  const boxes = items.map(([eyebrow, title, desc], i) => {
    const last = i === items.length - 1;
    return `
      <div class="card${last ? ' focal' : ''}">
        <div class="ceyebrow">${esc(eyebrow)}</div>
        <div class="ctitle${last ? ' focal' : ''}">${esc(title)}</div>
        <div class="cspacer"></div>
        <div class="cdesc">${esc(desc)}</div>
      </div>`;
  }).join('');
  return `    <div class="cards">${boxes}
    </div>`;
}

function grid(items, band) {
  const cells = items.map(([title, desc]) => `
      <div class="gcell">
        <div class="gx">&times;</div>
        <div class="gtitle">${esc(title)}</div>
        <div class="gdesc">${esc(desc)}</div>
      </div>`).join('');
  return `    <div class="grid">${cells}
    </div>
    <div class="band">${esc(band)}</div>`;
}

function split(items) {
  const cols = items.map(([head, rows], i) => {
    const focal = i === items.length - 1;
    const cells = rows.map((r) => `
        <div class="srow">${esc(r)}</div>`).join('');
    return `
      <div class="scol${focal ? ' focal' : ''}">
        <div class="shead">${esc(head)}</div>
        <div class="srows">${cells}
        </div>
      </div>`;
  }).join('');
  return `    <div class="split">${cols}
    </div>`;
}

function stat(spec) {
  // The figure is the focal element, so the supporting cells stay neutral. Giving the
  // last cell a pink border too pushed a build to four zones.
  const cols = spec.items.map(([label, desc]) => `
      <div class="scell">
        <div class="slabel">${esc(label)}</div>
        <div class="sdesc">${esc(desc)}</div>
      </div>`).join('');
  return `    <div class="statwrap">
      <div class="statbig">${esc(spec.statBig)}</div>
      <div class="statsub">${esc(spec.statSub)}</div>
    </div>
    <div class="statcols">${cols}
    </div>`;
}

function stack(items) {
  const bars = items.map(([label, desc], i) => {
    const last = i === items.length - 1;
    return `
      <div class="bar${last ? ' focal' : ''}">
        <div class="blabel">${esc(label)}</div>
        <div class="bdesc">${esc(desc)}</div>
      </div>`;
  }).join('');
  return `    <div class="stack">${bars}
    </div>`;
}

function renderBody(spec) {
  switch (spec.type) {
    case 'cards': return cards(spec.items);
    case 'grid':  return grid(spec.items, spec.band);
    case 'split': return split(spec.items);
    case 'stat':  return stat(spec);
    case 'stack': return stack(spec.items);
    default:      return timeline(spec.items);
  }
}

const css = (spec) => `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 1080px; height: 1350px; }
  body {
    background: ${C.bg};
    font-family: Arial, Helvetica, sans-serif;
    -webkit-font-smoothing: antialiased;
    overflow: hidden;
  }
  .strip { position: absolute; left: 0; right: 0; bottom: 0; height: 13px; background: ${C.pink}; }
  .content {
    position: absolute; inset: 74px 74px 88px 74px;
    display: flex; flex-direction: column;
  }
  .head { display: flex; align-items: center; justify-content: space-between; }
  .logo svg { width: 306px; height: auto; display: block; }
  .cat { color: ${C.muted}; font-size: 19px; letter-spacing: 0.3em; font-weight: bold; }

  .headline {
    margin-top: 74px;
    font-size: ${spec.headlineSize}px; line-height: 1.06; font-weight: bold;
    color: ${C.white}; letter-spacing: -0.015em;
  }
  .headline em { color: ${C.pink}; font-style: normal; }
  .subhead { margin-top: 30px; font-size: 30px; line-height: 1.4; color: ${C.muted}; max-width: 830px; }

  .timeline { display: flex; flex-direction: column; flex: 1; margin-top: 56px; }
  .titem { display: flex; gap: 30px; flex: 1; }
  .titem.last { flex: none; }
  .tcol { width: 58px; flex: none; display: flex; flex-direction: column; align-items: center; }
  .circle {
    width: 58px; height: 58px; border-radius: 50%; flex: none;
    border: 1px solid ${C.line}; color: ${C.white};
    font-size: 21px; font-weight: bold;
    display: flex; align-items: center; justify-content: center;
  }
  .circle.focal { background: ${C.pink}; border-color: ${C.pink}; }
  .tline { width: 1px; flex: 1; background: ${C.line}; }
  .tbody { padding-top: 4px; padding-bottom: 32px; }
  .ttitle { font-size: 35px; font-weight: bold; color: ${C.white}; }
  .ttitle.focal { color: ${C.pink}; }
  .tdesc { margin-top: 11px; font-size: 25px; color: ${C.muted}; }

  .cards { display: flex; gap: 26px; flex: 1; margin-top: 58px; }
  .card {
    flex: 1; display: flex; flex-direction: column;
    border: 1px solid ${C.cardBorder}; border-radius: 14px;
    background: ${C.cardBg}; padding: 34px 30px;
  }
  .card.focal { border-color: ${C.pink}; background: rgba(220, 32, 86, 0.07); }
  .ceyebrow { font-size: 17px; letter-spacing: 0.11em; font-weight: bold; color: ${C.muted}; }
  .ctitle { margin-top: 22px; font-size: 41px; line-height: 1.12; font-weight: bold; color: ${C.white}; }
  .ctitle.focal { color: ${C.pink}; }
  .cspacer { flex: 1; min-height: 40px; }
  .cdesc { font-size: 23px; line-height: 1.42; color: ${C.muted}; }

  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; flex: 1; margin-top: 48px; }
  .gcell {
    border: 1px solid ${C.cardBorder}; border-radius: 14px; background: ${C.cardBg};
    padding: 30px 28px; display: flex; flex-direction: column;
  }
  .gx { font-size: 42px; line-height: 0.9; font-weight: bold; color: ${C.muted}; }
  .gtitle { margin-top: 18px; font-size: 32px; font-weight: bold; color: ${C.white}; }
  .gdesc { margin-top: 10px; font-size: 23px; line-height: 1.4; color: ${C.muted}; }
  .band {
    margin-top: 24px; background: ${C.pink}; border-radius: 14px;
    padding: 28px 30px; text-align: center;
    color: ${C.white}; font-size: 29px; font-weight: bold; letter-spacing: 0.01em;
  }

  .split { display: flex; gap: 26px; flex: 1; margin-top: 48px; }
  .scol {
    flex: 1; display: flex; flex-direction: column;
    border: 1px solid ${C.cardBorder}; border-radius: 14px;
    background: ${C.cardBg}; padding: 30px 28px;
  }
  .scol.focal { border-color: ${C.pink}; background: rgba(220, 32, 86, 0.07); }
  .shead { font-size: 19px; letter-spacing: 0.2em; font-weight: bold; color: ${C.muted}; }
  .scol.focal .shead { color: ${C.pink}; }
  .srows { display: flex; flex-direction: column; flex: 1; margin-top: 14px; }
  .srow {
    flex: 1; display: flex; align-items: center;
    font-size: 25px; line-height: 1.3; color: ${C.muted};
    border-bottom: 1px solid ${C.cardBorder};
  }
  .srow:last-child { border-bottom: none; }
  .scol.focal .srow { color: ${C.white}; }

  .statwrap {
    flex: 1; display: flex; flex-direction: column;
    align-items: center; justify-content: center; text-align: center;
  }
  .statbig { font-size: 260px; line-height: 0.86; font-weight: bold; color: ${C.pink}; letter-spacing: -0.04em; }
  .statsub { margin-top: 26px; font-size: 30px; line-height: 1.35; color: ${C.muted}; max-width: 640px; }
  .statcols { display: flex; gap: 26px; margin-top: 10px; }
  .scell {
    flex: 1; border: 1px solid ${C.cardBorder}; border-radius: 14px;
    background: ${C.cardBg}; padding: 26px 24px;
  }
  .slabel { font-size: 19px; letter-spacing: 0.16em; font-weight: bold; color: ${C.white}; }
  .sdesc { margin-top: 12px; font-size: 22px; line-height: 1.4; color: ${C.muted}; }

  .stack { display: flex; flex-direction: column; gap: 16px; flex: 1; margin-top: 50px; }
  .bar {
    flex: 1; display: flex; align-items: center; gap: 30px;
    border: 1px solid ${C.cardBorder}; border-radius: 14px;
    background: ${C.cardBg}; padding: 0 30px;
  }
  .bar.focal { border-color: ${C.pink}; background: rgba(220, 32, 86, 0.07); }
  .blabel {
    width: 210px; flex: none;
    font-size: 20px; letter-spacing: 0.16em; font-weight: bold; color: ${C.muted};
  }
  .bar.focal .blabel { color: ${C.pink}; }
  .bdesc { font-size: 27px; line-height: 1.3; color: ${C.white}; }

  .foot {
    margin-top: 40px; padding-top: 28px; border-top: 1px solid ${C.line};
    display: flex; justify-content: space-between; align-items: baseline;
    font-size: 25px; font-weight: bold;
  }
  .foot .take { color: ${C.white}; }
  .foot .site { color: ${C.white}; }
`;

const page = (spec, logo) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${esc(spec.slug)}</title>
<!-- Built by build_post_template.js from ${esc(spec.date)}_spec.json. Self-contained:
     inline CSS, inline SVG logo, no external fetches. -->
<style>${css(spec)}</style></head>
<body>
  <div class="content">
    <div class="head">
      <div class="logo">${logo.trim()}</div>
      <div class="cat">${esc(spec.category)}</div>
    </div>
    <div class="headline">${spec.headline}</div>
    <div class="subhead">${esc(spec.subhead)}</div>
${renderBody(spec)}
    <div class="foot"><span class="take">${esc(spec.footer)}</span><span class="site">${esc(spec.site || 'acme.example')}</span></div>
  </div>
  <div class="strip"></div>
</body></html>
`;

// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const positional = [];
  const opts = { force: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--force') opts.force = true;
    else if (a === '--assets') opts.assets = argv[++i];
    else if (a === '--history') opts.history = argv[++i];
    else if (a === '--slot') opts.slot = Number(argv[++i]);
    else if (a.startsWith('--')) {
      console.error(`unknown option: ${a}`);
      process.exit(2);
    } else positional.push(a);
  }
  return { positional, opts };
}

function main() {
  const { positional, opts } = parseArgs(process.argv.slice(2));
  if (positional.length !== 2) {
    console.error('usage: build_post_template.js <spec.json> <out.html> [--assets <dir>] ' +
                  '[--history <file>] [--slot <n>] [--force]');
    process.exit(2);
  }
  const [specPath, outPath] = positional;

  let spec;
  try {
    spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
  } catch (err) {
    console.error(`cannot read spec ${specPath}: ${err.message}`);
    process.exit(1);
  }

  spec = validate(spec);

  const assetsDir = opts.assets || path.resolve(__dirname, '..', 'assets');
  // acme_logo_12.svg — pink mark, white wordmark — is the default. `11` is the
  // all-white fallback, `04` the symbol only. Never redrawn, recoloured or refetched.
  const logoFile = path.join(assetsDir, spec.logo || 'acme_logo_12.svg');
  if (!fs.existsSync(logoFile)) {
    console.error(`logo not found: ${logoFile}`);
    console.error('The skill was probably copied without its assets/ folder. Re-copy it whole.');
    process.exit(1);
  }
  const logo = fs.readFileSync(logoFile, 'utf8');

  const historyFile = opts.history || path.join(path.dirname(path.resolve(outPath)), 'design_history.json');
  const history = readHistory(historyFile);
  const slot = Number.isFinite(opts.slot)
    ? opts.slot
    : history.entries.reduce((m, e) => Math.max(m, e.slot), 0) + 1;

  checkRotation(spec, history, slot, opts.force);

  fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
  fs.writeFileSync(outPath, page(spec, logo), 'utf8');

  const entry = {
    slot,
    date: spec.date,
    slug: spec.slug,
    layout: spec.type,
    pillar: spec.pillar,
    headline: spec.headline.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
  };
  const entries = history.entries.filter((e) => e.slug !== spec.slug).concat(entry);
  entries.sort((a, b) => a.slot - b.slot);
  fs.writeFileSync(historyFile, JSON.stringify({ windowSlots: WINDOW_SLOTS, entries }, null, 2) + '\n', 'utf8');

  console.log(`built slot ${slot}  ${spec.type.padEnd(9)} ${spec.slug}`);
  console.log(`template: ${outPath}`);
  console.log(`history:  ${historyFile}`);
  console.log('Next: render, THEN validate. The PNG is stale until the render is repeated.');
}

main();
