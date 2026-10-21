// Run the workflows' logic outside n8n, against the real bank and the demo data.
//
//   bun simulate.js            every check
//   bun simulate.js --render   also screenshot slot 9 with Chrome
//
// n8n is shimmed rather than mocked: the Code node bodies are read from js/ (with their
// `// @include lib/...` lines expanded exactly as build.mjs expands them) and run as written,
// with $json, $, items and $binary supplied. Nothing here is a second copy of the logic.
//
// What is proved, roughly in order of how much it matters:
//   * the approval gate refuses everything it should, including the new `edit` path
//   * an approved draft is frozen; an edit is never published, only re-delivered
//   * the log's open/closed rule — the old "every awaiting row is open" rule deadlocked on day 2
//   * topic rotation, the caption rules, the one rewrite with failures fed back
//   * a rejected LinkedIn token is caught before anything publishes, and alerted once
//   * the weekly report, the quiet idle polls
//   * both demo paths run end to end with no credentials

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const HERE = __dirname;
const JS = path.join(HERE, 'js');
const DRAFTS = [
  path.resolve(HERE, '..', '..', '..', '..', 'linkdin-drafts'),
  path.resolve(HERE, '..', '..', '..', '..', 'workspace', 'tutorials', 'scripts', 'drafts')
].find((p) => fs.existsSync(path.join(p, 'render', 'build.js')));

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

let pass = 0;
let fail = 0;
const failures = [];
function ok(cond, label, detail) {
  if (cond) { pass++; console.log('  ok   ' + label); }
  else {
    fail++; failures.push(label + (detail ? '\n       ' + detail : ''));
    console.log('  FAIL ' + label + (detail ? '\n       ' + detail : ''));
  }
}

// ---------------------------------------------------------------------- the n8n shim
function source(file) {
  return fs.readFileSync(path.join(JS, file), 'utf8')
    .replace(/^\/\/ @include (\S+)\s*$/gm, (_, f) => fs.readFileSync(path.join(JS, f), 'utf8'));
}
async function run(file, { json = {}, items = null, nodes = {}, binary = {} } = {}) {
  const src_items = items && items.length ? items : [{ json }];
  const list = src_items.map((i) => (i && i.json !== undefined ? i : { json: i }));
  const $ = (name) => {
    if (!(name in nodes)) throw new Error('the node reference $(\'' + name + '\') is not wired in this simulation (' + file + ')');
    const v = nodes[name];
    const arr = Array.isArray(v) ? v : [v];
    return { first: () => ({ json: arr[0] }), all: () => arr.map((j) => ({ json: j })) };
  };
  const fn = new AsyncFunction('$json', '$', 'items', '$binary', '$input', 'btoa', 'helpers', source(file));
  const ctx = { helpers: { getBinaryDataBuffer: async (_i, key) => binary[key] && binary[key]._buffer } };
  return fn.call(ctx, list[0].json, $, list, binary,
    { all: () => list, first: () => list[0] },
    (s) => Buffer.from(s, 'utf8').toString('base64'), ctx.helpers);
}
const one = async (file, opts) => (await run(file, opts))[0].json;

async function config(overrides = {}) {
  let src = fs.readFileSync(path.join(JS, 'config.js'), 'utf8');
  for (const [k, v] of Object.entries(overrides)) {
    const re = new RegExp('^const ' + k + '\\s*=\\s*[^;]+;', 'm');
    if (!re.test(src)) throw new Error('no such config constant: ' + k);
    src = src.replace(re, 'const ' + k + ' = ' + JSON.stringify(v) + ';');
  }
  return (await new AsyncFunction(src)())[0].json;
}

function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (c !== '\r') cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const head = rows.shift();
  return rows.filter((r) => r.some((c) => c !== ''))
    .map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] === undefined ? '' : r[i]])));
}
const bankRows = parseCsv(fs.readFileSync(path.join(HERE, '..', 'sheet', 'seed-bank.csv'), 'utf8'));
const LOGO = DRAFTS ? fs.readFileSync(path.join(DRAFTS, 'render', 'manexus_logo_12.svg'), 'utf8') : '<svg></svg>';

const fpOf = (s) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return ('0000000' + h.toString(16)).slice(-8);
};
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const hoursAgo = (h) => new Date(Date.now() - h * 3600000).toISOString();

