import { defineSpec } from '../_kit/spec';
import { trigger, code, ifTrue, ifWhen, merge, stop, http, slack } from '../_kit/n';

const cfg = (k: string) => `$('config').first().json.${k}`;

export default defineSpec({
  slug: 'competitor-page-change-monitor',
  title: 'Monitor competitor pricing pages for changes and alert Slack',
  summary: 'Fetches a list of competitor pricing pages every morning, strips the HTML down to visible text, pulls out every price, compares prices and wording with the last snapshot and posts added and removed prices to Slack.',
  category: 'Marketing and content',
  description: {
    who: 'Product marketers and founders who check rival pricing pages by hand every few weeks and find out about a price rise from a prospect. This checks every weekday and only speaks up when a price or a meaningful share of the wording changes.',
    how: [
      'Every weekday at 08:00 it fetches each page in `PAGES`, or uses 3 sample pages until live fetching is on.',
      'Scripts, styles and tags are stripped, then every price such as "$49/mo" or "120 EUR per year" is extracted.',
      'Prices are compared with the snapshot from the last run, and the wording is compared word by word. More than 15% changed wording counts as a change.',
      'One Slack message lists added and removed prices per page. Pages that failed to load are reported and keep their old snapshot.',
    ],
    setup: [
      'Run it once as imported. It compares the sample pages and stops at `STOP: preview - nothing posted`.',
      'List the pages you want to watch in `PAGES` and set `USE_LIVE_FETCH = true`. The first live run saves a baseline and posts the prices it found.',
      'Connect Slack and set `SLACK_CHANNEL_ID`.',
      'Set `TEST_EMAIL` to any address to post with a [TEST] prefix, then set `TEST_RUN = false` for normal alerts.',
    ],
    requirements: ['Public pricing pages that render their prices in HTML', 'A Slack workspace'],
    customize: [
      '`TEXT_CHANGE_PCT` sets how much wording must change before a page without price changes is reported.',
      '`POST_BASELINE` controls whether the first run for a new page posts the prices it found.',
      '`IGNORE_PRICES` drops recurring noise such as "$0" from free tiers.',
    ],
  },
  config: {
    intro: ['USE_LIVE_FETCH false -> SAMPLE page HTML with a built-in previous snapshot.', 'SLACK_CHANNEL_ID blank -> the report is built but not posted.'],
    consts: [
      { name: 'USE_LIVE_FETCH', value: false, note: 'set true to fetch the pages in PAGES (public pages, no credential needed)' },
      { name: 'PAGES', value: [
        { name: 'Rival A pricing', url: 'https://www.rival-a.example/pricing' },
        { name: 'Rival B pricing', url: 'https://www.rival-b.example/plans' },
        { name: 'Rival C pricing', url: 'https://rival-c.example/pricing' },
      ], note: 'pages to watch: a short name and the full URL' },
      { name: 'TEXT_CHANGE_PCT', value: 15, note: 'percent of words that must change before a page with the same prices is reported' },
      { name: 'POST_BASELINE', value: true, note: 'true -> the first run for a new page posts the prices found, so you can check extraction' },
      { name: 'IGNORE_PRICES', value: ['$0', '$0/mo'], note: 'prices never reported (normalised form)' },
      { name: 'SLACK_CHANNEL_ID', value: '', note: 'channel for the change report; blank skips Slack' },
    ],
    flags: { slack_enabled: "SLACK_CHANNEL_ID.trim() !== ''" },
    safety: 'test_run',
  },
  nodes: [
    trigger.manual(),
    trigger.schedule('Every weekday at 08:00', '0 8 * * 1-5'),
    ifWhen('Use sample pages?', [[cfg('use_live_fetch'), 'false']]),
    code('List pages to check', `
// One item per watched page so the HTTP node fetches each in turn.
return $('config').first().json.pages.map(p => ({ json: { name: p.name, url: p.url } }));`),
    http('Fetch each pricing page', { url: '={{ $json.url }}', auth: 'none', headers: { 'User-Agent': 'Mozilla/5.0 (compatible; pricing-monitor/1.0)', Accept: 'text/html' }, timeout: 30000 }),
    code('Pair pages with their HTML', `
// The HTTP node returns the body as a string in "data". Pair it back with the
// page it came from by position; anything that is not a string counts as a failed load.
const pages = $('List pages to check').all();
return $input.all().map((it, i) => ({ json: {
  name: pages[i]?.json.name, url: pages[i]?.json.url,
  html: typeof it.json.data === 'string' ? it.json.data : '',
  previous_html: '',
} }));`),
    code('Load sample page HTML', `
// Used until USE_LIVE_FETCH is true. Each page also carries the HTML "from the
// last run" so the comparison has something to diff against.
const page = (plans) => '<html><head><style>.x{color:red}</style><script>var price="$999";</script></head><body><h1>Pricing</h1>' +
  plans.map(p => '<div class="plan"><h2>' + p[0] + '</h2><p class="price">' + p[1] + '</p><p>' + p[2] + '</p></div>').join('') + '</body></html>';
return [
  { name: 'Rival A pricing', url: 'https://www.rival-a.example/pricing',
    html: page([['Starter', '$29/mo', 'Up to 3 users and 1,000 contacts'], ['Growth', '$89&nbsp;/mo', 'Up to 10 users and 10,000 contacts'], ['Scale', '$199/mo', 'Unlimited users, SSO and audit log']]),
    previous_html: page([['Starter', '$29/mo', 'Up to 3 users and 1,000 contacts'], ['Growth', '$79/mo', 'Up to 10 users and 10,000 contacts'], ['Scale', '$199/mo', 'Unlimited users, SSO and audit log']]) },
  { name: 'Rival B pricing', url: 'https://www.rival-b.example/plans',
    html: page([['Free', '$0', 'One project'], ['Team', '120 EUR per year', 'Per seat, billed yearly']]),
    previous_html: page([['Team', '120 EUR per year', 'Per seat, billed yearly'], ['Free', '$0', 'One project']]) },
  { name: 'Rival C pricing', url: 'https://rival-c.example/pricing', html: '',
    previous_html: page([['Solo', '$15/mo', 'One user'], ['Studio', '$45/mo', 'Five users']]) },
].map(json => ({ json }));`),
    merge('Combine page sources'),
    code('Compare prices with the last snapshot', `
// Strips scripts, styles and tags, decodes the common entities, then pulls every
// price into a normalised form ("$89/mo", "120 eur/yr"). Prices and the word set
// are compared with the stored snapshot. Snapshots are saved only for live
// fetches, and never for a page that failed to load.
const cfg = $('config').first().json;
const store = $getWorkflowStaticData('global');
store.pages = store.pages || {};
const ignore = new Set(cfg.ignore_prices.map(p => p.toLowerCase()));
const visible = html => html
  .replace(/<(script|style|noscript|svg)[\\s\\S]*?<\\/\\1>/gi, ' ').replace(/<!--[\\s\\S]*?-->/g, ' ').replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/&#36;/g, '$').replace(/&euro;/g, '€').replace(/&pound;/g, '£')
  .replace(/\\s+/g, ' ').trim();
const PRICE = /(?:[$€£]\\s?\\d{1,3}(?:,\\d{3})*(?:\\.\\d{1,2})?|\\b\\d{1,3}(?:,\\d{3})*(?:\\.\\d{1,2})?\\s?(?:usd|eur|gbp)\\b)(?:\\s?(?:\\/|per)\\s?(?:mo|month|yr|year|user|seat))?/gi;
const norm = p => p.toLowerCase().replace(/\\s+/g, ' ').replace(/\\s?(?:\\/|per)\\s?(month|mo)$/, '/mo').replace(/\\s?(?:\\/|per)\\s?(year|yr)$/, '/yr')
  .replace(/\\s?(?:\\/|per)\\s?(user|seat)$/, '/seat').replace(/^([$€£])\\s/, '$1');
const extract = html => {
  const text = visible(html);
  return { prices: [...new Set((text.match(PRICE) || []).map(norm))].filter(x => !ignore.has(x)).sort(),
    words: [...new Set(text.toLowerCase().replace(/[^a-z0-9,.$€£ ]/g, ' ').split(' ').filter(w => w.length > 1))] };
};
const reports = [];
for (const { json: p } of $input.all()) {
  if (!p.html) { reports.push({ name: p.name, url: p.url, status: 'failed to load', added: [], removed: [], text_change_pct: 0 }); continue; }
  const { prices, words } = extract(p.html);
  const prev = store.pages[p.url] || (p.previous_html ? extract(p.previous_html) : null);
  let status, added = [], removed = [], pct = 0;
  if (!prev) status = 'baseline';
  else {
    added = prices.filter(x => !prev.prices.includes(x));
    removed = prev.prices.filter(x => !prices.includes(x));
    const a = new Set(words), b = new Set(prev.words);
    const union = new Set([...a, ...b]).size || 1;
    const same = [...a].filter(w => b.has(w)).length;
    pct = Math.round((1 - same / union) * 100);
    status = added.length || removed.length ? 'prices changed' : pct >= cfg.text_change_pct ? 'wording changed' : 'no change';
  }
  if (cfg.use_live_fetch) store.pages[p.url] = { prices, words: words.slice(0, 3000), checked_at: new Date().toISOString() };
  reports.push({ name: p.name, url: p.url, status, prices, added, removed, text_change_pct: pct });
}
return [{ json: { reports } }];`),
    code('Build the change report', `
// One Slack message. Unchanged pages are counted, not listed.
const cfg = $('config').first().json;
const { reports } = $input.first().json;
const show = reports.filter(r => r.status === 'prices changed' || r.status === 'wording changed' || r.status === 'failed to load' || (r.status === 'baseline' && cfg.post_baseline));
const lines = show.map(r => {
  if (r.status === 'prices changed') return '*<' + r.url + '|' + r.name + '>*: ' + [r.added.length ? 'new ' + r.added.join(', ') : '', r.removed.length ? 'gone ' + r.removed.join(', ') : ''].filter(Boolean).join('; ');
  if (r.status === 'wording changed') return '*<' + r.url + '|' + r.name + '>*: same prices, ' + r.text_change_pct + '% of the wording changed';
  if (r.status === 'baseline') return '*<' + r.url + '|' + r.name + '>*: now tracking ' + (r.prices.length ? r.prices.join(', ') : 'no prices found, check the page renders server side');
  return '*' + r.name + '*: failed to load, old snapshot kept';
});
const unchanged = reports.filter(r => r.status === 'no change').length;
const alert = reports.some(r => r.status === 'prices changed' || r.status === 'wording changed' || (r.status === 'baseline' && cfg.post_baseline));
const text = [(cfg.mode === 'test' ? '[TEST] ' : '') + '*Competitor pricing check*', ...lines, unchanged ? unchanged + ' page(s) unchanged.' : ''].filter(Boolean).join('\\n');
return [{ json: { alert, text, changed: reports.filter(r => r.status === 'prices changed').length, unchanged } }];`),
    ifWhen('Anything worth reporting?', [['$json.alert', 'true']]),
    stop('STOP: no changes'),
    ifTrue('Posting switched on?', cfg('sends_enabled')),
    stop('STOP: preview - nothing posted'),
    ifTrue('Slack channel set?', cfg('slack_enabled')),
    stop('STOP: no Slack channel'),
    slack.post('Post the report to Slack', cfg('slack_channel_id'), '$json.text'),
  ],
  edges: [
    ['Run manually', 'config'], ['Every weekday at 08:00', 'config'],
    ['config', 'Use sample pages?'],
    ['Use sample pages?', 0, 'Load sample page HTML'], ['Use sample pages?', 1, 'List pages to check'],
    ['List pages to check', 'Fetch each pricing page'], ['Fetch each pricing page', 'Pair pages with their HTML'],
    ['Load sample page HTML', 'Combine page sources'], ['Pair pages with their HTML', 0, 'Combine page sources', 1],
    ['Combine page sources', 'Compare prices with the last snapshot'],
    ['Compare prices with the last snapshot', 'Build the change report'],
    ['Build the change report', 'Anything worth reporting?'],
    ['Anything worth reporting?', 0, 'Posting switched on?'], ['Anything worth reporting?', 1, 'STOP: no changes'],
    ['Posting switched on?', 0, 'Slack channel set?'], ['Posting switched on?', 1, 'STOP: preview - nothing posted'],
    ['Slack channel set?', 0, 'Post the report to Slack'], ['Slack channel set?', 1, 'STOP: no Slack channel'],
  ],
  groups: [
    { title: 'Start and settings', why: 'Runs every weekday at 08:00 or by hand. The watched pages, the wording threshold and the ignore list live in `config`.', nodes: ['Run manually', 'Every weekday at 08:00', 'config'] },
    { title: 'Fetch the pages', why: 'Pricing pages are public, so `Fetch each pricing page` needs no credential, but it still waits for `USE_LIVE_FETCH`. Until then `Load sample page HTML` also carries the HTML from the last run so the diff can be watched offline.', nodes: ['Use sample pages?', 'Load sample page HTML', 'List pages to check', 'Fetch each pricing page', 'Pair pages with their HTML', 'Combine page sources'] },
    { title: 'Diff against the last snapshot', why: 'Prices are compared as a set, so reordered plans are not a change. A page that failed to load keeps its old snapshot, which stops the next run from reporting every price as new.', nodes: ['Compare prices with the last snapshot', 'Build the change report', 'Anything worth reporting?', 'STOP: no changes'] },
    { title: 'Post to Slack', why: 'Nothing is posted while `TEST_RUN` is true and `TEST_EMAIL` is blank. A test post carries a [TEST] prefix. A blank channel ends at `STOP: no Slack channel`.', nodes: ['Posting switched on?', 'STOP: preview - nothing posted', 'Slack channel set?', 'STOP: no Slack channel', 'Post the report to Slack'] },
  ],
  scenarios: [
    {
      name: 'shipped config (preview)', start: 'Run manually',
      expect: { reached: ['Load sample page HTML', 'STOP: preview - nothing posted'], notReached: ['Fetch each pricing page'], outward: 'none' },
      check: out => {
        const f: string[] = [];
        const r = out['Compare prices with the last snapshot'][0].reports;
        const a = r.find((x: any) => x.name === 'Rival A pricing');
        if (a?.status !== 'prices changed' || a.added.join() !== '$89/mo' || a.removed.join() !== '$79/mo') f.push(`Rival A diff wrong: ${JSON.stringify(a)}`);
        const b = r.find((x: any) => x.name === 'Rival B pricing');
        if (b?.status !== 'no change') f.push(`Rival B should be unchanged ($0 ignored, script price ignored), got ${b?.status} ${b?.prices}`);
        if (r.find((x: any) => x.name === 'Rival C pricing')?.status !== 'failed to load') f.push('empty page should be a failed load');
        if (!out['Build the change report'][0].text.includes('new $89/mo; gone $79/mo')) f.push('report text missing the price diff');
        return f;
      },
    },
    {
      name: 'live first run posts the baseline', start: 'Every weekday at 08:00',
      overrides: { USE_LIVE_FETCH: true, TEST_RUN: false, SLACK_CHANNEL_ID: 'C0PRICING1' },
      mocks: {
        'Fetch each pricing page': (items: any[]) => items.map((_, i) => ({ data: i === 1 ? '' : '<html><body><h2>Pro</h2><span>£' + (40 + i) + ' per month</span><script>x="$5"</script></body></html>' })),
        'Post the report to Slack': [{ ok: true, ts: '1700000000.0001' }],
      },
      expect: { reached: ['Pair pages with their HTML', 'Post the report to Slack'], outward: 'some' },
      check: out => {
        const r = out['Compare prices with the last snapshot'][0].reports;
        const f: string[] = [];
        if (r[0].status !== 'baseline' || r[0].prices.join() !== '£40/mo') f.push(`baseline wrong: ${JSON.stringify(r[0])}`);
        if (r[1].status !== 'failed to load') f.push('empty body should be a failed load');
        if (!out['Build the change report'][0].text.includes('now tracking £42/mo')) f.push('baseline line missing');
        return f;
      },
    },
  ],
});
