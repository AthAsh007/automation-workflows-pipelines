// Regenerates ../sheet/seed-bank.csv from the live draft bank.
//
//   node export_bank.js [path/to/drafts]
//
// The bank is the workflow's content source: one row per post, exactly the fields the
// "build the HTML template" node reads. It is exported rather than retyped so the n8n
// workflow and the drafts repo cannot drift into two different versions of a headline.
//
// Default source: templates/linkdin-drafts (build.js for the layout fields,
// <slug>/caption.txt for the caption).

const fs = require('fs');
const path = require('path');

const DRAFTS = process.argv[2] || path.resolve(
  __dirname, '..', '..', '..', 'linkdin-drafts');
const BUILD_JS = path.join(DRAFTS, 'render', 'build.js');
const OUT = path.resolve(__dirname, '..', 'sheet', 'seed-bank.csv');

// build.js writes files and calls process.exit on collision, so it cannot be required.
// Take the POSTS literal out of the source and evaluate only that.
const src = fs.readFileSync(BUILD_JS, 'utf8');
const start = src.indexOf('const POSTS = [');
const end = src.indexOf('\n];', start);
if (start < 0 || end < 0) throw new Error('POSTS array not found in ' + BUILD_JS);
const POSTS = eval(src.slice(start + 'const POSTS = '.length, end + 3)); // eslint-disable-line no-eval

const COLUMNS = ['Slot', 'Slug', 'Pillar', 'Category', 'Headline', 'Headline size', 'Subhead',
  'Layout', 'Items', 'Band', 'Stat big', 'Stat sub', 'Footer', 'Caption', 'State'];

function caption(slug) {
  const f = path.join(DRAFTS, 'acme', slug, 'caption.txt');
  return fs.existsSync(f) ? fs.readFileSync(f, 'utf8').trim() : '';
}

function cell(v) {
  const s = v === undefined || v === null ? '' : String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

// Slots 1-8 are published. They must never be drafted again, so they are exported as
// `posted` — the state machine skips them and the row stays as the record of what went out.
const LIVE_THROUGH = 8;

const rows = [...POSTS].sort((a, b) => a.slot - b.slot).map((p) => [
  p.slot, p.slug, p.pillar, p.category, p.headline, p.headlineSize, p.subhead, p.type,
  JSON.stringify(p.items), p.band || '', p.statBig || '', p.statSub || '', p.footer,
  caption(p.slug), p.slot <= LIVE_THROUGH ? 'posted' : 'ready',
]);

const csv = [COLUMNS, ...rows].map((r) => r.map(cell).join(',')).join('\n') + '\n';
fs.writeFileSync(OUT, csv, 'utf8');

const missing = rows.filter((r) => !r[13]).map((r) => r[1]);
console.log(rows.length + ' posts -> ' + OUT);
if (missing.length) console.log('no caption.txt for: ' + missing.join(', '));
