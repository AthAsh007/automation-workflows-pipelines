import { defineSpec } from '../_kit/spec';
import { trigger, code, ifTrue, ifWhen, merge, stop, http, splitOut, gmail } from '../_kit/n';

const cfg = (k: string) => `$('config').first().json.${k}`;

// Two settings n.ts does not expose: keep going when a page errors (so a 404 is a
// result, not a crash) and do not follow redirects (so a 301 is visible).
const pageCheck = (n: ReturnType<typeof http>) => ({ ...n, onError: 'continueRegularOutput',
  parameters: { ...n.parameters, options: { ...n.parameters.options, redirect: { redirect: { followRedirects: false } } } } } as ReturnType<typeof http>);

export default defineSpec({
  slug: 'sitemap-broken-link-report',
  title: 'Check a sitemap for broken pages and email a weekly report with Gmail',
  summary: 'Reads your sitemap every Monday, requests up to 200 pages, sorts them into ok, redirect, 4xx, 5xx and unreachable, compares with last week and emails a report only when something broke or got fixed.',
  category: 'Productivity and operations',
  description: {
    who: 'Site owners and marketers who publish often and only learn about a broken page when a customer sends a screenshot. You get one email a week, and only when the list of problems changed.',
    how: [
      'Every Monday at 07:00 it reads each sitemap in `SITEMAP_URLS`, or a sample sitemap until live checks are on.',
      'Page URLs matching `EXCLUDE_PATTERNS` are dropped and the 200 most recently modified are kept.',
      'Each page is requested without following redirects and sorted into ok, redirect, client error (4xx), server error (5xx) or unreachable (timeout or DNS).',
      'Results are compared with last week. If a page newly broke or got fixed, an HTML email lists new problems first, then fixes, then problems that remain.',
    ],
    setup: [
      'Run it once as imported. It checks the sample sitemap and stops at `STOP: preview - nothing sent`.',
      'Put your sitemap address in `SITEMAP_URLS` and set `USE_LIVE_CHECKS = true`. For a sitemap index, list the child sitemaps instead.',
      'Connect Gmail to `Email the report` and set `REPORT_TO`.',
      'Put your address in `TEST_EMAIL` to receive a test report. Set `TEST_RUN = false` to send to `REPORT_TO` and save the weekly baseline.',
    ],
    requirements: ['A public XML sitemap', 'A Gmail account'],
    customize: [
      '`MAX_URLS` caps the pages checked per run.',
      '`REPORT_REDIRECTS` decides whether redirects count as problems.',
      '`ALWAYS_SEND` true sends the report every week, changed or not.',
    ],
  },
  config: {
    intro: ['USE_LIVE_CHECKS false -> SAMPLE sitemap and SAMPLE page results.', 'The report is emailed only when problems changed since the last live run.'],
    consts: [
      { name: 'USE_LIVE_CHECKS', value: false, note: 'set true to fetch the sitemap and request every page (public GETs)' },
      { name: 'SITEMAP_URLS', value: ['https://www.yourcompany.example/sitemap.xml'], note: 'sitemaps to read; list child sitemaps rather than an index' },
      { name: 'EXCLUDE_PATTERNS', value: ['/tag/', '/author/', '?'], note: 'URLs containing any of these are not checked' },
      { name: 'MAX_URLS', value: 200, note: 'most recently modified pages checked per run' },
      { name: 'REPORT_REDIRECTS', value: true, note: 'true -> redirects are listed as problems (sitemaps should list final URLs)' },
      { name: 'ALWAYS_SEND', value: false, note: 'true -> email every week even when nothing changed' },
      { name: 'REPORT_TO', value: 'web-team@yourcompany.example', note: 'who gets the report' },
    ],
    safety: 'test_run',
  },
  nodes: [
    trigger.manual(),
    trigger.schedule('Every Monday at 07:00', '0 7 * * 1'),
    ifWhen('Use the sample sitemap?', [[cfg('use_live_checks'), 'false']]),
    code('Load sample sitemap', `
// Used until USE_LIVE_CHECKS is true. Same body the HTTP node returns: XML text in "data".
const d = n => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
const u = (path, days) => '<url><loc>https://www.yourcompany.example' + path + '</loc><lastmod>' + d(days) + '</lastmod></url>';
const xml = '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
  [u('/', 1), u('/pricing', 3), u('/blog/onboarding-emails', 5), u('/blog/old-launch-post', 40), u('/integrations/legacy-crm', 90),
   u('/careers', 12), u('/blog/tag/email', 2), u('/docs/api', 7), u('/case-studies/harbour-dental', 20)].join('') + '</urlset>';
return [{ json: { data: xml } }];`),
    code('List sitemaps', `
// One item per sitemap file.
return $('config').first().json.sitemap_urls.map(url => ({ json: { url } }));`),
    http('Fetch the sitemap', { url: '={{ $json.url }}', auth: 'none', headers: { Accept: 'application/xml,text/xml' } }),
    merge('Combine sitemap sources'),
    code('Pick URLs to check', `
// <loc> + <lastmod> from every sitemap, minus EXCLUDE_PATTERNS, newest first,
// capped at MAX_URLS. A sitemap index is reported rather than silently empty.
const cfg = $('config').first().json;
const all = [], notes = [];
for (const { json } of $input.all()) {
  const xml = typeof json.data === 'string' ? json.data : '';
  if (/<sitemapindex/i.test(xml)) { notes.push('a sitemap index was found; list its child sitemaps in SITEMAP_URLS'); continue; }
  for (const m of xml.matchAll(/<url>([\\s\\S]*?)<\\/url>/g)) {
    const loc = (m[1].match(/<loc>\\s*([^<\\s]+)\\s*<\\/loc>/) || [])[1];
    const lastmod = (m[1].match(/<lastmod>\\s*([^<\\s]+)\\s*<\\/lastmod>/) || [])[1] || '';
    if (loc) all.push({ url: loc.replace(/&amp;/g, '&'), lastmod });
  }
}
const unique = [...new Map(all.map(x => [x.url, x])).values()];
const kept = unique.filter(x => !cfg.exclude_patterns.some(p => x.url.includes(p))).sort((a, b) => b.lastmod.localeCompare(a.lastmod));
return [{ json: { urls: kept.slice(0, cfg.max_urls), found: unique.length, excluded: unique.length - kept.length, capped: Math.max(0, kept.length - cfg.max_urls), notes } }];`),
    splitOut('One item per page', 'urls'),
    ifWhen('Use sample page results?', [[cfg('use_live_checks'), 'false']]),
    code('Load sample page results', `
// Used until USE_LIVE_CHECKS is true: what the page request returns for each case.
const cases = { '/blog/old-launch-post': { error: { message: 'Request failed with status code 404' } },
  '/integrations/legacy-crm': { error: { message: 'Request failed with status code 301' } },
  '/careers': { error: { message: 'Request failed with status code 503' } },
  '/docs/api': { error: { message: 'timeout of 15000ms exceeded' } } };
return $input.all().map(({ json }) => {
  const path = new URL(json.url).pathname;
  return { json: { url: json.url, ...(cases[path] || { statusCode: 200, headers: { 'content-type': 'text/html' }, body: '' }) } };
});`),
    pageCheck(http('Request each page', { url: '={{ $json.url }}', auth: 'none', fullResponse: true, timeout: 15000, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; sitemap-checker/1.0)' } })),
    code('Read page responses', `
// Pair each response with its URL by position. Errors carry the status code in
// their message; anything without one is unreachable.
const pages = $('One item per page').all();
return $input.all().map((it, i) => ({ json: { url: pages[i].json.url, statusCode: it.json.statusCode, error: it.json.error } }));`),
    merge('Combine page results'),
    code('Classify and compare with last week', `
// Classes: ok, redirect, client error, server error, unreachable. "Changed" means
// a page newly has a problem or a previous problem is gone.
const cfg = $('config').first().json;
const prev = $getWorkflowStaticData('global').last || {};
const classify = j => {
  const err = j.error ? String(j.error.message || j.error) : '';
  const code = j.statusCode || Number((err.match(/status code (\\d{3})/) || [])[1] || 0);
  if (!code) return { cls: 'unreachable', code: 0, detail: /timeout/i.test(err) ? 'timed out' : err.slice(0, 80) || 'no response' };
  if (code < 300) return { cls: 'ok', code };
  if (code < 400) return { cls: cfg.report_redirects ? 'redirect' : 'ok', code };
  return { cls: code < 500 ? 'client error' : 'server error', code };
};
const now = {}, rows = [];
for (const { json } of $input.all()) { const c = classify(json); now[json.url] = c.cls; rows.push({ url: json.url, ...c }); }
const problems = rows.filter(r => r.cls !== 'ok');
const fresh = problems.filter(r => prev[r.url] !== r.cls);
const ongoing = problems.filter(r => prev[r.url] === r.cls);
const fixed = Object.entries(prev).filter(([u, c]) => c !== 'ok' && now[u] === 'ok').map(([url, was]) => ({ url, was }));
const counts = rows.reduce((a, r) => (a[r.cls] = (a[r.cls] || 0) + 1, a), {});
return [{ json: { checked: rows.length, counts, fresh, ongoing, fixed, changed: fresh.length > 0 || fixed.length > 0, state: now } }];`),
    code('Build the email report', `
// Plain HTML, new problems first. Subject carries the counts so the inbox says enough.
const cfg = $('config').first().json;
const r = $input.first().json;
const sm = $('Pick URLs to check').first().json;
const li = x => '<li><a href="' + x.url + '">' + x.url + '</a> - ' + x.cls + (x.code ? ' (' + x.code + ')' : '') + (x.detail ? ', ' + x.detail : '') + '</li>';
const section = (title, list, fmt) => list.length ? '<h3>' + title + ' (' + list.length + ')</h3><ul>' + list.map(fmt).join('') + '</ul>' : '';
const html = '<p>' + r.checked + ' pages checked from ' + sm.found + ' in the sitemap (' + sm.excluded + ' excluded' + (sm.capped ? ', ' + sm.capped + ' over MAX_URLS' : '') + ').</p>' +
  section('New problems', r.fresh, li) + section('Fixed since last week', r.fixed, x => '<li>' + x.url + ' (was ' + x.was + ')</li>') + section('Still broken', r.ongoing, li) +
  (sm.notes.length ? '<p>' + sm.notes.join('<br>') + '</p>' : '');
const subject = 'Sitemap check: ' + r.fresh.length + ' new problem' + (r.fresh.length === 1 ? '' : 's') + ', ' + r.fixed.length + ' fixed, ' + r.ongoing.length + ' still broken';
return [{ json: { subject, html, send: r.changed || cfg.always_send, send_to: cfg.mode === 'test' ? cfg.test_email : cfg.report_to } }];`),
    ifWhen('Anything changed?', [['$json.send', 'true']]),
    stop('STOP: nothing changed since last week'),
    ifTrue('Sending switched on?', cfg('sends_enabled')),
    stop('STOP: preview - nothing sent'),
    gmail.send('Email the report', { to: '$json.send_to', subject: "($('config').first().json.mode === 'test' ? '[TEST] ' : '') + $json.subject", message: '$json.html', html: true }),
    ifTrue('Live run?', cfg('live')),
    stop('STOP: test send - baseline kept'),
    code('Save this week as the baseline', `
// Live only: next week compares against these classes.
const store = $getWorkflowStaticData('global');
store.last = $('Classify and compare with last week').first().json.state;
store.saved_at = new Date().toISOString();
return [{ json: { saved: Object.keys(store.last).length } }];`),
  ],
  edges: [
    ['Run manually', 'config'], ['Every Monday at 07:00', 'config'],
    ['config', 'Use the sample sitemap?'],
    ['Use the sample sitemap?', 0, 'Load sample sitemap'], ['Use the sample sitemap?', 1, 'List sitemaps'],
    ['List sitemaps', 'Fetch the sitemap'],
    ['Load sample sitemap', 'Combine sitemap sources'], ['Fetch the sitemap', 0, 'Combine sitemap sources', 1],
    ['Combine sitemap sources', 'Pick URLs to check'],
    ['Pick URLs to check', 'One item per page'],
    ['One item per page', 'Use sample page results?'],
    ['Use sample page results?', 0, 'Load sample page results'], ['Use sample page results?', 1, 'Request each page'],
    ['Request each page', 'Read page responses'],
    ['Load sample page results', 'Combine page results'], ['Read page responses', 0, 'Combine page results', 1],
    ['Combine page results', 'Classify and compare with last week'],
    ['Classify and compare with last week', 'Build the email report'],
    ['Build the email report', 'Anything changed?'],
    ['Anything changed?', 0, 'Sending switched on?'], ['Anything changed?', 1, 'STOP: nothing changed since last week'],
    ['Sending switched on?', 0, 'Email the report'], ['Sending switched on?', 1, 'STOP: preview - nothing sent'],
    ['Email the report', 'Live run?'],
    ['Live run?', 0, 'Save this week as the baseline'], ['Live run?', 1, 'STOP: test send - baseline kept'],
  ],
  groups: [
    { title: 'Start and settings', why: 'Runs every Monday at 07:00 or by hand. Sitemaps, exclusions, the URL cap and the recipient live in `config`.', nodes: ['Run manually', 'Every Monday at 07:00', 'config'] },
    { title: 'Read the sitemap', why: '`Pick URLs to check` drops excluded paths and keeps the most recently modified pages, so a cap of 200 still covers what changed lately. A sitemap index is reported instead of producing an empty run.', nodes: ['Use the sample sitemap?', 'Load sample sitemap', 'List sitemaps', 'Fetch the sitemap', 'Combine sitemap sources', 'Pick URLs to check'] },
    { title: 'Request every page', why: 'Redirects are not followed, so a 301 in the sitemap is visible. A 404 or timeout continues as data instead of stopping the run. `Load sample page results` returns the same error shapes.', nodes: ['One item per page', 'Use sample page results?', 'Load sample page results', 'Request each page', 'Read page responses', 'Combine page results'] },
    { title: 'Compare with last week', why: 'Problems are compared by class per URL, so a page that stays broken is listed once under still broken, and the email only goes out when something new broke or got fixed.', nodes: ['Classify and compare with last week', 'Build the email report', 'Anything changed?', 'STOP: nothing changed since last week'] },
    { title: 'Send and save the baseline', why: 'Nothing is emailed in preview. A test send goes to `TEST_EMAIL` and keeps last week\'s baseline, so the live run still sees the same changes.', nodes: ['Sending switched on?', 'STOP: preview - nothing sent', 'Email the report', 'Live run?', 'STOP: test send - baseline kept', 'Save this week as the baseline'] },
  ],
  scenarios: [
    {
      name: 'shipped config (preview)', start: 'Run manually',
      expect: { reached: ['Load sample sitemap', 'Load sample page results', 'STOP: preview - nothing sent'], notReached: ['Request each page'], outward: 'none' },
      check: out => {
        const f: string[] = [];
        const p = out['Pick URLs to check'][0];
        if (p.urls.length !== 8 || p.excluded !== 1) f.push(`expected 8 URLs and 1 excluded, got ${p.urls.length}/${p.excluded}`);
        const c = out['Classify and compare with last week'][0];
        const want = { ok: 4, redirect: 1, 'client error': 1, 'server error': 1, unreachable: 1 };
        if (JSON.stringify(c.counts, Object.keys(want)) !== JSON.stringify(want)) f.push(`counts wrong: ${JSON.stringify(c.counts)}`);
        if (c.fresh.length !== 4 || !c.changed) f.push('first run should report 4 new problems');
        if (!out['Build the email report'][0].subject.startsWith('Sitemap check: 4 new problems')) f.push('subject wrong');
        return f;
      },
    },
    {
      name: 'live checks and email', start: 'Every Monday at 07:00',
      overrides: { USE_LIVE_CHECKS: true, TEST_RUN: false },
      mocks: {
        'Fetch the sitemap': [{ data: '<urlset><url><loc>https://www.yourcompany.example/</loc></url><url><loc>https://www.yourcompany.example/gone</loc></url></urlset>' }],
        'Request each page': (items: any[]) => items.map(i => i.url.endsWith('/gone') ? { error: { message: 'Request failed with status code 410' } } : { statusCode: 200, body: '' }),
        'Email the report': [{ id: 'msg-1', labelIds: ['SENT'] }],
      },
      expect: { reached: ['Request each page', 'Email the report', 'Save this week as the baseline'], outward: 'some' },
      check: out => {
        const r = out['Build the email report'][0];
        return r.send_to === 'web-team@yourcompany.example' && r.html.includes('/gone') ? [] : ['live report should go to REPORT_TO and list /gone'];
      },
    },
  ],
});