async function main() {
  const cfg = await config({});
  const L = cfg.log_columns;
  const logRow = (o) => {
    const r = {};
    for (const k of Object.keys(L)) r[L[k]] = o[k] === undefined ? '' : o[k];
    return r;
  };

  // -------------------------------------------------------------------- 1
  console.log('\n=== 1. the bank loads ===');
  ok(bankRows.length === 16, 'seed-bank.csv holds 16 posts', 'got ' + bankRows.length);
  ok(bankRows.every((r) => r.Caption.trim()), 'every row carries a caption');
  ok(bankRows.filter((r) => r.State === 'posted').length === 8, 'slots 1-8 are marked posted');

  // -------------------------------------------------------------------- 2
  console.log('\n=== 2. the HTML matches render/build.js byte for byte ===');
  const cfgWithLogo = await config({ LOGO_SVG: LOGO });
  if (!DRAFTS) {
    console.log('  skip (render/build.js not found beside this repo)');
  } else {
    const buildSrc = fs.readFileSync(path.join(DRAFTS, 'render', 'build.js'), 'utf8');
    const start = buildSrc.indexOf('function timeline(');
    const end = buildSrc.indexOf('// ---------------------------------------------------------------------------', start);
    let ref = null;
    try {
      ref = new Function('LOGO', 'C', 'fs', 'path', buildSrc.slice(start, end) + '\nreturn { html };')(LOGO.trim(), {
        bg: '#050505', pink: '#DC2056', white: '#FFFFFF', muted: '#A8A8A8',
        line: '#303030', cardBorder: '#262626', cardBg: '#0B0B0B'
      }, fs, path);
    } catch (e) { console.log('  skip (render/build.js has changed shape: ' + e.message + ')'); }
    if (ref) {
      let matched = 0;
      const mismatches = [];
      for (const r of bankRows) {
        const post = { slot: Number(r.Slot), slug: r.Slug, pillar: r.Pillar, category: r.Category,
          headline: r.Headline, headline_size: Number(r['Headline size']), subhead: r.Subhead,
          layout: r.Layout, items: JSON.parse(r.Items || '[]'), band: r.Band,
          stat_big: r['Stat big'], stat_sub: r['Stat sub'], footer: r.Footer };
        const mine = (await one('build-the-html-template.js', { json: post, nodes: { config: cfgWithLogo } }))._html;
        const theirs = ref.html({ slot: post.slot, slug: post.slug, pillar: post.pillar, category: post.category,
          headline: post.headline, headlineSize: post.headline_size, subhead: post.subhead,
          type: post.layout, items: post.items, band: post.band, statBig: post.stat_big,
          statSub: post.stat_sub, footer: post.footer });
        if (mine === theirs) matched++;
        else {
          let at = 0;
          while (at < mine.length && mine[at] === theirs[at]) at++;
          mismatches.push(post.slug + ' diverges at byte ' + at);
        }
      }
      ok(matched === bankRows.length, 'all ' + bankRows.length + ' posts render identical HTML in both implementations',
        mismatches.slice(0, 2).join('; '));
    }
  }

  // -------------------------------------------------------------------- 3
  console.log('\n=== 3. picking: slot guards and date-based topic rotation ===');
  const state = { _today: '2026-09-02', _weekday: 3, _weekday_name: 'Wed', _posted_slugs: [], _posted_history: [], _recent_hooks: [] };
  async function pick(rows, st = state, over = {}) {
    const c = await config(Object.assign({ SHEET_ID: 'sim' }, over));
    return one('pick-todays-post.js', { items: rows.map((json) => ({ json })),
      nodes: { config: c, 'resolve todays state': Object.assign({}, state, st) } });
  }
  const ready = bankRows.map((r) => Object.assign({}, r, { State: 'ready' }));
  const after8 = ready.map((r) => (Number(r.Slot) <= 8 ? Object.assign({}, r, { State: 'posted' }) : r));
  const normal = await pick(after8);
  ok(normal._has_post && normal.slot === 9, 'the next ready slot is chosen (slot ' + normal.slot + ')');
  ok(normal._writer === 'bank', 'a row with a caption is written by the bank, never the model');

  const clash = after8.map((r) => (Number(r.Slot) === 9 ? Object.assign({}, r, { Layout: bankRows[9].Layout }) : r));
  ok(((await pick(clash))._holds || []).some((h) => h.reasons.some((x) => x.includes('layout'))), 'a layout repeat inside the slot window holds the post');
  const pclash = after8.map((r) => (Number(r.Slot) === 9 ? Object.assign({}, r, { Pillar: bankRows[9].Pillar }) : r));
  ok(((await pick(pclash))._holds || []).some((h) => h.reasons.some((x) => x.includes('pillar'))), 'a pillar repeat inside the slot window holds the post');
  const design = ready.map((r) => (Number(r.Slot) <= 9 ? Object.assign({}, r, { State: 'posted' })
    : Number(r.Slot) === 10 ? Object.assign({}, r, { Pillar: 'Design process, prototyping' }) : r));
  ok(((await pick(design))._holds || []).some((h) => h.reasons.some((x) => x.includes('Thursday'))), 'a Design process post is held on a Wednesday');
  ok((await pick(design, { _today: '2026-09-03', _weekday: 4, _weekday_name: 'Thu' })).slot === 10, 'the same post goes out on a Thursday');
  const broken = after8.map((r) => (Number(r.Slot) === 9 ? Object.assign({}, r, { Items: '[[unclosed' }) : r));
  ok(((await pick(broken))._holds || []).some((h) => h.reasons.some((x) => x.includes('not valid JSON'))), 'a malformed Items cell holds the row');
  ok(!(await pick(bankRows.map((r) => Object.assign({}, r, { State: 'posted' }))))._has_post, 'an exhausted bank stops instead of repeating a post');

  // date-based: slot 9's pillar went out 10 days ago, by hand or from a reordered bank
  const cool = await pick(after8, { _posted_history: [{ date: '2026-08-23', slug: 'hand-post', pillar: bankRows[8].Pillar }] });
  ok(cool.slot !== 9 && (cool._holds || []).some((h) => h.slot === 9 && h.reasons.some((x) => x.includes('TOPIC_COOLDOWN_DAYS'))),
    'a pillar published 10 days ago (TOPIC_COOLDOWN_DAYS 21) is held, the next row is picked');
  const coolOff = await pick(after8, { _posted_history: [{ date: '2026-08-01', slug: 'hand-post', pillar: bankRows[8].Pillar }] });
  ok(coolOff.slot === 9, 'the same pillar 32 days ago is allowed again');
  const fam = await pick(after8, { _posted_history: [
    { date: '2026-09-01', slug: 'a', pillar: 'AI workflow, intake' },
    { date: '2026-08-31', slug: 'b', pillar: 'AI workflow, billing' }] });
  ok(fam.slot !== 9 && (fam._holds || []).some((h) => h.reasons.some((x) => x.includes('FAMILY_MAX_PER_WEEK'))),
    'a third "AI workflow" post inside 7 days is held (FAMILY_MAX_PER_WEEK 2)');
  const blank = after8.map((r) => (Number(r.Slot) === 9 ? Object.assign({}, r, { Caption: '' }) : r));
  ok((await pick(blank))._writer === 'none', 'a blank caption with no model configured has no writer');
  ok((await pick(blank, state, { LLM_API_KEY: 'k' }))._writer === 'model', 'a blank caption with a model configured is written by the model');

  // -------------------------------------------------------------------- 4
  console.log('\n=== 4. the state machine reads open drafts, not awaiting rows ===');
  const tz = 'UTC';
  async function resolve(rows, over = {}) {
    const c = await config(Object.assign({ TIMEZONE: tz, SHEET_ID: 'sim' }, over));
    return one('resolve-todays-state.js', { items: rows.map((json) => ({ json })), nodes: { config: c } });
  }
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
  const isWeekday = [1, 2, 3, 4, 5].includes(({ Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 })[
    new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short' }).format(new Date())]);
  const open = (d, id, h = 1, extra = {}) => logRow(Object.assign({ date: d, slug: 's' + id, status: 'awaiting', message_id: id, at: hoursAgo(h) }, extra));
  const close = (d, id, status, h = 0.5, extra = {}) => logRow(Object.assign({ date: d, slug: 's' + id, status, message_id: id, at: hoursAgo(h) }, extra));

  ok((await resolve([]))._draftable === isWeekday, 'an empty log drafts on a weekday');
  ok(!(await resolve([open(today, '1'), close(today, '1', 'posted')]))._draftable, 'a posted row today is silent');
  ok(!(await resolve([open(today, '1')]))._draftable, 'an open draft is silent');
  ok((await resolve([open(today, '1', 2), close(today, '1', 'cancelled')]))._draftable === isWeekday,
    'awaiting THEN cancelled today drafts again — the old rule saw the awaiting row and stayed silent');
  ok(!(await resolve([open(daysAgo(1), '1', 10)]))._draftable, 'yesterday\'s draft still open (10h) keeps today silent');
  ok((await resolve([open(daysAgo(1), '1', 30)]))._draftable === isWeekday, 'a draft past APPROVAL_EXPIRES_HOURS does not block today');
  ok((await resolve([open(daysAgo(1), '1', 26), close(daysAgo(1), '1', 'posted', 25)]))._draftable === isWeekday,
    'an old posted row does not silence today (no cascade rule)');
  const hooks = await resolve([open(daysAgo(3), '1', 75, { hook: 'An old hook.' }), close(daysAgo(3), '1', 'posted', 74, { hook: 'An old hook.', pillar: 'P' })]);
  ok(hooks._recent_hooks.length === 1 && hooks._posted_history[0].pillar === 'P', 'published hooks and pillars are carried for rotation and the hook check');

  // -------------------------------------------------------------------- 5
  console.log('\n=== 5. the caption rules ===');
  async function caption(text, recent = [], over = {}) {
    const c = await config(over);
    return one('apply-the-caption.js', { json: {}, nodes: { config: c,
      'pick todays post': { _caption: text, _writer: 'bank', slot: 9, slug: 's' },
      'resolve todays state': { _recent_hooks: recent } } });
  }
  const readyCaptions = bankRows.filter((r) => r.State !== 'posted').map((r) => r.Caption);
  const results = await Promise.all(readyCaptions.map((t) => caption(t)));
  ok(results.every((r) => r._caption_ok), 'every ready caption in the real bank passes all the rules',
    JSON.stringify(results.filter((r) => !r._caption_ok).map((r) => r._problems)).slice(0, 300));
  for (const r of cfg.demo_bank.filter((p) => p.caption)) {
    const d = await caption(r.caption);
    ok(d._caption_ok, 'demo bank caption "' + r.slug + '" passes', JSON.stringify(d._problems));
  }
  // The CSV keeps Windows line endings inside quoted cells; a sheet returns plain \n.
  const good = bankRows[8].Caption.replace(/\r\n/g, '\n');
  ok(!(await caption('too short. #a #b #c #d'))._caption_ok, 'a short caption is held');
  ok(!(await caption(good + ' This is a game changer.'))._caption_ok, 'a banned phrase is held, not edited out');
  const link = await caption(good.replace('\n\n', '\n\nRead more at https://example.com/x\n\n'));
  ok(!link._caption_ok && link._problems.some((p) => p.includes('link')), 'a link in the body is held');
  const mid = await caption(good.replace('\n\n', ' #Midline\n\n'));
  ok(!mid._caption_ok && mid._problems.some((p) => p.includes('last line')), 'a hashtag mid-caption is held');
  const at = await caption(good.replace('\n\n', ' Thanks @someone.\n\n'));
  ok(!at._caption_ok && at._problems.some((p) => p.includes('@mention')), 'a typed @mention is held');
  const firstLine = good.split('\n')[0];
  const rep = await caption(good, [{ hook: firstLine.split('.')[0] + '.', slug: 'old', date: '2026-08-01' }]);
  ok(!rep._caption_ok && rep._problems.some((p) => p.includes('repeats the hook')), 'an opening line that repeats a recent hook is held');
  ok((await caption(good, [{ hook: 'Launch day is the cheapest day in an automation\'s life.', slug: 'x', date: 'd' }]))._caption_ok,
    'an unrelated recent hook does not trip it');
  ok((await caption(good))._caption_fp.length === 8, 'the caption fingerprint is 8 hex chars');
  ok(!(await caption(good))._rewrite_allowed, 'a failing BANK caption is never offered a rewrite');

  // -------------------------------------------------------------------- 6
  console.log('\n=== 6. one rewrite, with the failures fed back ===');
  const demoCfg = await config({});
  const demoLog = (await run('load-the-demo-log-01.js', { nodes: { config: demoCfg } }));
  const demoState = await one('resolve-todays-state.js', { items: demoLog, nodes: { config: demoCfg } });
  ok(demoState._draftable, 'the demo log leaves today draftable, on any weekday', demoState._reason);
  const demoPick = await one('pick-todays-post.js', { json: demoState, nodes: { config: demoCfg, 'resolve todays state': demoState } });
  ok(demoPick.slot === 2 && demoPick._holds.some((h) => h.slot === 1 && h.reasons[0].includes('TOPIC_COOLDOWN_DAYS')),
    'demo: slot 1 is held by topic rotation, slot 2 is picked', JSON.stringify(demoPick._holds));
  ok(demoPick._writer === 'demo', 'demo: slot 2 has no caption, so the demo writer writes it');
  const firstDraft = await one('demo-writer-first-draft.js', {});
  const applied = await one('apply-the-caption.js', { json: firstDraft,
    nodes: { config: demoCfg, 'pick todays post': demoPick, 'resolve todays state': demoState } });
  const want = ['repeats the hook', 'link', 'banned phrase', 'hashtags'];
  ok(!applied._caption_ok && want.every((w) => applied._problems.some((p) => p.includes(w))),
    'demo: the first draft fails on hook, link, banned phrase and hashtag count', JSON.stringify(applied._problems));
  ok(applied._rewrite_allowed, 'a failing MODEL caption is offered one rewrite');
  const brief = await one('build-the-rewrite-brief.js', { json: applied, nodes: { config: demoCfg } });
  const lastTurn = brief._rewrite_messages[3].content;
  ok(brief._rewrite_messages.length === 4 && brief._rewrite_messages[2].role === 'assistant'
    && applied._problems.every((p) => lastTurn.includes(p)), 'the rewrite brief carries the failed caption and every failure');
  const rewrite = await one('demo-writer-rewrite.js', {});
  const checked = await one('check-the-rewrite.js', { json: rewrite,
    nodes: { config: demoCfg, 'build the rewrite brief': brief, 'resolve todays state': demoState } });
  ok(checked._caption_ok && checked._rewritten && checked._fixed.length === applied._problems.length,
    'demo: the rewrite passes the same rules and records what it fixed', JSON.stringify(checked._problems));
  const stillBad = await one('check-the-rewrite.js', { json: firstDraft,
    nodes: { config: demoCfg, 'build the rewrite brief': brief, 'resolve todays state': demoState } });
  ok(!stillBad._caption_ok && stillBad._problems.some((p) => p.startsWith('after the rewrite'))
    && stillBad._problems.some((p) => p.startsWith('first draft')), 'a rewrite that still fails is held with both lists of failures');
  const noRewrite = await one('apply-the-caption.js', { json: firstDraft,
    nodes: { config: await config({ REWRITE_ATTEMPTS: 0 }), 'pick todays post': demoPick, 'resolve todays state': demoState } });
  ok(!noRewrite._rewrite_allowed, 'REWRITE_ATTEMPTS = 0 holds straight away');

  // demo 01 continues through the image half
  const html = await one('build-the-html-template.js', { json: checked, nodes: { config: demoCfg } });
  const lay = await one('validate-the-layout.js', { json: html, nodes: { config: demoCfg } });
  ok(lay._layout_ok, 'demo: the chosen post passes the layout check in preview (blank logo is a warning there)', JSON.stringify(lay._issues));
  const msg = await one('build-the-approval-message.js', { json: Object.assign({}, lay, { _png_bytes: 90000 }), nodes: { config: demoCfg } });
  ok(msg._message_ok && msg._message.endsWith(demoCfg.approval_instruction), 'demo: the approval message fits and ends with the instruction');

  // -------------------------------------------------------------------- 7
  console.log('\n=== 7. the layout validator and the PNG check ===');
  async function layout(over, c = cfgWithLogo) {
    const r = bankRows[8];
    const post = Object.assign({ slot: 9, slug: r.Slug, pillar: r.Pillar, category: r.Category, headline: r.Headline,
      headline_size: Number(r['Headline size']), subhead: r.Subhead, layout: r.Layout, items: JSON.parse(r.Items),
      band: r.Band, stat_big: r['Stat big'], stat_sub: r['Stat sub'], footer: r.Footer }, over);
    const built = await one('build-the-html-template.js', { json: post, nodes: { config: c } });
    return one('validate-the-layout.js', { json: built, nodes: { config: c } });
  }
  ok((await layout({}))._layout_ok, 'a real bank row passes the layout check', JSON.stringify((await layout({}))._issues));
  ok(!(await layout({ headline: 'A VERY LONG HEADLINE THAT WILL NOT FIT ON ONE LINE AT ALL EVER' }))._layout_ok, 'a headline too wide for the box is caught');
  ok(!(await layout({ items: [['title', '']] }))._layout_ok, 'an empty field is caught');
  const grids = bankRows.filter((r) => r.Layout === 'grid');
  const gridRes = await Promise.all(grids.map((r) => layout({ slot: Number(r.Slot), slug: r.Slug, category: r.Category,
    headline: r.Headline, headline_size: Number(r['Headline size']), subhead: r.Subhead, layout: 'grid',
    items: JSON.parse(r.Items), band: r.Band, footer: r.Footer })));
  ok(grids.length > 0 && gridRes.every((g) => g._layout_ok),
    'every grid row passes — the band is the grid\'s focal element (it used to hold all ' + grids.length + ')',
    JSON.stringify(gridRes.map((g) => g._issues)));
  const deliverNoLogo = await layout({}, await config({ TEST_CHANNEL_ID: '123' }));
  ok(!deliverNoLogo._layout_ok && deliverNoLogo._issues.some((i) => i.includes('LOGO_SVG')),
    'a blank LOGO_SVG blocks the render once a draft would actually be delivered');
  function png(w, h, size) {
    const b = Buffer.alloc(Math.max(size, 24));
    b.write('\x89PNG\r\n\x1a\n', 0, 'binary');
    b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20);
    return b;
  }
  const checkPng = (buf) => one('check-the-png.js', { json: {}, binary: buf ? { data: { _buffer: buf, mimeType: 'image/png' } } : {},
    nodes: { config: cfg, 'build the render request': { slug: 's' } } });
  ok((await checkPng(png(2160, 2700, 90000)))._png_ok, 'a real 2160x2700 render passes');
  ok(!(await checkPng(png(2160, 2700, 1000)))._png_ok, 'a 1 KB PNG is rejected');
  ok(!(await checkPng(png(1080, 1350, 90000)))._png_ok, 'the wrong dimensions are rejected');
  ok(!(await checkPng(Buffer.from('<html>error</html>')))._png_ok, 'an HTML error page with a 200 is rejected');
  ok(!(await checkPng(null))._png_ok, 'no binary at all is rejected');

  // -------------------------------------------------------------------- 8
  console.log('\n=== 8. finding the open draft ===');
  const live = await config({ SHEET_ID: 'sim' });
  const find = async (rows) => one('find-the-pending-draft.js', { items: rows.map((json) => ({ json })), nodes: { config: live } });
  ok((await find([]))._draft_state === 'none', 'an empty log has nothing open');
  const day2 = await find([open(daysAgo(1), '1', 26), close(daysAgo(1), '1', 'posted', 25), open(today, '2', 1)]);
  ok(day2._draft_state === 'open' && day2._message_id === '2',
    'day 2: yesterday\'s closed draft is not a conflict — the old rule counted both awaiting rows and deadlocked');
  ok((await find([open(today, '1', 30)]))._draft_state === 'expired', 'an open draft past APPROVAL_EXPIRES_HOURS is expired, not published');
  ok((await find([open(today, '1', 2), open(today, '2', 1)]))._draft_state === 'conflict', 'two live open drafts are a conflict, and neither is read');
  const sup = await find([open(today, '1', 2), close(today, '1', 'superseded', 1), open(today, '9', 1)]);
  ok(sup._draft_state === 'open' && sup._message_id === '9', 'after an accepted edit, only the revised draft is open');
  const ann = await find([open(today, '1', 3), logRow({ date: today, slug: 's1', status: 'edit-refused', message_id: '1', reply_id: '55', at: hoursAgo(2) }),
    logRow({ date: today, slug: 's1', status: 'alert', message_id: '1', at: hoursAgo(1) })]);
  ok(ann._draft_state === 'open' && ann._handled_reply_ids.includes('55') && ann._last_alert_at,
    'edit-refused and alert rows annotate the draft without closing it');

  // -------------------------------------------------------------------- 9
  console.log('\n=== 9. the approval gate ===');
  const BOT = { id: 'bot-1', username: 'approvals', bot: true };
  const HUMAN = { id: 'human-1', username: 'reviewer', bot: false };
  const OTHERBOT = { id: 'bot-2', username: 'other', bot: true };
  const draftCaption = 'caption';
  const draftMsg = { id: '100', author: BOT, content: draftCaption + '\n\n' + cfg.approval_instruction,
    attachments: [{ url: 'https://cdn/x.png', filename: 'x.png', content_type: 'image/png', size: 90000 }] };
  const pending = { _draft_state: 'open', _message_id: '100', _channel_id: 'c', _slug: 's', _date: today,
    _caption_fp: fpOf(draftCaption), _handled_reply_ids: [], _recent_hooks: [] };
  const gate = async (msgs, p = pending) => one('read-the-approval-reply.js', {
    items: [draftMsg, ...msgs].map((json) => ({ json })), nodes: { config: cfg, 'find the pending draft': p } });
  const H = (id, content, author = HUMAN) => ({ id, author, content });

  ok((await gate([]))._decision === 'wait', 'no reply -> wait');
  ok((await gate([H('101', 'post')]))._decision === 'post', 'a human replying "post" -> post');
  ok((await gate([H('101', 'POST')]))._decision === 'post', 'matching is case-insensitive');
  ok((await gate([H('101', 'post', BOT)]))._decision === 'wait', 'THE BOT CANNOT APPROVE ITS OWN DRAFT');
  ok((await gate([H('101', 'post', OTHERBOT)]))._decision === 'wait', 'another bot cannot approve');
  ok((await gate([H('101', 'post please')]))._decision === 'wait', '"post please" does not approve');
  ok((await gate([H('101', 'do not post')]))._decision === 'wait', '"do not post" DOES NOT APPROVE');
  ok((await gate([H('99', 'post')]))._decision === 'wait', 'a message from before the draft cannot approve it');
  ok((await gate([H('101', 'cancel'), H('102', 'post')]))._decision === 'cancel', 'a cancel is not reopened by a later approval');
  ok((await gate([H('101', 'looks good'), H('102', 'post')]))._decision === 'post', 'chatter is ignored, not treated as a decision');
  const ed = await gate([H('101', 'Edit\nNew caption text\n\n#A #B')]);
  ok(ed._decision === 'edit' && ed._edit_text === 'New caption text\n\n#A #B' && ed._reply_id === '101', 'an edit carries the new caption and its reply id');
  ok((await gate([H('101', 'edit')]))._decision === 'wait', '"edit" with nothing under it is not a decision');
  ok((await gate([H('101', 'edit\nnew text', OTHERBOT)]))._decision === 'wait', 'another bot cannot edit');
  ok((await gate([H('101', 'please edit\nnew text')]))._decision === 'wait', 'the edit word must be the whole first line');
  const skip = await gate([H('101', 'edit\nbad text'), H('102', 'post')], Object.assign({}, pending, { _handled_reply_ids: ['101'] }));
  ok(skip._decision === 'post', 'a refused edit already answered is skipped, and a later post still approves the original');
  ok((await gate([H('101', 'post')]))._draft_message.id === '100', 'the draft message travels with the decision');

  // -------------------------------------------------------------------- 10
  console.log('\n=== 10. the approved draft is frozen ===');
  const frozen = async (msg, fp) => one('the-approved-draft.js', { json: Object.assign({}, pending, {
    _caption_fp: fp, _decision: 'post', _approver: 'reviewer', _draft_message: msg }), nodes: { config: cfg } });
  ok((await frozen(draftMsg, fpOf(draftCaption)))._publishable, 'an untouched draft with its image is publishable');
  ok(!(await frozen(draftMsg, 'deadbeef'))._publishable, 'an EDITED caption is refused — the fingerprint no longer matches');
  ok(!(await frozen(Object.assign({}, draftMsg, { edited_timestamp: '2026-09-02T10:00:00Z' }), fpOf(draftCaption)))._publishable, 'a message Discord marks as edited is refused');
  ok(!(await frozen(Object.assign({}, draftMsg, { attachments: [] }), fpOf(draftCaption)))._publishable, 'a draft whose image is gone is refused');

  // -------------------------------------------------------------------- 11
  console.log('\n=== 11. an edit is checked and re-delivered, never published ===');
  const demoMsgs = await run('load-the-demo-channel.js', { nodes: { config: await config({ DEMO_REPLY: 'edit' }) } });
  const demoPending = await one('find-the-pending-draft.js', { items: await run('load-the-demo-log-02.js', { nodes: { config: demoCfg } }), nodes: { config: demoCfg } });
  ok(demoPending._draft_state === 'open', 'demo: the demo log has exactly one open draft', demoPending._reason);
  const demoEdit = await one('read-the-approval-reply.js', { items: demoMsgs, nodes: { config: demoCfg, 'find the pending draft': demoPending } });
  ok(demoEdit._decision === 'edit' && demoEdit._ignored.some((x) => x.includes('another bot')) && demoEdit._ignored.some((x) => x.includes('not a decision')),
    'demo: the reviewer\'s edit is the decision; the other bot and the chatter are ignored');
  const ce = await one('check-the-edited-caption.js', { json: demoEdit, nodes: { config: demoCfg } });
  ok(ce._edit_ok && ce._message.endsWith(demoCfg.approval_instruction) && ce._image_url, 'a clean edit passes and is rebuilt as a new draft with the original image', JSON.stringify(ce._problems));
  const revRows = (await run('rows-for-the-revision.js', { json: { id: '200' }, nodes: { config: demoCfg, 'check the edited caption': ce } })).map((i) => i.json);
  ok(revRows.length === 2 && revRows[0][L.status] === 'superseded' && revRows[0][L.message_id] === demoPending._message_id
    && revRows[1][L.status] === 'awaiting' && revRows[1][L.message_id] === '200' && revRows[1][L.caption_fp] === ce._caption_fp,
    'an accepted edit closes the old draft (superseded) and opens the new message with the new fingerprint');
  const afterRev = await find([open(today, demoPending._message_id, 1), ...revRows]);
  ok(afterRev._draft_state === 'open' && afterRev._message_id === '200', 'the next poll anchors on the revised draft');
  const revisedApproval = await one('the-approved-draft.js', { json: Object.assign({}, afterRev, { _decision: 'post',
    _draft_message: { id: '200', author: { id: 'bot' }, content: ce._message, attachments: draftMsg.attachments } }), nodes: { config: cfg } });
  ok(revisedApproval._publishable && revisedApproval._caption === ce._caption, 'approving the revised draft publishes exactly the edited text');
  const noRev = await run('rows-for-the-revision.js', { json: {}, nodes: { config: demoCfg, 'check the edited caption': ce } });
  ok(noRev.length === 1 && !noRev[0].json[L.status], 'a revision Discord did not confirm closes nothing');

  const badMsgs = await run('load-the-demo-channel.js', { nodes: { config: await config({ DEMO_REPLY: 'bad-edit' }) } });
  const badEdit = await one('read-the-approval-reply.js', { items: badMsgs, nodes: { config: demoCfg, 'find the pending draft': demoPending } });
  const bce = await one('check-the-edited-caption.js', { json: badEdit, nodes: { config: demoCfg } });
  ok(!bce._edit_ok && ['words', 'link', 'last line'].every((w) => bce._problems.some((p) => p.includes(w))) && bce._refusal_message.includes('still open'),
    'a bad edit is refused with every reason, and the reply says the original is still open', JSON.stringify(bce._problems));
  const refusedRow = await one('row-for-the-refused-edit.js', { json: {}, nodes: { config: demoCfg, 'check the edited caption': bce } });
  ok(refusedRow[L.status] === 'edit-refused' && refusedRow[L.reply_id] === badEdit._reply_id, 'the refusal is logged with the edit\'s reply id');
  const stillOpen = await find([open(today, demoPending._message_id, 1), refusedRow]);
  ok(stillOpen._draft_state === 'open' && stillOpen._handled_reply_ids.includes(badEdit._reply_id), 'after a refusal the original is still open and the edit will not be answered twice');

  for (const reply of ['post', 'cancel']) {
    const m = await run('load-the-demo-channel.js', { nodes: { config: await config({ DEMO_REPLY: reply }) } });
    const d = await one('read-the-approval-reply.js', { items: m, nodes: { config: demoCfg, 'find the pending draft': demoPending } });
    ok(d._decision === reply, 'demo: DEMO_REPLY = ' + reply + ' reaches the ' + reply + ' branch');
    if (reply === 'post') {
      const fr = await one('the-approved-draft.js', { json: d, nodes: { config: demoCfg } });
      ok(fr._publishable, 'demo: the demo draft is intact, so preview ends at STOP: not published', JSON.stringify(fr._problems));
    }
  }

  // -------------------------------------------------------------------- 12
  console.log('\n=== 12. LinkedIn: token problems are caught before anything publishes ===');
  const reg = (res) => one('read-the-upload-registration.js', { json: res });
  const okReg = await reg({ statusCode: 200, body: { value: { uploadUrl: 'https://up', image: 'urn:li:image:1' } } });
  ok(okReg._registered && okReg._image_urn === 'urn:li:image:1', 'a registered upload carries the upload URL and image URN');
  ok((await reg({ statusCode: 401, body: { status: 401, code: 'EXPIRED_ACCESS_TOKEN', message: 'The token used in the request has expired' } }))._kind === 'token',
    'EXPIRED_ACCESS_TOKEN is recognised as a token problem — the failure that actually happened');
  ok((await reg({ statusCode: 401, body: {} }))._kind === 'token', 'a bare 401 is a token problem');
  ok((await reg({ statusCode: 403, body: { message: 'Not enough permissions' } }))._kind === 'permission', 'a 403 is a permission problem, not a token one');
  ok((await reg({ statusCode: 426, body: {} }))._kind === 'version', 'a 426 names the retired LinkedIn-Version');
  const approved = Object.assign({}, pending, { _approver: 'reviewer', _last_alert_at: '' });
  const alert = await one('build-the-linkedin-alert.js', { json: await reg({ statusCode: 401, body: {} }), nodes: { config: cfg, 'the approved draft': approved } });
  ok(alert._alert_due && alert._alert_text.includes('No need to approve again'), 'the first rejection alerts the channel and says the approval stays open');
  const again = await one('build-the-linkedin-alert.js', { json: await reg({ statusCode: 401, body: {} }),
    nodes: { config: cfg, 'the approved draft': Object.assign({}, approved, { _last_alert_at: hoursAgo(1) }) } });
  ok(!again._alert_due, 'a second rejection an hour later does not alert again (ALERT_REPEAT_HOURS 6)');
  const alertRow = await one('row-for-the-alert.js', { json: { id: '300' }, nodes: { config: cfg, 'build the LinkedIn alert': alert } });
  ok(alertRow[L.status] === 'alert' && (await find([open(today, '100', 1), alertRow]))._draft_state === 'open', 'the alert is logged without closing the approval');

  const result = (res) => one('read-the-publish-result.js', { json: res, nodes: { config: cfg, 'the approved draft': pending } });
  ok((await result({ statusCode: 201, headers: { 'x-restli-id': 'urn:li:share:7' } }))._outcome === 'POSTED', 'a URN in the header is POSTED');
  ok((await result({ statusCode: 401, body: { message: 'expired' } }))._outcome === 'FAILED', 'a 401 on publish is FAILED, not retried');
  ok((await result({ statusCode: 426, body: {} }))._reason.includes('LINKEDIN_VERSION'), 'a 426 names LINKEDIN_VERSION');
  const unknown = await result({ statusCode: 0, body: {} });
  ok(unknown._outcome === 'UNKNOWN' && !unknown._posted, 'no URN and no error is UNKNOWN and NOT treated as posted');

  const pubResult = Object.assign({}, pending, { _outcome: 'POSTED', _urn: 'urn:li:share:7', _hook: 'Hook.', _pillar: 'P', _reply_id: '101' });
  const postedRow = await one('row-for-the-outcome.js', { json: { Slug: 's', State: 'posted' }, nodes: { config: cfg, 'read the publish result': pubResult } });
  ok(postedRow[L.status] === 'posted' && postedRow[L.urn] === 'urn:li:share:7' && postedRow[L.hook] === 'Hook.',
    'after the bank-row write, the posted row is built from the publish result (URN, hook, pillar) — not from the sheet\'s echo');
  const expRow = await one('row-for-the-outcome.js', { json: Object.assign({}, pending, { _expired: true }), nodes: { config: cfg } });
  ok(expRow[L.status] === 'expired' && expRow[L.message_id] === '100', 'an expired draft is closed with its own message id');

  // -------------------------------------------------------------------- 13
  console.log('\n=== 13. the weekly report and the run summary ===');
  const demoLog2 = await run('load-the-demo-log-02.js', { nodes: { config: demoCfg } });
  const due = await one('is-the-weekly-report-due.js', { items: demoLog2, nodes: { config: demoCfg } });
  ok(due._report_due && due._urns.length === 2 && due._stats_url.includes('shares=List(urn%3Ali%3Ashare%3A'),
    'demo: the report is due, with this week\'s post URNs in a Rest.li List()');
  const rep2 = await one('build-the-weekly-report.js', { json: due, nodes: { config: demoCfg } });
  ok(rep2._published === 2 && rep2._report_text.includes('1 expired unanswered') && rep2._report_text.includes('Median time to approval'),
    'the report counts published, expired and approval time from the log', rep2._report_text);
  const realCfg = await config({ SHEET_ID: 'sim', REPORT_WEEKDAY: 8 });
  ok(!(await one('is-the-weekly-report-due.js', { items: [{ json: {} }], nodes: { config: realCfg } }))._report_due, 'outside the report day it is not due');
  const nowCfg = await config({ SHEET_ID: 'sim', REPORT_WEEKDAY: ({ Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 })[
    new Intl.DateTimeFormat('en-GB', { timeZone: cfg.timezone, weekday: 'short' }).format(new Date())], REPORT_HOUR: 0 });
  const dueNow = await one('is-the-weekly-report-due.js', { items: [{ json: {} }], nodes: { config: nowCfg } });
  ok(dueNow._report_due, 'on the report day after the hour it is due');
  const rrow = await one('row-for-the-weekly-report.js', { json: {}, nodes: { config: nowCfg, 'build the weekly report': { _week_key: dueNow._week_key, _reason: 'r' } } });
  ok(!(await one('is-the-weekly-report-due.js', { items: [{ json: rrow }], nodes: { config: nowCfg } }))._report_due, 'once its report row is logged it is not sent again that week');
  const st403 = await one('read-the-post-stats.js', { json: { statusCode: 403, body: {} }, nodes: { 'is the weekly report due?': due } });
  ok(st403._stats_note.includes('Community Management API'), 'a 403 on statistics is reported as the product gate it is');
  const st200 = await one('read-the-post-stats.js', { json: { statusCode: 200, body: { elements: [{ share: due._urns[0], totalShareStatistics: { impressionCount: 812, clickCount: 9, likeCount: 14, commentCount: 3 } }] } },
    nodes: { 'is the weekly report due?': due } });
  const repStats = await one('build-the-weekly-report.js', { json: st200, nodes: { config: demoCfg } });
  ok(repStats._report_text.includes('812 impressions'), 'statistics, when available, appear per post');

  const withHook = await config({ REPORT_WEBHOOK_URL: 'https://hooks.example/x' });
  const sum = (s) => one('build-the-run-summary.js', { json: s, nodes: { config: withHook } });
  ok(!(await sum({ _stopped: 'nothing awaiting', _reason: 'r' }))._notify, 'an idle poll is quiet — not 280 Slack messages a day');
  ok(!(await sum({ _stopped: 'still awaiting approval' }))._notify, 'a still-waiting poll is quiet');
  ok((await sum({ _outcome: 'POSTED', _slug: 's' }))._notify, 'a publish is reported');
  ok((await sum({ _status: 'alert', _token_problem: true, _slug: 's', _reason: 'r' }))._summary.includes('rejected the token'), 'a token alert is reported as one');
  const exp = await config({ REPORT_WEBHOOK_URL: 'https://hooks.example/x', LINKEDIN_TOKEN_EXPIRES_ON: daysAgo(-3) });
  ok((await one('build-the-run-summary.js', { json: { _stopped: 'silent' }, nodes: { config: exp } }))._summary.includes('expires in'),
    'the daily summary warns before the LinkedIn token expires');

  // -------------------------------------------------------------------- 14
  console.log('\n=== 14. the safety switch ===');
  const shipped = await config({});
  ok(shipped.mode === 'preview', 'it ships in PREVIEW');
  ok(!shipped.deliver_enabled && !shipped.live_publish, 'preview delivers and publishes nowhere');
  ok(!shipped.stats_enabled, 'statistics ship off');
  const testMode = await config({ TEST_CHANNEL_ID: '123' });
  ok(testMode.mode === 'test' && testMode.deliver_enabled && !testMode.live_publish, 'TEST_CHANNEL_ID redirects the delivery but CANNOT cause a publish');
  ok(!(await config({ TEST_RUN: false, SHEET_ID: 'x', DISCORD_CHANNEL_ID: '1' })).live_publish, 'live with no token publishes nothing');
  ok((await config({ TEST_RUN: false, SHEET_ID: 'x', DISCORD_CHANNEL_ID: '1', LINKEDIN_ACCESS_TOKEN: 'tok' })).live_publish, 'live with a token publishes');
  const demoLive = await config({ TEST_RUN: false, LINKEDIN_ACCESS_TOKEN: 'tok' });
  ok(demoLive.mode === 'preview' && demoLive.forced_preview, 'THE DEMO BANK CANNOT GO LIVE');

  // -------------------------------------------------------------------- optional render
  if (process.argv.includes('--render')) {
    console.log('\n=== 15. an actual Chrome render ===');
    const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    if (!fs.existsSync(CHROME)) console.log('  skip (no Chrome at ' + CHROME + ')');
    else {
      const r = bankRows[8];
      const built = await one('build-the-html-template.js', { json: { slot: 9, slug: r.Slug, category: r.Category,
        headline: r.Headline, headline_size: Number(r['Headline size']), subhead: r.Subhead, layout: r.Layout,
        items: JSON.parse(r.Items), band: r.Band, stat_big: r['Stat big'], stat_sub: r['Stat sub'], footer: r.Footer },
      nodes: { config: cfgWithLogo } });
      const outDir = path.join(HERE, '..', 'sample');
      fs.mkdirSync(outDir, { recursive: true });
      const htmlPath = path.join(outDir, 'preview.html');
      const pngPath = path.join(outDir, 'preview.png');
      fs.writeFileSync(htmlPath, built._html, 'utf8');
      if (fs.existsSync(pngPath)) fs.unlinkSync(pngPath);
      try {
        execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
          '--force-device-scale-factor=1', '--user-data-dir=' + path.join(require('os').tmpdir(), 'li-sim'),
          '--window-size=1080,1350', '--screenshot=' + pngPath,
          'file:///' + htmlPath.replace(/\\/g, '/').replace(/ /g, '%20')], { stdio: 'ignore', timeout: 60000 });
      } catch (e) { /* Chrome exits non-zero on some Windows builds after writing the file */ }
      ok(fs.existsSync(pngPath), 'Chrome wrote sample/preview.png');
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log(pass + ' passed, ' + fail + ' failed');
  if (fail) {
    console.log('\nfailures:');
    failures.forEach((f) => console.log('  - ' + f));
    process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
