import { defineSpec } from '../_kit/spec';
import { trigger, code, ifWhen, merge, stop, http, splitOut, sheets, slack } from '../_kit/n';

const cfg = (k: string) => `$('config').first().json.${k}`;

// n.ts has no "never error" option. A page that 404s should become an audit row,
// not stop the run, so the node continues with the error as its output.
const tolerant = (n: ReturnType<typeof http>) => ({ ...n, onError: 'continueRegularOutput' } as ReturnType<typeof http>);

const page = (title: string, desc: string | null, h1s: number, canonical: string | null, extra = '') =>
  `'<html><head>${title !== null ? `<title>${title}</title>` : ''}${desc !== null ? `<meta content="${desc}" name="description">` : ''}${canonical ? `<link rel="canonical" href="${canonical}">` : ''}${extra}</head><body>${'<h1>Heading</h1>'.repeat(h1s)}<p>Body</p></body></html>'`;

export default defineSpec({
  slug: 'seo-missing-meta-audit',
  title: 'Audit sitemap pages for missing titles and meta descriptions in Google Sheets',
  summary: 'Reads your sitemap, fetches each page, checks the title, meta description, H1, canonical and noindex tags against length and duplicate rules, compares every page with last week\'s audit (regressed, improved, unchanged, and how long each issue has been open), upserts one row per page to Google Sheets and posts the regressions to Slack.',
  category: 'Marketing and content',
  description: {
    who: 'Marketers and site owners who want a page-by-page list of SEO basics to fix, without paying for a crawler subscription. The sheet becomes the to-do list, updated every week.',
    how: [
      'Every Sunday at 22:00 it reads your sitemap and fetches up to 150 pages, or 7 sample pages until live fetching is on.',
      'Each page is checked for a title of 30-60 characters, a meta description of 70-160, exactly one H1, a canonical that points to itself, and no noindex tag.',
      'Titles and descriptions used on more than one page are flagged on every page that shares them.',
      'Missing tags, noindex and failed loads are errors, the rest are warnings.',
      'Each page is compared with last week\'s audit: new issues make it regressed, cleared issues make it improved, and every open issue keeps the date it was first seen, so the row shows how many weeks it has been ignored.',
      'One row per page is upserted on the url column of the Audit tab. Slack gets regressions first with their new issues, then the fix count and the error total against last week.',
    ],
    setup: [
      'Run it once as imported. It audits the sample pages and stops at `STOP: dry run - sheet untouched`.',
      'Set `SITEMAP_URLS` and `USE_LIVE_FETCH = true`, then run it and read the rows in `Audit each page`.',
      'Connect Google Sheets, create an Audit tab with a url column, and set `AUDIT_SHEET_ID`.',
      'Optionally connect Slack and set `SLACK_CHANNEL_ID` for the weekly change report.',
      'Set `DRY_RUN = false` to write the rows. The first live run is the baseline; changes are reported from the second.',
    ],
    requirements: ['A public XML sitemap', 'A Google Sheet with an Audit tab', 'Optional: a Slack workspace'],
    customize: [
      '`TITLE_LENGTH` and `DESCRIPTION_LENGTH` hold the min and max characters.',
      '`MAX_PAGES` caps the pages fetched per run.',
      '`ERROR_RULES` decides which issues count as errors rather than warnings.',
      '`STALE_ISSUE_DAYS` sets when an open issue is called out as stale in the Slack report.',
    ],
  },
  config: {
    intro: ['USE_LIVE_FETCH false -> SAMPLE pages.', 'DRY_RUN true -> the audit is computed and shown, the sheet is not written.'],
    consts: [
      { name: 'USE_LIVE_FETCH', value: false, note: 'set true to read the sitemap and fetch each page (public GETs)' },
      { name: 'SITEMAP_URLS', value: ['https://www.yourcompany.example/sitemap.xml'], note: 'sitemaps to read (child sitemaps, not an index)' },
      { name: 'MAX_PAGES', value: 150, note: 'pages fetched per run, newest lastmod first' },
      { name: 'TITLE_LENGTH', value: [30, 60], note: 'title length range in characters' },
      { name: 'DESCRIPTION_LENGTH', value: [70, 160], note: 'meta description length range in characters' },
      { name: 'ERROR_RULES', value: ['missing title', 'missing meta description', 'no H1', 'noindex', 'page failed to load'], note: 'issues that make a row an error; everything else warns' },
      { name: 'AUDIT_SHEET_ID', value: '', note: 'Google Sheets id with an Audit tab; blank means nothing is written' },
      { name: 'STALE_ISSUE_DAYS', value: 28, note: 'open issues older than this are counted as stale in the report' },
      { name: 'SLACK_CHANNEL_ID', value: '', note: 'channel for the weekly change report; blank skips Slack' },
    ],
    flags: { sheet_enabled: "AUDIT_SHEET_ID.trim() !== ''", slack_enabled: "SLACK_CHANNEL_ID.trim() !== ''" },
    safety: 'dry_run',
  },
  nodes: [
    trigger.manual(),
    trigger.schedule('Every Sunday at 22:00', '0 22 * * 0'),
    ifWhen('Use sample pages?', [[cfg('use_live_fetch'), 'false']]),
    code('Load sample pages', `
// Used until USE_LIVE_FETCH is true. Each item is a page URL and its HTML, the
// same pair the live branch produces, with one problem per page. "previous" is
// last week's audit for that page, so the comparison has something to diff.
const base = 'https://www.yourcompany.example';
return [
  { url: base + '/', previous: ['description too long (171)'], html: ${page('Team expense tracking for small companies | Tallyroom', 'Track shared team expenses, approve them in one click and export to your accounting tool. Free for teams of up to 5.', 1, 'https://www.yourcompany.example/')} },
  { url: base + '/pricing', previous: [], html: ${page('Pricing', 'Plans and pricing for Tallyroom. Start free, upgrade when your team grows past five people.', 1, 'https://www.yourcompany.example/pricing')} },
  { url: base + '/features', html: ${page('Features: approvals, receipts &amp; exports | Tallyroom', null, 2, 'https://www.yourcompany.example/features')} },
  { url: base + '/blog/expense-policy-template', html: ${page('Free expense policy template for small teams (2026 edition)', 'Plans and pricing for Tallyroom. Start free, upgrade when your team grows past five people.', 1, 'https://www.yourcompany.example/blog/expense-policies')} },
  { url: base + '/thank-you', html: ${page('Thanks for signing up to the Tallyroom newsletter', 'You are on the list. Expect one email a month with expense tips, templates and product news.', 0, null, '<meta name="robots" content="noindex, follow">')} },
  { url: base + '/about', previous: ['missing title'], html: ${page('', 'Who we are, why we started Tallyroom in 2021 and the six people who build and support it every day.', 1, 'https://www.yourcompany.example/about')} },
  { url: base + '/old-page', html: '', error: 'Request failed with status code 404' },
].map(json => ({ json }));`),
    code('List sitemaps', `
// One item per sitemap file.
return $('config').first().json.sitemap_urls.map(url => ({ json: { url } }));`),
    http('Fetch the sitemap', { url: '={{ $json.url }}', auth: 'none', headers: { Accept: 'application/xml,text/xml' } }),
    code('Pick pages to audit', `
// <loc> and <lastmod> from every sitemap, newest first, capped at MAX_PAGES.
const cfg = $('config').first().json;
const all = [];
for (const { json } of $input.all()) {
  const xml = typeof json.data === 'string' ? json.data : '';
  for (const m of xml.matchAll(/<url>([\\s\\S]*?)<\\/url>/g)) {
    const loc = (m[1].match(/<loc>\\s*([^<\\s]+)\\s*<\\/loc>/) || [])[1];
    if (loc) all.push({ url: loc.replace(/&amp;/g, '&'), lastmod: (m[1].match(/<lastmod>\\s*([^<\\s]+)/) || [])[1] || '' });
  }
}
const unique = [...new Map(all.map(x => [x.url, x])).values()].sort((a, b) => b.lastmod.localeCompare(a.lastmod));
return unique.slice(0, cfg.max_pages).map(x => ({ json: { url: x.url } }));`),
    tolerant(http('Fetch each page', { url: '={{ $json.url }}', auth: 'none', timeout: 20000, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; seo-audit/1.0)', Accept: 'text/html' } })),
    code('Pair pages with their HTML', `
// HTML arrives as a string in "data"; an error item becomes a failed load.
const pages = $('Pick pages to audit').all();
return $input.all().map((it, i) => ({ json: { url: pages[i].json.url,
  html: typeof it.json.data === 'string' ? it.json.data : '', error: it.json.error ? String(it.json.error.message || it.json.error).slice(0, 100) : '' } }));`),
    merge('Combine page sources'),
    code('Audit each page', `
// Reads the head tags with attribute order ignored, then applies the length,
// H1, canonical and noindex rules. Duplicates are found across the whole run.
const cfg = $('config').first().json;
const dec = s => String(s || '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\\s+/g, ' ').trim();
const attrs = tag => Object.fromEntries([...tag.matchAll(/([a-z-]+)\\s*=\\s*("([^"]*)"|'([^']*)')/gi)].map(m => [m[1].toLowerCase(), m[3] ?? m[4]]));
const norm = u => String(u || '').replace(/\\/$/, '').toLowerCase();
const pages = $input.all().map(({ json: p }) => {
  if (!p.html) return { url: p.url, failed: p.error || 'empty response' };
  const head = (p.html.match(/<head[\\s\\S]*?<\\/head>/i) || [p.html])[0];
  const title = dec((head.match(/<title[^>]*>([\\s\\S]*?)<\\/title>/i) || [])[1]);
  const metas = [...head.matchAll(/<meta\\b[^>]*>/gi)].map(m => attrs(m[0]));
  const desc = dec(metas.find(a => (a.name || '').toLowerCase() === 'description')?.content);
  const robots = (metas.find(a => (a.name || '').toLowerCase() === 'robots')?.content || '').toLowerCase();
  const canonical = attrs((head.match(/<link\\b[^>]*rel=["']canonical["'][^>]*>/i) || [''])[0]).href || '';
  const h1 = (p.html.match(/<h1[\\s>]/gi) || []).length;
  return { url: p.url, title, desc, robots, canonical, h1 };
});
const count = key => pages.reduce((m, p) => (p[key] && (m[p[key]] = (m[p[key]] || 0) + 1), m), {});
const titles = count('title'), descs = count('desc');
const [tMin, tMax] = cfg.title_length, [dMin, dMax] = cfg.description_length;
const errorRules = new Set(cfg.error_rules);
const stamp = new Date().toISOString().slice(0, 10);
const rows = pages.map(p => {
  const issues = [];
  if (p.failed) issues.push('page failed to load');
  else {
    if (!p.title) issues.push('missing title');
    else if (p.title.length < tMin) issues.push('title too short (' + p.title.length + ')');
    else if (p.title.length > tMax) issues.push('title too long (' + p.title.length + ')');
    if (!p.desc) issues.push('missing meta description');
    else if (p.desc.length < dMin) issues.push('description too short (' + p.desc.length + ')');
    else if (p.desc.length > dMax) issues.push('description too long (' + p.desc.length + ')');
    if (p.title && titles[p.title] > 1) issues.push('duplicate title');
    if (p.desc && descs[p.desc] > 1) issues.push('duplicate description');
    if (p.h1 === 0) issues.push('no H1'); else if (p.h1 > 1) issues.push(p.h1 + ' H1 tags');
    if (!p.canonical) issues.push('no canonical');
    else if (norm(p.canonical) !== norm(p.url)) issues.push('canonical points to ' + p.canonical);
    if (p.robots.includes('noindex')) issues.push('noindex');
  }
  const level = issues.some(i => errorRules.has(i)) ? 'error' : issues.length ? 'warn' : 'pass';
  return { url: p.url, status: level, title: p.title || '', title_length: (p.title || '').length, description_length: (p.desc || '').length,
    h1_count: p.h1 ?? '', canonical: p.canonical || '', issues: p.failed ? 'page failed to load: ' + p.failed : issues.join('; '), audited_at: stamp };
});
const summary = rows.reduce((a, r) => (a[r.status]++, a), { pass: 0, warn: 0, error: 0 });
return [{ json: { rows, summary } }];`),
    code('Compare with last week', `
// Diffs each page's issues with the last saved audit. Issue text carries numbers
// ("title too long (72)"), so issues are compared by their rule, not the count.
// first_seen keeps the date each rule first failed on each page, so an issue
// that has been open for weeks is visible. Nothing is saved here; the baseline
// is written only after the sheet write succeeds.
const cfg = $('config').first().json;
const store = $getWorkflowStaticData('global');
let sample = {};
try { sample = Object.fromEntries($('Load sample pages').all().filter(i => i.json.previous).map(i => [i.json.url, { issues: i.json.previous, first_seen: {} }])); } catch (e) { sample = {}; }
const last = store.pages || sample;
const firstRun = Object.keys(last).length === 0;
const rule = i => i.replace(/\\s*\\(.*\\)$/, '').replace(/^page failed to load.*/, 'page failed to load').replace(/^canonical points to .*/, 'canonical points elsewhere').replace(/^\\d+ H1 tags$/, 'several H1 tags');
const today = new Date().toISOString().slice(0, 10);
const { rows, summary } = $input.first().json;
const regressed = [], improved = [];
let stale = 0;
const out = rows.map(r => {
  const now = r.issues ? r.issues.split('; ').map(rule) : [];
  const prev = last[r.url];
  const before = prev ? prev.issues.map(rule) : [];
  const added = now.filter(i => !before.includes(i)), cleared = before.filter(i => !now.includes(i));
  const change = !prev ? (firstRun ? 'baseline' : 'new page') : added.length ? 'regressed' : cleared.length ? 'improved' : 'unchanged';
  const first_seen = {};
  for (const i of now) first_seen[i] = prev?.first_seen?.[i] || today;
  const oldest = Object.values(first_seen).sort()[0] || '';
  const open_days = oldest ? Math.round((Date.parse(today) - Date.parse(oldest)) / 864e5) : 0;
  if (open_days >= cfg.stale_issue_days) stale++;
  if (change === 'regressed' || (change === 'new page' && r.status === 'error')) regressed.push({ url: r.url, added: added.join(', ') });
  if (change === 'improved') improved.push({ url: r.url, cleared: cleared.join(', ') });
  return { ...r, change, new_issues: added.join('; '), fixed_issues: cleared.join('; '), oldest_issue_days: open_days, _rules: now, _first_seen: first_seen };
});
const lastErrors = store.summary ? store.summary.error : null;
return [{ json: { rows: out, summary, regressed, improved, stale, first_run: firstRun,
  error_delta: lastErrors === null ? null : summary.error - lastErrors } }];`),
    splitOut('One row per page', 'rows'),
    ifWhen('Live and sheet set?', [[cfg('live'), 'true'], [cfg('sheet_enabled'), 'true']]),
    stop('STOP: dry run - sheet untouched'),
    code('Keep only the sheet columns', `
// The rule list and first-seen map are working fields for the baseline, not columns.
return $input.all().map(({ json: r }) => {
  const { _rules, _first_seen, regressed, improved, stale, first_run, error_delta, summary, ...row } = r;
  return { json: row };
});`),
    sheets.upsert('Upsert audit rows', cfg('audit_sheet_id'), 'Audit', 'url'),
    code('Save this audit as the baseline', `
// Runs after the upsert, so a failed write keeps last week's baseline. Then builds
// the Slack report: regressions first, then fixes, then totals against last week.
const cfg = $('config').first().json;
const c = $('Compare with last week').first().json;
const store = $getWorkflowStaticData('global');
store.pages = Object.fromEntries(c.rows.map(r => [r.url, { issues: r._rules, first_seen: r._first_seen }]));
store.summary = c.summary;
const short = u => u.replace(/^https?:\\/\\/[^/]+/, '') || '/';
const lines = [(cfg.mode === 'test' ? '[TEST] ' : '') + '*Weekly SEO audit*: ' + c.summary.error + ' errors, ' + c.summary.warn + ' warnings, ' + c.summary.pass + ' clean' +
  (c.error_delta === null ? ' (first audit, baseline saved)' : ' (' + (c.error_delta > 0 ? '+' : '') + c.error_delta + ' errors vs last week)')];
if (c.regressed.length) lines.push('', '*Regressed*', ...c.regressed.slice(0, 15).map(r => '- ' + short(r.url) + ': ' + (r.added || 'new page with errors')));
if (c.improved.length) lines.push('', '*Fixed*: ' + c.improved.length + ' page(s), e.g. ' + c.improved.slice(0, 3).map(r => short(r.url) + ' (' + r.cleared + ')').join('; '));
if (c.stale) lines.push('', c.stale + ' page(s) have an issue open for ' + cfg.stale_issue_days + '+ days.');
return [{ json: { text: lines.join('\\n'), worth_posting: c.first_run || c.regressed.length > 0 || c.improved.length > 0 || (c.error_delta || 0) !== 0 } }];`, ),
    ifWhen('Post the change report?', [['$json.worth_posting', 'true'], [cfg('slack_enabled'), 'true']]),
    stop('STOP: no changes, or no Slack channel'),
    slack.post('Post the change report to Slack', cfg('slack_channel_id'), '$json.text'),
  ],
  edges: [
    ['Run manually', 'config'], ['Every Sunday at 22:00', 'config'],
    ['config', 'Use sample pages?'],
    ['Use sample pages?', 0, 'Load sample pages'], ['Use sample pages?', 1, 'List sitemaps'],
    ['List sitemaps', 'Fetch the sitemap'], ['Fetch the sitemap', 'Pick pages to audit'],
    ['Pick pages to audit', 'Fetch each page'], ['Fetch each page', 'Pair pages with their HTML'],
    ['Load sample pages', 'Combine page sources'], ['Pair pages with their HTML', 0, 'Combine page sources', 1],
    ['Combine page sources', 'Audit each page'],
    ['Audit each page', 'Compare with last week'],
    ['Compare with last week', 'One row per page'],
    ['One row per page', 'Live and sheet set?'],
    ['Live and sheet set?', 0, 'Keep only the sheet columns'], ['Keep only the sheet columns', 'Upsert audit rows'],
    ['Upsert audit rows', 'Save this audit as the baseline'], ['Save this audit as the baseline', 'Post the change report?'],
    ['Post the change report?', 0, 'Post the change report to Slack'], ['Post the change report?', 1, 'STOP: no changes, or no Slack channel'], ['Live and sheet set?', 1, 'STOP: dry run - sheet untouched'],
  ],
  groups: [
    { title: 'Start and settings', why: 'Runs every Sunday at 22:00 or by hand, so Monday starts with a fresh list. Length ranges, the page cap and which issues are errors are constants in `config`.', nodes: ['Run manually', 'Every Sunday at 22:00', 'config'] },
    { title: 'Fetch the pages', why: 'The sitemap decides which pages are audited, newest first. A page that fails to load continues as an error row instead of stopping the run. `Load sample pages` returns the same url and HTML pairs.', nodes: ['Use sample pages?', 'Load sample pages', 'List sitemaps', 'Fetch the sitemap', 'Pick pages to audit', 'Fetch each page', 'Pair pages with their HTML', 'Combine page sources'] },
    { title: 'Audit and compare', why: '`Audit each page` reads meta tags with attributes in any order and counts duplicates across the run. `Compare with last week` diffs issues by rule, not by the number in them, and keeps the date each issue first appeared.', nodes: ['Audit each page', 'Compare with last week', 'One row per page'] },
    { title: 'Write the sheet and report', why: 'Rows are upserted on url, so the sheet stays one line per page. The baseline is saved only after that write, and Slack hears only when something regressed, got fixed or the error total moved.', nodes: ['Live and sheet set?', 'STOP: dry run - sheet untouched', 'Keep only the sheet columns', 'Upsert audit rows', 'Save this audit as the baseline', 'Post the change report?', 'STOP: no changes, or no Slack channel', 'Post the change report to Slack'] },
  ],
  scenarios: [
    {
      name: 'shipped config (dry run)', start: 'Run manually',
      expect: { reached: ['Load sample pages', 'STOP: dry run - sheet untouched'], notReached: ['Fetch the sitemap'], outward: 'none' },
      check: out => {
        const f: string[] = [];
        const a = out['Audit each page'][0];
        const by = Object.fromEntries(a.rows.map((r: any) => [r.url.replace('https://www.yourcompany.example', ''), r]));
        const want: Record<string, [string, string]> = {
          '/': ['pass', ''], '/pricing': ['warn', 'title too short (7)'], '/features': ['error', 'missing meta description'],
          '/blog/expense-policy-template': ['warn', 'canonical points to'], '/thank-you': ['error', 'noindex'], '/about': ['error', 'missing title'], '/old-page': ['error', 'page failed to load'],
        };
        for (const [u, [st, issue]] of Object.entries(want)) if (by[u]?.status !== st || !by[u].issues.includes(issue)) f.push(`${u}: expected ${st} "${issue}", got ${by[u]?.status} "${by[u]?.issues}"`);
        if (!by['/pricing']?.issues.includes('duplicate description') || !by['/blog/expense-policy-template']?.issues.includes('duplicate description')) f.push('shared description not flagged on both pages');
        if (!by['/features']?.issues.includes('2 H1 tags')) f.push('two H1s not flagged');
        if (by['/features']?.title !== 'Features: approvals, receipts & exports | Tallyroom') f.push('title entities not decoded');
        if (JSON.stringify(a.summary) !== JSON.stringify({ pass: 1, warn: 2, error: 4 })) f.push(`summary wrong: ${JSON.stringify(a.summary)}`);
        const c = out['Compare with last week'][0];
        const ch = Object.fromEntries(c.rows.map((r: any) => [r.url.replace('https://www.yourcompany.example', ''), r]));
        if (ch['/']?.change !== 'improved' || ch['/'].fixed_issues !== 'description too long') f.push(`/ should be improved, got ${ch['/']?.change} ${ch['/']?.fixed_issues}`);
        if (ch['/pricing']?.change !== 'regressed' || !ch['/pricing'].new_issues.includes('title too short')) f.push(`/pricing should be regressed, got ${ch['/pricing']?.change}`);
        if (ch['/about']?.change !== 'unchanged') f.push(`/about should be unchanged, got ${ch['/about']?.change}`);
        if (ch['/features']?.change !== 'new page') f.push('page missing from last week should be a new page');
        if (!c.regressed.some((r: any) => r.url.endsWith('/features'))) f.push('new page with errors should be listed as regressed');
        return f;
      },
    },
    {
      name: 'live fetch and sheet upsert', start: 'Every Sunday at 22:00',
      overrides: { USE_LIVE_FETCH: true, DRY_RUN: false, AUDIT_SHEET_ID: '1AuditSheet', SLACK_CHANNEL_ID: 'C0SEO0001' },
      mocks: {
        'Fetch the sitemap': [{ data: '<urlset><url><loc>https://shop.example/a</loc><lastmod>2026-01-02</lastmod></url><url><loc>https://shop.example/b</loc><lastmod>2026-01-01</lastmod></url></urlset>' }],
        'Fetch each page': (items: any[]) => items.map(i => ({ data: '<html><head><title>Handmade ceramic mugs and bowls from Lisbon</title><meta name="description" content="Small batch stoneware made in Lisbon. Every mug and bowl is thrown by hand and ships within 3 days."><link rel="canonical" href="' + i.url + '"></head><body><h1>' + i.url + '</h1></body></html>' })),
        'Upsert audit rows': (items: any[]) => items,
        'Post the change report to Slack': [{ ok: true }],
      },
      expect: { reached: ['Fetch each page', 'Upsert audit rows', 'Post the change report to Slack'], outward: 'some' },
      check: out => {
        const f: string[] = [];
        const rows = out['Audit each page'][0].rows;
        if (!(rows.length === 2 && rows.every((r: any) => r.issues === 'duplicate title; duplicate description' && r.status === 'warn'))) f.push(`live rows wrong: ${JSON.stringify(rows.map((r: any) => r.issues))}`);
        const written = out['Upsert audit rows'];
        if (written.some((r: any) => '_rules' in r || '_first_seen' in r) || written[0]?.change !== 'baseline') f.push('sheet rows should carry change=baseline and no working fields');
        if (!out['Save this audit as the baseline'][0].text.includes('first audit')) f.push('first live report should say the baseline was saved');
        return f;
      },
    },
  ],
});
