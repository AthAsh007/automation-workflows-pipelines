import { defineSpec } from '../_kit/spec';
import { trigger, code, ifWhen, merge, stop, http, splitOut, sheets } from '../_kit/n';

const cfg = (k: string) => `$('config').first().json.${k}`;

// n.ts has no "never error" option. A page that 404s should become an audit row,
// not stop the run, so the node continues with the error as its output.
const tolerant = (n: ReturnType<typeof http>) => ({ ...n, onError: 'continueRegularOutput' } as ReturnType<typeof http>);

const page = (title: string, desc: string | null, h1s: number, canonical: string | null, extra = '') =>
  `'<html><head>${title !== null ? `<title>${title}</title>` : ''}${desc !== null ? `<meta content="${desc}" name="description">` : ''}${canonical ? `<link rel="canonical" href="${canonical}">` : ''}${extra}</head><body>${'<h1>Heading</h1>'.repeat(h1s)}<p>Body</p></body></html>'`;

export default defineSpec({
  slug: 'seo-missing-meta-audit',
  title: 'Audit sitemap pages for missing titles and meta descriptions in Google Sheets',
  summary: 'Reads your sitemap, fetches each page, checks the title, meta description, H1, canonical and noindex tags against length and duplicate rules, and writes one audit row per page to a Google Sheets tab with pass, warn or error and the reasons.',
  category: 'Marketing and content',
  description: {
    who: 'Marketers and site owners who want a page-by-page list of SEO basics to fix, without paying for a crawler subscription. The sheet becomes the to-do list, updated every week.',
    how: [
      'Every Sunday at 22:00 it reads your sitemap and fetches up to 150 pages, or 7 sample pages until live fetching is on.',
      'Each page is checked for a title of 30-60 characters, a meta description of 70-160, exactly one H1, a canonical that points to itself, and no noindex tag.',
      'Titles and descriptions used on more than one page are flagged on every page that shares them.',
      'Missing tags, noindex and failed loads are errors, the rest are warnings. One row per page is upserted on the url column of the Audit tab.',
    ],
    setup: [
      'Run it once as imported. It audits the sample pages and stops at `STOP: dry run - sheet untouched`.',
      'Set `SITEMAP_URLS` and `USE_LIVE_FETCH = true`, then run it and read the rows in `Audit each page`.',
      'Connect Google Sheets, create an Audit tab with a url column, and set `AUDIT_SHEET_ID`.',
      'Set `DRY_RUN = false` to write the rows.',
    ],
    requirements: ['A public XML sitemap', 'A Google Sheet with an Audit tab'],
    customize: [
      '`TITLE_LENGTH` and `DESCRIPTION_LENGTH` hold the min and max characters.',
      '`MAX_PAGES` caps the pages fetched per run.',
      '`ERROR_RULES` decides which issues count as errors rather than warnings.',
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
    ],
    flags: { sheet_enabled: "AUDIT_SHEET_ID.trim() !== ''" },
    safety: 'dry_run',
  },
  nodes: [
    trigger.manual(),
    trigger.schedule('Every Sunday at 22:00', '0 22 * * 0'),
    ifWhen('Use sample pages?', [[cfg('use_live_fetch'), 'false']]),
    code('Load sample pages', `
// Used until USE_LIVE_FETCH is true. Each item is a page URL and its HTML, the
// same pair the live branch produces, with one problem per page.
const base = 'https://www.yourcompany.example';
return [
  { url: base + '/', html: ${page('Team expense tracking for small companies | Tallyroom', 'Track shared team expenses, approve them in one click and export to your accounting tool. Free for teams of up to 5.', 1, 'https://www.yourcompany.example/')} },
  { url: base + '/pricing', html: ${page('Pricing', 'Plans and pricing for Tallyroom. Start free, upgrade when your team grows past five people.', 1, 'https://www.yourcompany.example/pricing')} },
  { url: base + '/features', html: ${page('Features: approvals, receipts &amp; exports | Tallyroom', null, 2, 'https://www.yourcompany.example/features')} },
  { url: base + '/blog/expense-policy-template', html: ${page('Free expense policy template for small teams (2026 edition)', 'Plans and pricing for Tallyroom. Start free, upgrade when your team grows past five people.', 1, 'https://www.yourcompany.example/blog/expense-policies')} },
  { url: base + '/thank-you', html: ${page('Thanks for signing up to the Tallyroom newsletter', 'You are on the list. Expect one email a month with expense tips, templates and product news.', 0, null, '<meta name="robots" content="noindex, follow">')} },
  { url: base + '/about', html: ${page('', 'Who we are, why we started Tallyroom in 2021 and the six people who build and support it every day.', 1, 'https://www.yourcompany.example/about')} },
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
    splitOut('One row per page', 'rows'),
    ifWhen('Live and sheet set?', [[cfg('live'), 'true'], [cfg('sheet_enabled'), 'true']]),
    stop('STOP: dry run - sheet untouched'),
    sheets.upsert('Upsert audit rows', cfg('audit_sheet_id'), 'Audit', 'url'),
  ],
  edges: [
    ['Run manually', 'config'], ['Every Sunday at 22:00', 'config'],
    ['config', 'Use sample pages?'],
    ['Use sample pages?', 0, 'Load sample pages'], ['Use sample pages?', 1, 'List sitemaps'],
    ['List sitemaps', 'Fetch the sitemap'], ['Fetch the sitemap', 'Pick pages to audit'],
    ['Pick pages to audit', 'Fetch each page'], ['Fetch each page', 'Pair pages with their HTML'],
    ['Load sample pages', 'Combine page sources'], ['Pair pages with their HTML', 0, 'Combine page sources', 1],
    ['Combine page sources', 'Audit each page'],
    ['Audit each page', 'One row per page'],
    ['One row per page', 'Live and sheet set?'],
    ['Live and sheet set?', 0, 'Upsert audit rows'], ['Live and sheet set?', 1, 'STOP: dry run - sheet untouched'],
  ],
  groups: [
    { title: 'Start and settings', why: 'Runs every Sunday at 22:00 or by hand, so Monday starts with a fresh list. Length ranges, the page cap and which issues are errors are constants in `config`.', nodes: ['Run manually', 'Every Sunday at 22:00', 'config'] },
    { title: 'Fetch the pages', why: 'The sitemap decides which pages are audited, newest first. A page that fails to load continues as an error row instead of stopping the run. `Load sample pages` returns the same url and HTML pairs.', nodes: ['Use sample pages?', 'Load sample pages', 'List sitemaps', 'Fetch the sitemap', 'Pick pages to audit', 'Fetch each page', 'Pair pages with their HTML', 'Combine page sources'] },
    { title: 'Audit the tags', why: '`Audit each page` reads meta tags with attributes in any order, because CMS themes write content before name as often as after. Duplicate titles are counted across the whole run, so both pages get the flag.', nodes: ['Audit each page', 'One row per page'] },
    { title: 'Write the audit sheet', why: 'Rows are upserted on url, so next week updates the same row and the sheet stays one line per page. Nothing is written while `DRY_RUN` is true.', nodes: ['Live and sheet set?', 'STOP: dry run - sheet untouched', 'Upsert audit rows'] },
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
        return f;
      },
    },
    {
      name: 'live fetch and sheet upsert', start: 'Every Sunday at 22:00',
      overrides: { USE_LIVE_FETCH: true, DRY_RUN: false, AUDIT_SHEET_ID: '1AuditSheet' },
      mocks: {
        'Fetch the sitemap': [{ data: '<urlset><url><loc>https://shop.example/a</loc><lastmod>2026-01-02</lastmod></url><url><loc>https://shop.example/b</loc><lastmod>2026-01-01</lastmod></url></urlset>' }],
        'Fetch each page': (items: any[]) => items.map(i => ({ data: '<html><head><title>Handmade ceramic mugs and bowls from Lisbon</title><meta name="description" content="Small batch stoneware made in Lisbon. Every mug and bowl is thrown by hand and ships within 3 days."><link rel="canonical" href="' + i.url + '"></head><body><h1>' + i.url + '</h1></body></html>' })),
        'Upsert audit rows': (items: any[]) => items,
      },
      expect: { reached: ['Fetch each page', 'Upsert audit rows'], outward: 'some' },
      check: out => {
        const rows = out['Audit each page'][0].rows;
        return rows.length === 2 && rows.every((r: any) => r.issues === 'duplicate title; duplicate description' && r.status === 'warn') ? [] : [`live rows wrong: ${JSON.stringify(rows.map((r: any) => r.issues))}`];
      },
    },
  ],
});
