import { defineSpec } from '../_kit/spec';
import { trigger, code, ifTrue, ifWhen, merge, stop, http, sheets } from '../_kit/n';

const cfg = (k: string) => `$('config').first().json.${k}`;

// n.ts has no option for "never error", so a 404 would stop the run. The node-level
// onError setting keeps going and hands the error to the next node instead.
const tolerant = (n: ReturnType<typeof http>) => ({ ...n, onError: 'continueRegularOutput' } as ReturnType<typeof http>);

export default defineSpec({
  slug: 'utm-link-validator',
  title: 'Validate campaign links in Google Sheets before launch',
  summary: 'Checks every campaign link in a Google Sheets tab for URL syntax, required and lowercase UTM parameters, allowed mediums, duplicate utm_content within a campaign and a reachable landing page, then writes ok, warn or fail with the reasons back to each row.',
  category: 'Marketing and content',
  description: {
    who: 'Marketing teams who build UTM links in a spreadsheet before a launch and find the broken ones in analytics a week later. Every row gets a status and a plain reason before anything goes out.',
    how: [
      'Every weekday at 08:00 it reads the Links tab, or 8 sample links until the sheet is connected. Rows already marked ok are skipped.',
      'Each link is checked for a valid https URL, utm_source, utm_medium and utm_campaign present, lowercase values without spaces, and a medium from your allowed list.',
      'utm_content used twice in the same campaign is flagged, because the two ads become one row in your reports.',
      'Each landing page is requested once (without the query string) and anything other than a 2xx or 3xx fails the row. The status and reasons are written back by link_id.',
    ],
    setup: [
      'Run it once as imported. It checks the sample links and stops at `STOP: dry run - sheet untouched`.',
      'Create a Links tab with link_id, url, campaign, status, issues and checked_at columns, connect Google Sheets and set `LINKS_SHEET_ID`.',
      'Set `USE_LIVE_CHECKS = true` to request real landing pages.',
      'Read the results in `Write a status for each row`, then set `DRY_RUN = false` to fill the status column.',
    ],
    requirements: ['A Google Sheet with your campaign links'],
    customize: [
      '`REQUIRED_PARAMS` and `ALLOWED_MEDIUMS` hold your naming rules.',
      '`WARN_ONLY` lists checks that should warn instead of fail, such as http links.',
      '`SLOW_MS` flags landing pages slower than this.',
    ],
  },
  config: {
    intro: ['LINKS_SHEET_ID blank -> SAMPLE links. USE_LIVE_CHECKS false -> SAMPLE landing page results.', 'DRY_RUN true -> results are shown, the sheet is not written.'],
    consts: [
      { name: 'LINKS_SHEET_ID', value: '', note: 'Google Sheets id with a Links tab; blank uses sample links' },
      { name: 'USE_LIVE_CHECKS', value: false, note: 'set true to request each landing page (public GET, no credential)' },
      { name: 'REQUIRED_PARAMS', value: ['utm_source', 'utm_medium', 'utm_campaign'], note: 'parameters every link must carry' },
      { name: 'ALLOWED_MEDIUMS', value: ['email', 'cpc', 'paid_social', 'social', 'display', 'referral', 'affiliate', 'sms'], note: 'utm_medium values your reports expect' },
      { name: 'WARN_ONLY', value: ['not https', 'medium not in ALLOWED_MEDIUMS', 'duplicate utm_content in campaign', 'slow landing page'], note: 'checks that warn instead of fail' },
      { name: 'SLOW_MS', value: 3000, note: 'landing pages slower than this are flagged' },
      { name: 'RECHECK_OK', value: false, note: 'true -> rows already marked ok are checked again' },
    ],
    flags: { sheet_enabled: "LINKS_SHEET_ID.trim() !== ''" },
    safety: 'dry_run',
  },
  nodes: [
    trigger.manual(),
    trigger.schedule('Every weekday at 08:00', '0 8 * * 1-5'),
    ifTrue('Links sheet set?', cfg('sheet_enabled')),
    sheets.read('Read the campaign links', cfg('links_sheet_id'), 'Links'),
    code('Load sample links', `
// Used until LINKS_SHEET_ID is set. Same columns as the Links tab, one row per rule.
const u = 'https://www.yourcompany.example';
return [
  { link_id: 'L-001', campaign: 'q4-launch', url: u + '/launch?utm_source=newsletter&utm_medium=email&utm_campaign=q4-launch&utm_content=hero-button', status: '' },
  { link_id: 'L-002', campaign: 'q4-launch', url: u + '/launch?utm_source=Facebook&utm_medium=paid_social&utm_campaign=q4 launch', status: '' },
  { link_id: 'L-003', campaign: 'q4-launch', url: u + '/launch?utm_source=linkedin&utm_campaign=q4-launch', status: '' },
  { link_id: 'L-004', campaign: 'q4-launch', url: u + '/old-launch-page?utm_source=google&utm_medium=cpc&utm_campaign=q4-launch', status: '' },
  { link_id: 'L-005', campaign: 'q4-launch', url: u + '/launch?utm_source=partner-blog&utm_medium=banner&utm_campaign=q4-launch', status: '' },
  { link_id: 'L-006', campaign: 'q4-launch', url: u + '/pricing?utm_source=newsletter&utm_medium=email&utm_campaign=q4-launch&utm_content=hero-button', status: '' },
  { link_id: 'L-007', campaign: 'q4-launch', url: 'www.yourcompany.example/launch?utm_source=x', status: '' },
  { link_id: 'L-008', campaign: 'q4-launch', url: 'http://www.yourcompany.example/launch?utm_source=podcast&utm_medium=referral&utm_campaign=q4-launch', status: '' },
  { link_id: 'L-009', campaign: 'q3-sale', url: u + '/sale?utm_source=newsletter&utm_medium=email&utm_campaign=q3-sale', status: 'ok' },
].map((json, i) => ({ json: { row_number: i + 2, ...json } }));`),
    merge('Combine link sources'),
    code('Check the link rules', `
// Every rule that can be checked without a request. Each failed rule adds a
// plain-language issue; WARN_ONLY decides later whether it fails the row.
const cfg = $('config').first().json;
const rows = $input.all().map(i => i.json).filter(r => r.link_id && r.url && (cfg.recheck_ok || String(r.status).toLowerCase() !== 'ok'));
const contentSeen = {};
const out = rows.map(r => {
  const issues = [];
  const raw = String(r.url).trim();
  let u = null;
  try { u = new URL(raw); if (!/^https?:$/.test(u.protocol)) u = null; } catch (e) { u = null; }
  if (!u) return { ...r, issues: ['not a valid URL (needs https://)'], landing: '' };
  if (u.protocol !== 'https:') issues.push('not https');
  const qs = raw.split('?')[1] || '';
  const pairs = qs.split('&').filter(Boolean).map(p => p.split('='));
  const names = pairs.map(p => decodeURIComponent(p[0]));
  for (const p of cfg.required_params) if (!names.includes(p)) issues.push('missing ' + p);
  for (const n of [...new Set(names.filter((n, i) => names.indexOf(n) !== i))]) issues.push(n + ' appears twice');
  for (const [k, v = ''] of pairs) {
    if (!k.startsWith('utm_')) continue;
    const val = decodeURIComponent(v.replace(/\\+/g, ' '));
    if (!val) issues.push(k + ' is empty');
    else if (/\\s/.test(val)) issues.push(k + ' has spaces');
    if (val && val !== val.toLowerCase()) issues.push(k + ' is not lowercase');
  }
  const medium = u.searchParams.get('utm_medium');
  if (medium && !cfg.allowed_mediums.includes(medium)) issues.push('medium not in ALLOWED_MEDIUMS');
  const content = u.searchParams.get('utm_content');
  const camp = u.searchParams.get('utm_campaign') || r.campaign;
  if (content) {
    const k = camp + '|' + content;
    if (contentSeen[k]) { issues.push('duplicate utm_content in campaign'); contentSeen[k].issues.push('duplicate utm_content in campaign'); }
    else contentSeen[k] = { issues };
  }
  return { ...r, issues, landing: u.origin + u.pathname };
});
return out.map(json => ({ json }));`),
    ifWhen('Use sample page results?', [[cfg('use_live_checks'), 'false']]),
    code('List unique landing pages', `
// One request per distinct landing page, not per link, to keep the load polite.
const pages = [...new Set($input.all().map(i => i.json.landing).filter(Boolean))];
return pages.map(landing => ({ json: { landing, started: Date.now() } }));`),
    tolerant(http('Request the landing page', { url: '={{ $json.landing }}', auth: 'none', fullResponse: true, timeout: 15000, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; link-checker/1.0)' } })),
    code('Read status codes', `
// Full responses carry statusCode. A failed request arrives as an error item;
// the status is read from its message ("status code 404") or counted as 0.
const pages = $('List unique landing pages').all();
return $input.all().map((it, i) => {
  const j = it.json;
  const err = j.error ? String(j.error.message || j.error) : '';
  const code = j.statusCode || Number((err.match(/status code (\\d{3})/) || [])[1] || 0);
  return { json: { landing: pages[i].json.landing, status_code: code, ms: Date.now() - pages[i].json.started, error: code ? '' : err.slice(0, 120) } };
});`),
    code('Load sample status codes', `
// Used until USE_LIVE_CHECKS is true: one retired page and one slow page.
const pages = [...new Set($input.all().map(i => i.json.landing).filter(Boolean))];
return pages.map(landing => ({ json: { landing, status_code: landing.endsWith('/old-launch-page') ? 404 : 200, ms: landing.endsWith('/pricing') ? 4200 : 640, error: '' } }));`),
    merge('Combine status results'),
    code('Write a status for each row', `
// Joins rule issues with the landing page result. Any issue outside WARN_ONLY
// fails the row; WARN_ONLY issues alone make it warn.
const cfg = $('config').first().json;
const byPage = Object.fromEntries($input.all().map(i => [i.json.landing, i.json]));
const warnOnly = new Set(cfg.warn_only);
const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
return $('Check the link rules').all().map(({ json: r }) => {
  const issues = [...r.issues];
  const page = byPage[r.landing];
  if (page) {
    if (!page.status_code) issues.push('landing page unreachable' + (page.error ? ': ' + page.error : ''));
    else if (page.status_code >= 400) issues.push('landing page returns ' + page.status_code);
    else if (page.ms > cfg.slow_ms) issues.push('slow landing page');
  }
  const status = !issues.length ? 'ok' : issues.every(x => warnOnly.has(x)) ? 'warn' : 'fail';
  return { json: { row_number: r.row_number, link_id: r.link_id, status, issues: issues.join('; '), checked_at: stamp } };
});`),
    ifWhen('Live and sheet set?', [[cfg('live'), 'true'], [cfg('sheet_enabled'), 'true']]),
    stop('STOP: dry run - sheet untouched'),
    sheets.update('Write status to the sheet', cfg('links_sheet_id'), 'Links', 'link_id'),
  ],
  edges: [
    ['Run manually', 'config'], ['Every weekday at 08:00', 'config'],
    ['config', 'Links sheet set?'],
    ['Links sheet set?', 0, 'Read the campaign links'], ['Links sheet set?', 1, 'Load sample links'],
    ['Read the campaign links', 'Combine link sources'], ['Load sample links', 0, 'Combine link sources', 1],
    ['Combine link sources', 'Check the link rules'],
    ['Check the link rules', 'Use sample page results?'],
    ['Use sample page results?', 0, 'Load sample status codes'], ['Use sample page results?', 1, 'List unique landing pages'],
    ['List unique landing pages', 'Request the landing page'], ['Request the landing page', 'Read status codes'],
    ['Load sample status codes', 'Combine status results'], ['Read status codes', 0, 'Combine status results', 1],
    ['Combine status results', 'Write a status for each row'],
    ['Write a status for each row', 'Live and sheet set?'],
    ['Live and sheet set?', 0, 'Write status to the sheet'], ['Live and sheet set?', 1, 'STOP: dry run - sheet untouched'],
  ],
  groups: [
    { title: 'Start and settings', why: 'Runs every weekday at 08:00 or by hand. Required parameters, allowed mediums and which checks only warn are constants in `config`.', nodes: ['Run manually', 'Every weekday at 08:00', 'config'] },
    { title: 'Read the links', why: 'Reads the Links tab once the sheet id is set. `Load sample links` holds one row per rule, plus a row already marked ok that is skipped unless `RECHECK_OK` is true.', nodes: ['Links sheet set?', 'Read the campaign links', 'Load sample links', 'Combine link sources', 'Check the link rules'] },
    { title: 'Check the landing pages', why: 'Rule checks run first and cost nothing. Landing pages are then requested once each, without the query string, and a 404 or timeout is read as a result instead of stopping the run.', nodes: ['Use sample page results?', 'Load sample status codes', 'List unique landing pages', 'Request the landing page', 'Read status codes', 'Combine status results'] },
    { title: 'Write the status back', why: '`Write a status for each row` decides ok, warn or fail and lists every reason. The sheet is updated by link_id only when `DRY_RUN` is false, so the first runs change nothing.', nodes: ['Write a status for each row', 'Live and sheet set?', 'STOP: dry run - sheet untouched', 'Write status to the sheet'] },
  ],
  scenarios: [
    {
      name: 'shipped config (dry run)', start: 'Run manually',
      expect: { reached: ['Load sample links', 'Load sample status codes', 'STOP: dry run - sheet untouched'], notReached: ['Request the landing page'], outward: 'none' },
      check: out => {
        const f: string[] = [];
        const rows = Object.fromEntries(out['Write a status for each row'].map((r: any) => [r.link_id, r]));
        if (Object.keys(rows).length !== 8) f.push(`expected 8 rows checked (ok row skipped), got ${Object.keys(rows).length}`);
        const want: Record<string, [string, string]> = {
          'L-001': ['warn', 'duplicate utm_content in campaign'], 'L-002': ['fail', 'utm_campaign has spaces'], 'L-003': ['fail', 'missing utm_medium'],
          'L-004': ['fail', 'landing page returns 404'], 'L-005': ['warn', 'medium not in ALLOWED_MEDIUMS'], 'L-006': ['warn', 'slow landing page'],
          'L-007': ['fail', 'not a valid URL'], 'L-008': ['warn', 'not https'],
        };
        for (const [id, [st, issue]] of Object.entries(want)) {
          if (rows[id]?.status !== st || !rows[id]?.issues.includes(issue)) f.push(`${id}: expected ${st} with "${issue}", got ${rows[id]?.status} "${rows[id]?.issues}"`);
        }
        if (!rows['L-002']?.issues.includes('utm_source is not lowercase')) f.push('uppercase utm_source not caught');
        return f;
      },
    },
    {
      name: 'live checks and sheet update', start: 'Every weekday at 08:00',
      overrides: { LINKS_SHEET_ID: '1LinksSheetSample', USE_LIVE_CHECKS: true, DRY_RUN: false },
      mocks: {
        'Read the campaign links': [
          { row_number: 2, link_id: 'A1', campaign: 'spring', url: 'https://shop.example/spring?utm_source=newsletter&utm_medium=email&utm_campaign=spring', status: '' },
          { row_number: 3, link_id: 'A2', campaign: 'spring', url: 'https://shop.example/gone?utm_source=newsletter&utm_medium=email&utm_campaign=spring', status: '' },
        ],
        'Request the landing page': (items: any[]) => items.map(i => i.landing.endsWith('/gone') ? { error: { message: 'Request failed with status code 410' } } : { statusCode: 200, headers: {}, body: '<html></html>' }),
        'Write status to the sheet': (items: any[]) => items,
      },
      expect: { reached: ['Request the landing page', 'Write status to the sheet'], outward: 'some' },
      check: out => {
        const r = Object.fromEntries(out['Write a status for each row'].map((x: any) => [x.link_id, x]));
        return r.A1?.status === 'ok' && r.A2?.status === 'fail' && r.A2.issues === 'landing page returns 410' ? [] : [`live statuses wrong: ${JSON.stringify(r)}`];
      },
    },
  ],
});
