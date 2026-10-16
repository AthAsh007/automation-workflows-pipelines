import { defineSpec } from '../_kit/spec';
import { trigger, code, ifTrue, ifWhen, merge, stop, http, splitOut, sheets, slack } from '../_kit/n';

const cfg = (k: string) => `$('config').first().json.${k}`;

// n.ts has no "never error" option; a Lighthouse failure on one page should be
// reported, not stop the run, so the node continues with the error as its output.
const tolerant = (n: ReturnType<typeof http>) => ({ ...n, onError: 'continueRegularOutput' } as ReturnType<typeof http>);

export default defineSpec({
  slug: 'pagespeed-trend-alerts',
  title: 'Track PageSpeed Insights scores in Google Sheets and alert on drops',
  summary: 'Runs PageSpeed Insights for each page on mobile and desktop every morning, compares the performance score, LCP and CLS with the median of the last 7 runs stored in Google Sheets, posts drops to Slack and appends the new scores to the history tab.',
  category: 'Productivity and operations',
  description: {
    who: 'Developers and marketers who own a site\'s speed and only notice a slow release when rankings or conversions drop. One Lighthouse run is noisy, so drops are measured against a rolling median instead of yesterday.',
    how: [
      'Every day at 06:00 it runs PageSpeed Insights for each URL in `PAGES` on mobile and desktop, or uses sample results until it is switched on.',
      'The last 7 results per page and device are read from the Scores tab and their median becomes the baseline.',
      'A score 10+ points under the median, an LCP 25% and 300 ms over it, or CLS crossing 0.1 is a drop. Pages with fewer than 3 past runs are still building a baseline.',
      'Drops are posted to Slack with before and after numbers, and every result is appended to the Scores tab.',
    ],
    setup: [
      'Run it once as imported. It compares sample results and stops at `STOP: preview - nothing posted` and `STOP: test run - history not written`.',
      'List your pages in `PAGES` and set `USE_LIVE_PSI = true`. Add a free API key to `PSI_API_KEY` if you test more than a few pages.',
      'Connect Google Sheets, create a Scores tab with date, url, strategy, score, lcp_ms, cls and tbt_ms columns, and set `HISTORY_SHEET_ID`. Connect Slack and set `SLACK_CHANNEL_ID`.',
      'Set `TEST_EMAIL` to any address to post alerts with a [TEST] prefix. Set `TEST_RUN = false` to post and record history.',
    ],
    requirements: ['Public pages to test', 'A Google Sheet for the history', 'A Slack workspace'],
    customize: [
      '`DROP_POINTS`, `LCP_RISE_PCT` and `CLS_LIMIT` set what counts as a drop.',
      '`WINDOW` and `MIN_HISTORY` control the baseline.',
      '`STRATEGIES` can be reduced to mobile only.',
    ],
  },
  config: {
    intro: ['USE_LIVE_PSI false -> SAMPLE Lighthouse results. HISTORY_SHEET_ID blank -> SAMPLE history.', 'SLACK_CHANNEL_ID blank -> alerts are built but not posted.'],
    consts: [
      { name: 'USE_LIVE_PSI', value: false, note: 'set true to call the PageSpeed Insights API (public)' },
      { name: 'PSI_API_KEY', value: '', note: 'optional Google API key for higher quota; blank works for a few pages a day' },
      { name: 'PAGES', value: ['https://www.yourcompany.example/', 'https://www.yourcompany.example/pricing'], note: 'pages to test' },
      { name: 'STRATEGIES', value: ['mobile', 'desktop'], note: 'devices to test each page on' },
      { name: 'HISTORY_SHEET_ID', value: '', note: 'Google Sheets id with a Scores tab; blank uses sample history' },
      { name: 'WINDOW', value: 7, note: 'past runs per page and device used for the median' },
      { name: 'MIN_HISTORY', value: 3, note: 'past runs needed before a drop is reported' },
      { name: 'DROP_POINTS', value: 10, note: 'score points under the median that count as a drop (0-100 scale)' },
      { name: 'LCP_RISE_PCT', value: 25, note: 'LCP this many percent over the median (and 300 ms or more) is a drop' },
      { name: 'CLS_LIMIT', value: 0.1, note: 'CLS crossing this from below is a drop' },
      { name: 'SLACK_CHANNEL_ID', value: '', note: 'channel for alerts; blank skips Slack' },
    ],
    flags: { sheet_enabled: "HISTORY_SHEET_ID.trim() !== ''", slack_enabled: "SLACK_CHANNEL_ID.trim() !== ''" },
    safety: 'test_run',
  },
  nodes: [
    trigger.manual(),
    trigger.schedule('Every day at 06:00', '0 6 * * *'),
    ifWhen('Use sample results?', [[cfg('use_live_psi'), 'false']]),
    code('Load sample PageSpeed results', `
// Used until USE_LIVE_PSI is true. The parts of a runPagespeed response this
// workflow reads: home on mobile has regressed, pricing on mobile has a slow LCP.
const r = (url, ff, score, lcp, cls, tbt) => ({ id: url, analysisUTCTimestamp: new Date().toISOString(), lighthouseResult: { requestedUrl: url, finalUrl: url,
  configSettings: { formFactor: ff }, categories: { performance: { score } }, audits: {
    'largest-contentful-paint': { numericValue: lcp }, 'cumulative-layout-shift': { numericValue: cls }, 'total-blocking-time': { numericValue: tbt } } } });
const home = 'https://www.yourcompany.example/', pricing = 'https://www.yourcompany.example/pricing';
return [r(home, 'mobile', 0.62, 3900, 0.04, 610), r(home, 'desktop', 0.95, 1100, 0.01, 40), r(pricing, 'mobile', 0.78, 4100, 0.12, 280), r(pricing, 'desktop', 0.97, 900, 0.0, 20)].map(json => ({ json }));`),
    code('List pages to test', `
// One item per page and device.
const cfg = $('config').first().json;
return cfg.pages.flatMap(url => cfg.strategies.map(strategy => ({ json: { url, strategy } })));`),
    tolerant(http('Run PageSpeed Insights', {
      url: `={{ 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed' + (${cfg('psi_api_key')} ? '?key=' + ${cfg('psi_api_key')} : '') }}`, auth: 'none',
      query: { url: '={{ $json.url }}', strategy: '={{ $json.strategy }}', category: 'performance' }, timeout: 90000,
    })),
    merge('Combine result sources'),
    code('Read the Lighthouse results', `
// PSI response -> one compact result per page and device, all in one item so the
// history read below runs once. A failed run keeps its error for the alert.
const pairs = (() => { try { return $('List pages to test').all().map(i => i.json); } catch (e) { return []; } })();
const results = $input.all().map((it, i) => {
  const j = it.json, lh = j.lighthouseResult;
  if (!lh) return { url: pairs[i]?.url || '', strategy: pairs[i]?.strategy || '', error: String(j.error?.message || j.error || 'no Lighthouse result').slice(0, 140) };
  const a = lh.audits || {};
  return { url: lh.requestedUrl || j.id, strategy: lh.configSettings?.formFactor || pairs[i]?.strategy,
    score: Math.round((lh.categories?.performance?.score ?? 0) * 100),
    lcp_ms: Math.round(a['largest-contentful-paint']?.numericValue || 0), cls: Math.round((a['cumulative-layout-shift']?.numericValue || 0) * 1000) / 1000,
    tbt_ms: Math.round(a['total-blocking-time']?.numericValue || 0) };
});
return [{ json: { results } }];`),
    ifTrue('History sheet set?', cfg('sheet_enabled')),
    sheets.read('Read score history', cfg('history_sheet_id'), 'Scores'),
    code('Load sample history', `
// Used until HISTORY_SHEET_ID is set: 7 days for three of the four pairs, one day
// for pricing on desktop, which is still building its baseline.
const day = n => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
const home = 'https://www.yourcompany.example/', pricing = 'https://www.yourcompany.example/pricing';
const rows = [];
[80, 82, 79, 81, 83, 80, 81].forEach((s, i) => rows.push({ date: day(i + 1), url: home, strategy: 'mobile', score: s, lcp_ms: 2500 + i * 20, cls: 0.03, tbt_ms: 300 }));
[96, 95, 97, 96, 96, 94, 96].forEach((s, i) => rows.push({ date: day(i + 1), url: home, strategy: 'desktop', score: s, lcp_ms: 1050, cls: 0.01, tbt_ms: 30 }));
[80, 79, 81, 80, 82, 78, 80].forEach((s, i) => rows.push({ date: day(i + 1), url: pricing, strategy: 'mobile', score: s, lcp_ms: 2600, cls: 0.05, tbt_ms: 250 }));
rows.push({ date: day(1), url: pricing, strategy: 'desktop', score: 98, lcp_ms: 880, cls: 0, tbt_ms: 10 });
return rows.map(json => ({ json }));`),
    merge('Combine history sources'),
    code('Compare with the rolling median', `
// Baseline = median of the last WINDOW runs per url + device (today excluded, so
// a second run on the same day does not compare with itself).
const cfg = $('config').first().json;
const { results } = $('Read the Lighthouse results').first().json;
const today = new Date().toISOString().slice(0, 10);
const hist = $input.all().map(i => i.json).filter(r => r.url && r.strategy && String(r.date).slice(0, 10) !== today);
const median = xs => { const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const checks = results.map(r => {
  if (r.error) return { ...r, verdict: 'failed', reasons: ['PageSpeed run failed: ' + r.error] };
  const past = hist.filter(h => h.url === r.url && h.strategy === r.strategy).sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, cfg.window);
  if (past.length < cfg.min_history) return { ...r, verdict: 'baseline', reasons: [], history: past.length };
  const m = { score: median(past.map(p => Number(p.score))), lcp: median(past.map(p => Number(p.lcp_ms))), cls: median(past.map(p => Number(p.cls))) };
  const reasons = [];
  if (m.score - r.score >= cfg.drop_points) reasons.push('score ' + r.score + ' vs median ' + m.score);
  if (r.lcp_ms > m.lcp * (1 + cfg.lcp_rise_pct / 100) && r.lcp_ms - m.lcp >= 300) reasons.push('LCP ' + (r.lcp_ms / 1000).toFixed(1) + 's vs median ' + (m.lcp / 1000).toFixed(1) + 's');
  if (r.cls > cfg.cls_limit && m.cls <= cfg.cls_limit) reasons.push('CLS ' + r.cls + ' crossed ' + cfg.cls_limit + ' (median ' + m.cls + ')');
  return { ...r, verdict: reasons.length ? 'drop' : 'steady', reasons, median: m, history: past.length };
});
const rows = results.filter(r => !r.error).map(r => ({ date: today, url: r.url, strategy: r.strategy, score: r.score, lcp_ms: r.lcp_ms, cls: r.cls, tbt_ms: r.tbt_ms }));
const alerts = checks.filter(c => c.verdict === 'drop' || c.verdict === 'failed');
const text = [(cfg.mode === 'test' ? '[TEST] ' : '') + '*PageSpeed: ' + alerts.length + ' page' + (alerts.length === 1 ? '' : 's') + ' need a look*',
  ...alerts.map(a => '- ' + a.url + ' (' + a.strategy + '): ' + a.reasons.join('; '))].join('\\n');
return [{ json: { checks, rows, alert_count: alerts.length, text } }];`),
    splitOut('One row per result', 'rows'),
    ifWhen('Any drops to report?', [['$json.alert_count', 'gt', 0]]),
    stop('STOP: no drops'),
    ifTrue('Posting switched on?', cfg('sends_enabled')),
    stop('STOP: preview - nothing posted'),
    ifTrue('Slack channel set?', cfg('slack_enabled')),
    stop('STOP: no Slack channel'),
    slack.post('Post the alert to Slack', cfg('slack_channel_id'), '$json.text'),
    ifWhen('Live and sheet set?', [[cfg('live'), 'true'], [cfg('sheet_enabled'), 'true']]),
    stop('STOP: test run - history not written'),
    sheets.append('Append scores to the history sheet', cfg('history_sheet_id'), 'Scores'),
  ],
  edges: [
    ['Run manually', 'config'], ['Every day at 06:00', 'config'],
    ['config', 'Use sample results?'],
    ['Use sample results?', 0, 'Load sample PageSpeed results'], ['Use sample results?', 1, 'List pages to test'],
    ['List pages to test', 'Run PageSpeed Insights'],
    ['Load sample PageSpeed results', 'Combine result sources'], ['Run PageSpeed Insights', 0, 'Combine result sources', 1],
    ['Combine result sources', 'Read the Lighthouse results'],
    ['Read the Lighthouse results', 'History sheet set?'],
    ['History sheet set?', 0, 'Read score history'], ['History sheet set?', 1, 'Load sample history'],
    ['Read score history', 'Combine history sources'], ['Load sample history', 0, 'Combine history sources', 1],
    ['Combine history sources', 'Compare with the rolling median'],
    ['Compare with the rolling median', 'One row per result'],
    ['Compare with the rolling median', 'Any drops to report?'],
    ['Any drops to report?', 0, 'Posting switched on?'], ['Any drops to report?', 1, 'STOP: no drops'],
    ['Posting switched on?', 0, 'Slack channel set?'], ['Posting switched on?', 1, 'STOP: preview - nothing posted'],
    ['Slack channel set?', 0, 'Post the alert to Slack'], ['Slack channel set?', 1, 'STOP: no Slack channel'],
    ['One row per result', 'Live and sheet set?'],
    ['Live and sheet set?', 0, 'Append scores to the history sheet'], ['Live and sheet set?', 1, 'STOP: test run - history not written'],
  ],
  groups: [
    { title: 'Start and settings', why: 'Runs every day at 06:00 or by hand. Pages, devices and every drop threshold are constants in `config`.', nodes: ['Run manually', 'Every day at 06:00', 'config'] },
    { title: 'Run PageSpeed Insights', why: 'One API call per page and device, which takes 10 to 30 seconds each. A failed Lighthouse run is passed on as an error and reported, so one broken page never hides the others.', nodes: ['Use sample results?', 'Load sample PageSpeed results', 'List pages to test', 'Run PageSpeed Insights', 'Combine result sources', 'Read the Lighthouse results'] },
    { title: 'Read the history', why: 'The history lives in your own sheet, so the trend is visible outside n8n too. `Read the Lighthouse results` emits a single item so the sheet is read once, not once per page.', nodes: ['History sheet set?', 'Read score history', 'Load sample history', 'Combine history sources'] },
    { title: 'Compare and alert', why: 'A median of 7 runs absorbs normal Lighthouse noise of a few points. Pages with under 3 runs stay quiet while the baseline builds. Alerts go out only when posting is on and a channel is set.', nodes: ['Compare with the rolling median', 'One row per result', 'Any drops to report?', 'STOP: no drops', 'Posting switched on?', 'STOP: preview - nothing posted', 'Slack channel set?', 'STOP: no Slack channel', 'Post the alert to Slack'] },
    { title: 'Record today', why: 'Rows are appended only on a live run with a sheet set. Test runs never add rows, so they cannot shift tomorrow\'s median.', nodes: ['Live and sheet set?', 'STOP: test run - history not written', 'Append scores to the history sheet'] },
  ],
  scenarios: [
    {
      name: 'shipped config (preview)', start: 'Run manually',
      expect: { reached: ['Load sample PageSpeed results', 'Load sample history', 'STOP: preview - nothing posted', 'STOP: test run - history not written'], outward: 'none' },
      check: out => {
        const f: string[] = [];
        const c = out['Compare with the rolling median'][0];
        const by = Object.fromEntries(c.checks.map((x: any) => [x.url.replace('https://www.yourcompany.example', '') + ' ' + x.strategy, x]));
        if (by['/ mobile']?.verdict !== 'drop' || !by['/ mobile'].reasons.some((r: string) => r.startsWith('score 62 vs median 81'))) f.push(`home mobile: ${JSON.stringify(by['/ mobile'])}`);
        if (!by['/ mobile']?.reasons.some((r: string) => r.startsWith('LCP 3.9s'))) f.push('home mobile LCP rise missed');
        if (by['/ desktop']?.verdict !== 'steady') f.push('home desktop should be steady');
        const pm = by['/pricing mobile'];
        if (pm?.verdict !== 'drop' || pm.reasons.length !== 2) f.push(`pricing mobile should have LCP and CLS reasons: ${JSON.stringify(pm?.reasons)}`);
        if (by['/pricing desktop']?.verdict !== 'baseline') f.push('pricing desktop should be building a baseline');
        if (c.alert_count !== 2 || c.rows.length !== 4) f.push(`expected 2 alerts and 4 rows, got ${c.alert_count}/${c.rows.length}`);
        return f;
      },
    },
    {
      name: 'live PSI with history, Slack and sheet', start: 'Every day at 06:00',
      overrides: { USE_LIVE_PSI: true, HISTORY_SHEET_ID: '1ScoresSheet', SLACK_CHANNEL_ID: 'C0PERF001', TEST_RUN: false, PAGES: ['https://shop.example/'], STRATEGIES: ['mobile', 'desktop'] },
      mocks: {
        'Run PageSpeed Insights': (items: any[]) => items.map(i => i.strategy === 'desktop' ? { error: { message: 'Lighthouse returned error: NO_FCP' } }
          : { id: i.url, lighthouseResult: { requestedUrl: i.url, configSettings: { formFactor: 'mobile' }, categories: { performance: { score: 0.55 } },
            audits: { 'largest-contentful-paint': { numericValue: 2400 }, 'cumulative-layout-shift': { numericValue: 0.02 }, 'total-blocking-time': { numericValue: 900 } } } }),
        'Read score history': [70, 72, 71, 69].map((s, i) => ({ date: new Date(Date.now() - (i + 1) * 864e5).toISOString().slice(0, 10), url: 'https://shop.example/', strategy: 'mobile', score: s, lcp_ms: 2300, cls: 0.02, tbt_ms: 400 })),
        'Post the alert to Slack': [{ ok: true }],
        'Append scores to the history sheet': (items: any[]) => items,
      },
      expect: { reached: ['Run PageSpeed Insights', 'Read score history', 'Post the alert to Slack', 'Append scores to the history sheet'], outward: 'some' },
      check: out => {
        const c = out['Compare with the rolling median'][0];
        const f: string[] = [];
        if (c.alert_count !== 2) f.push(`expected a score drop and a failed run, got ${c.alert_count}`);
        if (out['Append scores to the history sheet'].length !== 1) f.push('only the successful run should be appended');
        return f;
      },
    },
  ],
});
