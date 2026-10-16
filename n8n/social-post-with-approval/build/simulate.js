// Run the workflow's logic outside n8n, against the real bank.
//
//   node simulate.js            every check
//   node simulate.js --render   also screenshot slot 9 with Chrome, as render.sh does
//
// Three things are proved here, in order of how much they matter:
//
//   1. The HTML this workflow builds is byte-identical to what render/build.js produces in
//      the drafts repo. That is the whole point of the port — two renderers that drift by a
//      pixel produce a feed where yesterday's post and today's do not look like siblings.
//   2. The guards fire. Each one is forced to trip on purpose, because a guard that has
//      never been seen to fail is a guard nobody knows is wired up.
//   3. The approval gate refuses everything it should. Ten attempts to publish something
//      nobody approved, each of which must come back `wait` or `cancel`.
//
// n8n is shimmed rather than mocked: the Code node bodies are read from js/ and run as
// written, with $json, $, items and $binary supplied. Nothing here is a copy of the logic.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const HERE = __dirname;
const JS = path.join(HERE, 'js');
const DRAFTS = path.resolve(HERE, '..', '..', '..', '..',
  'workspace', 'tutorials', 'scripts', 'drafts');

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
async function run(file, { json = {}, items = null, nodes = {}, binary = {} } = {}) {
  const src = fs.readFileSync(path.join(JS, file), 'utf8');
  // alwaysOutputData is set on every sheet read, so an empty tab arrives as ONE empty
  // item, never as zero. The shim reproduces that rather than an empty array.
  const src_items = items && items.length ? items : [{ json }];
  const list = src_items.map((i) => (i && i.json !== undefined ? i : { json: i }));
  const $ = (name) => {
    if (!(name in nodes)) throw new Error('the node reference $(\'' + name + '\') is not wired in this simulation');
    const v = nodes[name];
    return { first: () => ({ json: v }), all: () => [{ json: v }] };
  };
  const fn = new AsyncFunction('$json', '$', 'items', '$binary', '$input', 'btoa', 'helpers', src);
  const ctx = {
    helpers: {
      getBinaryDataBuffer: async (_i, key) => binary[key] && binary[key]._buffer
    }
  };
  const out = await fn.call(ctx, list[0].json, $, list, binary,
    { all: () => list, first: () => list[0] },
    (s) => Buffer.from(s, 'utf8').toString('base64'),
    ctx.helpers);
  return out;
}

async function config(overrides = {}) {
  let src = fs.readFileSync(path.join(JS, 'config.js'), 'utf8');
  for (const [k, v] of Object.entries(overrides)) {
    const re = new RegExp('^const ' + k + '\\s*=\\s*[^;]+;', 'm');
    if (!re.test(src)) throw new Error('no such config constant: ' + k);
    src = src.replace(re, 'const ' + k + ' = ' + JSON.stringify(v) + ';');
  }
  const fn = new AsyncFunction(src);
  return (await fn())[0].json;
}

// ---------------------------------------------------------------------- the real bank
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

// The logo the drafts repo renders with. Both sides must use the same one or every byte
// after the header differs and the comparison says nothing.
const LOGO = fs.readFileSync(path.join(DRAFTS, 'render', 'acme_logo_12.svg'), 'utf8');

async function main() {
  console.log('\n=== 1. the bank loads ===');
  ok(bankRows.length === 16, 'seed-bank.csv holds 16 posts', 'got ' + bankRows.length);
  ok(bankRows.every((r) => r.Caption.trim()), 'every row carries a caption');
  ok(bankRows.filter((r) => r.State === 'posted').length === 8,
    'slots 1-8 are marked posted, so they can never be re-drafted');

  // -------------------------------------------------------------------- the port
  console.log('\n=== 2. the HTML matches render/build.js byte for byte ===');

  // Build the reference the same way build.js does, by evaluating its own template function.
  const buildSrc = fs.readFileSync(path.join(DRAFTS, 'render', 'build.js'), 'utf8');
  const refFns = new Function('LOGO', 'C', 'fs', 'path',
    buildSrc.slice(buildSrc.indexOf('function timeline('), buildSrc.indexOf('// ---------------------------------------------------------------------------'))
    + '\nreturn { html, css, renderBody };');
  const ref = refFns(LOGO.trim(), {
    bg: '#050505', pink: '#DC2056', white: '#FFFFFF', muted: '#A8A8A8',
    line: '#303030', cardBorder: '#262626', cardBg: '#0B0B0B'
  }, fs, path);

  const cfgWithLogo = await config({ LOGO_SVG: LOGO });
  const state = { _today: '2026-09-02', _weekday: 3, _weekday_name: 'Wed', _posted_slugs: [] };

  let matched = 0;
  const mismatches = [];
  for (const r of bankRows) {
    const post = {
      slot: Number(r.Slot), slug: r.Slug, pillar: r.Pillar, category: r.Category,
      headline: r.Headline, headline_size: Number(r['Headline size']), subhead: r.Subhead,
      layout: r.Layout, items: JSON.parse(r.Items || '[]'), band: r.Band,
      stat_big: r['Stat big'], stat_sub: r['Stat sub'], footer: r.Footer
    };
    const out = await run('build-the-html-template.js', {
      json: post, nodes: { config: cfgWithLogo }
    });
    const mine = out[0].json._html;
    const theirs = ref.html({
      slot: post.slot, slug: post.slug, pillar: post.pillar, category: post.category,
      headline: post.headline, headlineSize: post.headline_size, subhead: post.subhead,
      type: post.layout, items: post.items, band: post.band,
      statBig: post.stat_big, statSub: post.stat_sub, footer: post.footer
    });
    if (mine === theirs) matched++;
    else {
      let at = 0;
      while (at < mine.length && mine[at] === theirs[at]) at++;
      mismatches.push(post.slug + ' diverges at byte ' + at + ':\n         mine:   '
        + JSON.stringify(mine.slice(at, at + 70)) + '\n         theirs: '
        + JSON.stringify(theirs.slice(at, at + 70)));
    }
  }
  ok(matched === bankRows.length,
    'all ' + bankRows.length + ' posts render identical HTML in both implementations',
    mismatches.slice(0, 2).join('\n       '));

  // -------------------------------------------------------------------- the guards
  console.log('\n=== 3. the guards actually fire ===');
  const cfg = await config({});

  async function pick(rows, st = state, over = {}) {
    st = Object.assign({ _posted_slugs: [] }, st);
    // A blank SHEET_ID makes the picker read the demo bank and ignore these rows
    // entirely — which is correct behaviour, and not what these checks are about.
    const c = await config(Object.assign({ SHEET_ID: 'sim' }, over));
    return (await run('pick-todays-post.js', {
      items: rows.map((json) => ({ json })),
      nodes: { config: c, 'resolve todays state': st }
    }))[0].json;
  }

  const ready = bankRows.map((r) => Object.assign({}, r, { State: 'ready' }));

  const normal = await pick(ready.map((r) => (Number(r.Slot) <= 8
    ? Object.assign({}, r, { State: 'posted' }) : r)));
  ok(normal._has_post && normal.slot === 9,
    'the next ready slot is chosen (slot ' + normal.slot + ')');

  // Force a layout repeat: give slot 10 the same layout as slot 9.
  const clash = ready.map((r) => (Number(r.Slot) <= 8 ? Object.assign({}, r, { State: 'posted' })
    : Number(r.Slot) === 9 ? Object.assign({}, r, { Layout: bankRows[9].Layout }) : r));
  const clashed = await pick(clash);
  ok(clashed.slot !== 9 || !clashed._has_post || clashed._holds.length > 0,
    'a layout repeat inside the window holds the post',
    JSON.stringify(clashed._holds || []).slice(0, 200));

  // Force a pillar repeat.
  const pclash = ready.map((r) => (Number(r.Slot) <= 8 ? Object.assign({}, r, { State: 'posted' })
    : Number(r.Slot) === 9 ? Object.assign({}, r, { Pillar: bankRows[9].Pillar }) : r));
  const pclashed = await pick(pclash);
  ok((pclashed._holds || []).some((h) => h.reasons.some((x) => x.includes('pillar'))),
    'a pillar repeat inside the window holds the post');

  // The Thursday rule: a design post on a Wednesday.
  const design = ready.map((r) => (Number(r.Slot) <= 9 ? Object.assign({}, r, { State: 'posted' })
    : Number(r.Slot) === 10 ? Object.assign({}, r, { Pillar: 'Design process, prototyping' }) : r));
  const onWed = await pick(design, { _today: '2026-09-02', _weekday: 3, _weekday_name: 'Wed' });
  ok((onWed._holds || []).some((h) => h.reasons.some((x) => x.includes('Thursday'))),
    'a Design process post is held on a Wednesday');
  const onThu = await pick(design, { _today: '2026-09-03', _weekday: 4, _weekday_name: 'Thu' });
  ok(onThu._has_post && onThu.slot === 10,
    'the same post goes out on a Thursday');

  // A malformed Items cell must hold, not render half a card.
  const broken = ready.map((r) => (Number(r.Slot) <= 8 ? Object.assign({}, r, { State: 'posted' })
    : Number(r.Slot) === 9 ? Object.assign({}, r, { Items: '[[unclosed' }) : r));
  const brokeRes = await pick(broken);
  ok((brokeRes._holds || []).some((h) => h.reasons.some((x) => x.includes('not valid JSON'))),
    'a malformed Items cell holds the row');

  // An exhausted bank stops rather than repeating the last post.
  const spent = bankRows.map((r) => Object.assign({}, r, { State: 'posted' }));
  const none = await pick(spent);
  ok(!none._has_post, 'an exhausted bank stops instead of repeating a post');

  // -------------------------------------------------------------------- the state machine
  console.log('\n=== 4. the state machine ===');
  const L = cfg.log_columns;
  const logRow = (d, status, extra = {}) => Object.assign({
    [L.date]: d, [L.slug]: 's', [L.slot]: 9, [L.status]: status,
    [L.message_id]: '111', [L.at]: new Date().toISOString()
  }, extra);

  async function resolve(rows, tz = 'UTC') {
    const c = await config({ TIMEZONE: tz });
    return (await run('resolve-todays-state.js', {
      items: rows.map((json) => ({ json })), nodes: { config: c }
    }))[0].json;
  }
  const todayUTC = new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC' }).format(new Date());
  const isWeekday = [1, 2, 3, 4, 5].includes(
    ({ Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 })[
      new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'short' }).format(new Date())]);

  const empty = await resolve([]);
  ok(empty._draftable === isWeekday, 'an empty log drafts on a weekday');
  const posted = await resolve([logRow(todayUTC, 'posted')]);
  ok(!posted._draftable, 'a posted row today is silent');
  const awaiting = await resolve([logRow(todayUTC, 'awaiting')]);
  ok(!awaiting._draftable, 'a draft already awaiting approval is silent');
  const cancelled = await resolve([logRow(todayUTC, 'cancelled')]);
  ok(cancelled._draftable === isWeekday,
    'a cancelled day drafts AGAIN — this is the one that must not regress');
  const yesterdayPosted = await resolve([logRow('2020-01-01', 'posted')]);
  ok(yesterdayPosted._draftable === isWeekday,
    'an old posted row does not silence today (no cascade rule)');

  // -------------------------------------------------------------------- the approval gate
  console.log('\n=== 5. the approval gate refuses what it should ===');
  const pending = {
    _has_pending: true, _message_id: '100', _channel_id: 'c', _slug: 's',
    _caption_fp: 'abc', _date: todayUTC
  };
  const BOT = { id: 'bot-1', username: 'hermes', bot: true };
  const HUMAN = { id: 'human-1', username: 'operator', bot: false };
  const OTHERBOT = { id: 'bot-2', username: 'other', bot: true };
  const draftMsg = { id: '100', author: BOT, content: 'caption\n\nReply **post** to publish, or **cancel** to discard.' };

  async function gate(msgs) {
    return (await run('read-the-approval-reply.js', {
      items: [draftMsg, ...msgs].map((json) => ({ json })),
      nodes: { config: cfg, 'find the pending draft': pending }
    }))[0].json;
  }

  ok((await gate([])) ._decision === 'wait', 'no reply -> wait');
  ok((await gate([{ id: '101', author: HUMAN, content: 'post' }]))._decision === 'post',
    'a human replying "post" -> post');
  ok((await gate([{ id: '101', author: HUMAN, content: 'POST' }]))._decision === 'post',
    'matching is case-insensitive');
  ok((await gate([{ id: '101', author: BOT, content: 'post' }]))._decision === 'wait',
    'THE BOT CANNOT APPROVE ITS OWN DRAFT');
  ok((await gate([{ id: '101', author: OTHERBOT, content: 'post' }]))._decision === 'wait',
    'another bot cannot approve — a second agent is not a second opinion');
  ok((await gate([{ id: '101', author: HUMAN, content: 'post please' }]))._decision === 'wait',
    '"post please" does not approve — trailing text is not tolerated');
  ok((await gate([{ id: '101', author: HUMAN, content: 'do not post' }]))._decision === 'wait',
    '"do not post" DOES NOT APPROVE — the worst available bug, checked explicitly');
  ok((await gate([{ id: '99', author: HUMAN, content: 'post' }]))._decision === 'wait',
    'a message from before the draft cannot approve it');
  ok((await gate([{ id: '101', author: HUMAN, content: 'cancel' },
                  { id: '102', author: HUMAN, content: 'post' }]))._decision === 'cancel',
    'a cancel is not reopened by a later approval');
  ok((await gate([{ id: '101', author: HUMAN, content: 'looks good' },
                  { id: '102', author: HUMAN, content: 'post' }]))._decision === 'post',
    'chatter before the approval is ignored, not treated as a decision');

  // -------------------------------------------------------------------- the frozen draft
  console.log('\n=== 6. the approved draft is frozen ===');
  async function frozen(msg, fp) {
    return (await run('the-approved-draft.js', {
      items: [msg].map((json) => ({ json })),
      nodes: {
        config: cfg,
        'read the approval reply': Object.assign({}, pending, {
          _caption_fp: fp, _decision: 'post', _approver: 'operator'
        })
      }
    }))[0].json;
  }
  // Fingerprint of 'caption', computed by the same function the workflow uses.
  const fpOf = (s) => {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return ('0000000' + h.toString(16)).slice(-8);
  };
  const withImage = Object.assign({}, draftMsg, {
    attachments: [{ url: 'https://cdn/x.png', filename: 'x.png', content_type: 'image/png', size: 90000 }]
  });
  ok((await frozen(withImage, fpOf('caption')))._publishable,
    'an untouched draft with its image is publishable');
  ok(!(await frozen(withImage, 'deadbeef'))._publishable,
    'an EDITED caption is refused — the fingerprint no longer matches');
  ok(!(await frozen(Object.assign({}, withImage, { edited_timestamp: '2026-09-02T10:00:00Z' }), fpOf('caption')))._publishable,
    'a message Discord marks as edited is refused');
  ok(!(await frozen(draftMsg, fpOf('caption')))._publishable,
    'a draft whose image is gone is refused — a caption is not a post');

  // -------------------------------------------------------------------- the publish result
  console.log('\n=== 7. the publish result is read honestly ===');
  async function result(res) {
    return (await run('read-the-publish-result.js', {
      json: res, nodes: { config: cfg, 'the approved draft': pending }
    }))[0].json;
  }
  ok((await result({ statusCode: 201, headers: { 'x-restli-id': 'urn:li:share:7' } }))._outcome === 'POSTED',
    'a URN in the header is POSTED');
  ok((await result({ statusCode: 401, body: { message: 'expired' } }))._outcome === 'FAILED',
    'a 401 is FAILED, not retried');
  ok((await result({ statusCode: 426, body: {} }))._reason.includes('LINKEDIN_VERSION'),
    'a 426 names the retired LinkedIn-Version as the cause');
  const unknown = await result({ statusCode: 0, body: {} });
  ok(unknown._outcome === 'UNKNOWN' && !unknown._posted,
    'no URN and no error is UNKNOWN and is NOT treated as posted');

  // -------------------------------------------------------------------- the caption rules
  console.log('\n=== 8. the caption rules ===');
  async function caption(text, over = {}) {
    const c = await config(over);
    const post = { _caption: text, _needs_caption: false, _caption_source: 'bank', slot: 9, slug: 's' };
    return (await run('apply-the-caption.js', {
      json: {}, nodes: { config: c, 'pick todays post': post }
    }))[0].json;
  }
  const good = bankRows[8].Caption;
  ok((await caption(good))._caption_ok, 'a real banked caption passes',
    JSON.stringify((await caption(good))._problems));
  ok(!(await caption('too short. #a #b #c #d'))._caption_ok, 'a short caption is held');
  ok(!(await caption(good + ' This is a game changer.'))._caption_ok,
    'a banned phrase is held, not edited out');
  ok((await caption(good))._caption_fp.length === 8, 'the caption fingerprint is 8 hex chars');

  // -------------------------------------------------------------------- the layout checks
  console.log('\n=== 9. the layout validator ===');
  async function layout(over) {
    const r = bankRows[8];
    const post = Object.assign({
      slot: 9, slug: r.Slug, pillar: r.Pillar, category: r.Category, headline: r.Headline,
      headline_size: Number(r['Headline size']), subhead: r.Subhead, layout: r.Layout,
      items: JSON.parse(r.Items), band: r.Band, stat_big: r['Stat big'],
      stat_sub: r['Stat sub'], footer: r.Footer
    }, over);
    const built = (await run('build-the-html-template.js', {
      json: post, nodes: { config: cfgWithLogo }
    }))[0].json;
    return (await run('validate-the-layout.js', {
      json: built, nodes: { config: cfgWithLogo }
    }))[0].json;
  }
  ok((await layout({}))._layout_ok, 'a real bank row passes the layout check',
    JSON.stringify((await layout({}))._issues));
  ok(!(await layout({ headline: 'A VERY LONG HEADLINE THAT WILL NOT FIT ON ONE LINE AT ALL EVER' }))._layout_ok,
    'a headline too wide for the 932px box is caught');
  ok(!(await layout({ items: [['title', '']] }))._layout_ok,
    'an empty field is caught — that is the dead-void defect');
  const noLogo = (await run('validate-the-layout.js', {
    json: (await run('build-the-html-template.js', {
      json: { slot: 9, slug: 's', pillar: 'p', category: 'C', headline: 'A<em>B</em>',
        headline_size: 90, subhead: 's', layout: 'split', items: [['A', ['x']], ['B', ['y']]],
        footer: 'f' },
      nodes: { config: cfg }
    }))[0].json,
    nodes: { config: cfg }
  }))[0].json;
  ok(!noLogo._layout_ok && noLogo._issues.some((i) => i.includes('LOGO_SVG')),
    'a blank LOGO_SVG blocks the render rather than shipping a placeholder');

  // -------------------------------------------------------------------- the PNG check
  console.log('\n=== 10. the PNG check reads bytes, not status codes ===');
  function png(w, h, size) {
    const b = Buffer.alloc(Math.max(size, 24));
    b.write('\x89PNG\r\n\x1a\n', 0, 'binary');
    b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20);
    return b;
  }
  async function checkPng(buf) {
    return (await run('check-the-png.js', {
      json: {}, binary: buf ? { data: { _buffer: buf, mimeType: 'image/png' } } : {},
      nodes: { config: cfg, 'build the render request': { slug: 's' } }
    }))[0].json;
  }
  ok((await checkPng(png(2160, 2700, 90000)))._png_ok, 'a real 2160x2700 render passes');
  ok(!(await checkPng(png(2160, 2700, 1000)))._png_ok,
    'a 1 KB PNG is rejected — that is a blank canvas, not a post');
  ok(!(await checkPng(png(1080, 1350, 90000)))._png_ok,
    'the wrong dimensions are rejected');
  ok(!(await checkPng(Buffer.from('<html>error</html>')))._png_ok,
    'an HTML error page returned with a 200 is rejected');
  ok(!(await checkPng(null))._png_ok, 'no binary at all is rejected');

  // -------------------------------------------------------------------- the safety switch
  console.log('\n=== 11. the safety switch ===');
  const shipped = await config({});
  ok(shipped.mode === 'preview', 'it ships in PREVIEW');
  ok(!shipped.deliver_enabled, 'preview delivers nowhere');
  ok(!shipped.live_publish, 'preview publishes nowhere');
  const testMode = await config({ TEST_CHANNEL_ID: '123' });
  ok(testMode.mode === 'test' && testMode.deliver_enabled && !testMode.live_publish,
    'setting TEST_CHANNEL_ID redirects the delivery but CANNOT cause a publish');
  const liveNoToken = await config({ TEST_RUN: false, SHEET_ID: 'x', DISCORD_CHANNEL_ID: '1' });
  ok(!liveNoToken.live_publish, 'live with no token still publishes nothing');
  const live = await config({ TEST_RUN: false, SHEET_ID: 'x', DISCORD_CHANNEL_ID: '1',
    LINKEDIN_ACCESS_TOKEN: 'tok' });
  ok(live.live_publish, 'live with a token publishes');
  const demoLive = await config({ TEST_RUN: false, LINKEDIN_ACCESS_TOKEN: 'tok' });
  ok(demoLive.mode === 'preview' && demoLive.forced_preview,
    'THE DEMO BANK CANNOT GO LIVE — forced into preview whatever TEST_RUN says');

  // -------------------------------------------------------------------- optional: render
  if (process.argv.includes('--render')) {
    console.log('\n=== 12. an actual Chrome render ===');
    const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    if (!fs.existsSync(CHROME)) {
      console.log('  skip (no Chrome at ' + CHROME + ')');
    } else {
      const r = bankRows[8];
      const built = (await run('build-the-html-template.js', {
        json: {
          slot: 9, slug: r.Slug, category: r.Category, headline: r.Headline,
          headline_size: Number(r['Headline size']), subhead: r.Subhead, layout: r.Layout,
          items: JSON.parse(r.Items), band: r.Band, stat_big: r['Stat big'],
          stat_sub: r['Stat sub'], footer: r.Footer
        },
        nodes: { config: cfgWithLogo }
      }))[0].json;
      const outDir = path.join(HERE, '..', 'sample');
      fs.mkdirSync(outDir, { recursive: true });
      const htmlPath = path.join(outDir, 'preview.html');
      const pngPath = path.join(outDir, 'preview.png');
      fs.writeFileSync(htmlPath, built._html, 'utf8');
      if (fs.existsSync(pngPath)) fs.unlinkSync(pngPath);
      try {
        execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox',
          '--hide-scrollbars', '--force-device-scale-factor=1',
          '--user-data-dir=' + path.join(require('os').tmpdir(), 'acme-sim'),
          '--window-size=1080,1350', '--screenshot=' + pngPath,
          'file:///' + htmlPath.replace(/\\/g, '/').replace(/ /g, '%20')],
          { stdio: 'ignore', timeout: 60000 });
      } catch (e) { /* Chrome exits non-zero on some Windows builds after writing the file */ }
      if (fs.existsSync(pngPath)) {
        const b = fs.readFileSync(pngPath);
        const dims = b.readUInt32BE(16) + 'x' + b.readUInt32BE(20);
        ok(dims === '1080x1350', 'Chrome rendered ' + dims + ', ' + b.length + ' bytes -> sample/preview.png');
      } else {
        ok(false, 'Chrome wrote no PNG');
      }
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
