import { defineSpec } from '../_kit/spec';
import { trigger, code, ifTrue, ifWhen, merge, stop, http, slack } from '../_kit/n';

const cfg = (k: string) => `$('config').first().json.${k}`;

// The kit's http() has no switch for "do not fail on 4xx/5xx or timeouts", which an
// uptime check needs: a down site must come back as data, not stop the run.
const checkNode = (() => {
  const n = http('Check each URL', { url: '={{ $json.url }}', auth: 'none', fullResponse: true, headers: { 'User-Agent': 'n8n-uptime-check' } });
  n.parameters.options.response.response.neverError = true;
  n.parameters.options.response.response.responseFormat = 'text';
  n.parameters.options.timeout = `={{ ${cfg('timeout_ms')} }}`;
  n.retryOnFail = false;
  (n as any).onError = 'continueRegularOutput';
  return n;
})();

export default defineSpec({
  slug: 'uptime-check-slack-alerts',
  title: 'Alert Slack when a website fails two uptime checks in a row',
  summary: 'Checks a list of URLs every 5 minutes for status code, response time and an expected keyword, keeps a failure streak per URL, and posts to Slack once when a site goes down and once when it recovers.',
  category: 'DevOps and engineering',
  description: {
    who: 'Small teams and agencies running 3 to 50 websites who want to hear about an outage before a customer does, without paying for a monitoring service or getting paged by one slow response.',
    how: [
      'Every 5 minutes each URL in `MONITORS` is requested with a `TIMEOUT_MS` limit. A manual run uses sample results until `USE_LIVE_CHECKS` is true.',
      'A check fails on a status outside 200-399, a timeout or connection error, or a missing keyword in the page body.',
      'A streak of failures is kept per URL. The site is marked down when the streak reaches `FAILS_BEFORE_ALERT` (2 by default), so one blip never alerts.',
      'Slack gets one message when a site goes down and one when it comes back, with the reason and how long it was down. Nothing repeats while the state holds.',
    ],
    setup: [
      'Run it once as imported. It evaluates sample results and stops at `STOP: dry run - nothing posted`.',
      'Put your sites in `MONITORS`, with an optional keyword that only appears on a healthy page, and set `USE_LIVE_CHECKS = true`.',
      'Connect Slack and set `SLACK_CHANNEL_ID`.',
      'Set `DRY_RUN = false` and activate the workflow. Streaks are kept in workflow static data, which n8n saves for active workflows only.',
    ],
    requirements: ['Public URLs to check', 'A Slack workspace'],
    customize: [
      '`FAILS_BEFORE_ALERT` trades speed for noise: 2 means about 10 minutes to the first alert.',
      '`TIMEOUT_MS` is the slowest response that still counts as up.',
      '`MENTION` adds a Slack handle such as `<!here>` to down alerts only.',
    ],
  },
  config: {
    intro: ['USE_LIVE_CHECKS false -> SAMPLE results, so the streak logic can be watched offline.', 'SLACK_CHANNEL_ID blank -> no alert is posted.'],
    consts: [
      { name: 'USE_LIVE_CHECKS', value: false, note: 'true requests every URL below for real' },
      { name: 'MONITORS', value: [
        { name: 'Marketing site', url: 'https://www.northwind.example', keyword: 'Northwind' },
        { name: 'API health', url: 'https://api.northwind.example/health', keyword: 'ok' },
        { name: 'Shop', url: 'https://shop.northwind.example', keyword: 'Add to cart' },
        { name: 'Docs', url: 'https://docs.northwind.example', keyword: '' },
        { name: 'Status page', url: 'https://status.northwind.example', keyword: '' },
      ], note: 'what to check; keyword blank skips the body check' },
      { name: 'TIMEOUT_MS', value: 8000, note: 'a response slower than this counts as a failure' },
      { name: 'FAILS_BEFORE_ALERT', value: 2, note: 'consecutive failures before a site is called down' },
      { name: 'SLACK_CHANNEL_ID', value: '', note: 'channel for down and recovery alerts; blank skips Slack' },
      { name: 'MENTION', value: '<!here>', note: 'added to down alerts; blank for none' },
    ],
    flags: { slack_enabled: "SLACK_CHANNEL_ID.trim() !== ''" },
    safety: 'dry_run',
  },
  nodes: [
    trigger.manual(),
    trigger.schedule('Every 5 minutes', '*/5 * * * *'),
    code('List monitors', `
// One item per URL, so each request and its result stay paired by position.
return $('config').first().json.monitors.filter(m => m.url).map(m => ({ json: m }));`),
    ifTrue('Live checks on?', cfg('use_live_checks')),
    checkNode,
    code('Read check results', `
// Response (or error) i belongs to monitor i. A failure records the first reason found.
const monitors = $('List monitors').all().map(i => i.json);
const results = $input.all().map((it, i) => {
  const m = monitors[i] || {};
  const r = it.json;
  const status = Number(r.statusCode || 0);
  const body = typeof r.body === 'string' ? r.body : JSON.stringify(r.body || '');
  const err = r.error ? (r.error.message || String(r.error)) : '';
  const reason = err ? (/timeout|ETIMEDOUT|aborted/i.test(err) ? 'timed out' : 'connection error: ' + err.slice(0, 80)) :
    status < 200 || status > 399 ? 'HTTP ' + status :
    m.keyword && !body.includes(m.keyword) ? 'keyword "' + m.keyword + '" missing' : '';
  return { name: m.name, url: m.url, ok: !reason, status, reason };
});
return [{ json: { results, sample_previous: null } }];`),
    code('Load sample check results', `
// Used until USE_LIVE_CHECKS is true. Includes the state from "previous runs" so one
// run shows a new outage, a first strike, an ongoing outage and a recovery.
const ago = m => new Date(Date.now() - m * 60000).toISOString();
return [{ json: {
  results: [
    { name: 'Marketing site', url: 'https://www.northwind.example', ok: true, status: 200, reason: '' },
    { name: 'API health', url: 'https://api.northwind.example/health', ok: false, status: 503, reason: 'HTTP 503' },
    { name: 'Shop', url: 'https://shop.northwind.example', ok: false, status: 200, reason: 'keyword "Add to cart" missing' },
    { name: 'Docs', url: 'https://docs.northwind.example', ok: false, status: 0, reason: 'timed out' },
    { name: 'Status page', url: 'https://status.northwind.example', ok: true, status: 200, reason: '' },
  ],
  sample_previous: {
    'https://api.northwind.example/health': { fails: 1, down: false, since: ago(5), reason: 'HTTP 502' },
    'https://docs.northwind.example': { fails: 6, down: true, since: ago(30), reason: 'timed out' },
    'https://status.northwind.example': { fails: 9, down: true, since: ago(47), reason: 'HTTP 500' },
  },
} }];`),
    merge('Combine check results'),
    code('Update failure streaks', `
// Per URL: fails (current streak), down (alert already sent), since (first failure).
// Down alert exactly when the streak reaches FAILS_BEFORE_ALERT; recovery alert only
// for a site that was announced down. Everything else is silent.
const cfg = $('config').first().json;
const store = $getWorkflowStaticData('global');
const { results, sample_previous } = $input.first().json;
const state = sample_previous ? JSON.parse(JSON.stringify(sample_previous)) : (store.monitors || {});
const alerts = [];
const now = new Date();
const mins = iso => Math.max(1, Math.round((now - new Date(iso)) / 60000));
for (const r of results) {
  const s = state[r.url] || { fails: 0, down: false, since: null, reason: '' };
  if (r.ok) {
    if (s.down) alerts.push({ kind: 'recovered', name: r.name, url: r.url, minutes: mins(s.since), reason: s.reason });
    state[r.url] = { fails: 0, down: false, since: null, reason: '' };
    continue;
  }
  s.fails += 1;
  if (s.fails === 1) s.since = now.toISOString();
  s.reason = r.reason;
  if (!s.down && s.fails >= cfg.fails_before_alert) {
    s.down = true;
    alerts.push({ kind: 'down', name: r.name, url: r.url, minutes: mins(s.since), reason: r.reason, fails: s.fails });
  }
  state[r.url] = s;
}
const known = new Set(results.map(r => r.url));
for (const k of Object.keys(state)) if (!known.has(k)) delete state[k];
if (!sample_previous) store.monitors = state;
const summary = results.map(r => r.name + ': ' + (r.ok ? 'up' : r.reason + ' (' + state[r.url].fails + ' in a row)'));
return [{ json: { alerts, summary, down_now: Object.values(state).filter(s => s.down).length } }];`),
    ifTrue('Anything changed?', '$json.alerts.length > 0'),
    stop('STOP: no state change'),
    code('Write the alert', `
// Down first, then recoveries, in one message per run.
const cfg = $('config').first().json;
const a = $input.first().json.alerts;
const down = a.filter(x => x.kind === 'down'), up = a.filter(x => x.kind === 'recovered');
const lines = [
  ...(down.length && cfg.mention ? [cfg.mention] : []),
  ...down.map(x => ':red_circle: *' + x.name + '* is down: ' + x.reason + ' (' + x.fails + ' checks in a row, since ' + x.minutes + ' min ago) ' + x.url),
  ...up.map(x => ':large_green_circle: *' + x.name + '* is back up after about ' + x.minutes + ' min (last error: ' + x.reason + ')'),
];
return [{ json: { text: lines.join('\\n'), down: down.length, recovered: up.length } }];`),
    ifWhen('Post the alert?', [[cfg('live'), 'true'], [cfg('slack_enabled'), 'true']]),
    stop('STOP: dry run - nothing posted'),
    slack.post('Post the alert to Slack', cfg('slack_channel_id'), '$json.text'),
  ],
  edges: [
    ['Run manually', 'config'], ['Every 5 minutes', 'config'],
    ['config', 'List monitors'], ['List monitors', 'Live checks on?'],
    ['Live checks on?', 0, 'Check each URL'], ['Live checks on?', 1, 'Load sample check results'],
    ['Check each URL', 'Read check results'],
    ['Read check results', 'Combine check results'], ['Load sample check results', 0, 'Combine check results', 1],
    ['Combine check results', 'Update failure streaks'],
    ['Update failure streaks', 'Anything changed?'],
    ['Anything changed?', 0, 'Write the alert'], ['Anything changed?', 1, 'STOP: no state change'],
    ['Write the alert', 'Post the alert?'],
    ['Post the alert?', 0, 'Post the alert to Slack'], ['Post the alert?', 1, 'STOP: dry run - nothing posted'],
  ],
  groups: [
    { title: 'Start and settings', why: 'Runs every 5 minutes. The URL list, keyword per URL, timeout and alert threshold all live in `config`, and `List monitors` turns the list into one item per URL.', nodes: ['Run manually', 'Every 5 minutes', 'config', 'List monitors'] },
    { title: 'Check every URL', why: '`Check each URL` is set to return errors and 5xx responses as data, so one dead site cannot stop the others being checked. `Load sample check results` stands in until `USE_LIVE_CHECKS` is true.', nodes: ['Live checks on?', 'Check each URL', 'Read check results', 'Load sample check results', 'Combine check results'] },
    { title: 'Keep streaks, alert on change', why: 'Only a change of state produces an alert: the failure that completes the streak, or the first success after a down alert. An ongoing outage stays quiet instead of posting every 5 minutes.', nodes: ['Update failure streaks', 'Anything changed?', 'STOP: no state change'] },
    { title: 'Post to Slack', why: 'One message per run holds every down and recovery, with the reason and duration. `Post the alert?` needs a live run and a channel, so the shipped workflow never posts.', nodes: ['Write the alert', 'Post the alert?', 'STOP: dry run - nothing posted', 'Post the alert to Slack'] },
  ],
  scenarios: [
    {
      name: 'shipped config (sample results, dry run)', start: 'Run manually',
      expect: { reached: ['Load sample check results', 'Write the alert', 'STOP: dry run - nothing posted'], notReached: ['Check each URL'], outward: 'none' },
      check: out => {
        const u = out['Update failure streaks'][0];
        const f: string[] = [];
        const kinds = u.alerts.map((a: any) => a.kind + ':' + a.name).sort().join();
        if (kinds !== 'down:API health,recovered:Status page') f.push(`expected API down and status page recovered, got ${kinds}`);
        if (u.alerts.find((a: any) => a.name === 'Status page')?.minutes !== 47) f.push('status page was down 47 minutes');
        if (u.down_now !== 2) f.push(`API and Docs are down now, got ${u.down_now}`);
        if (!u.summary.includes('Shop: keyword "Add to cart" missing (1 in a row)')) f.push('Shop should be on its first strike');
        if (!out['Write the alert'][0].text.startsWith('<!here>')) f.push('down alert should carry the mention');
        return f;
      },
    },
    {
      name: 'live checks with a threshold of 1', start: 'Every 5 minutes',
      overrides: { USE_LIVE_CHECKS: true, DRY_RUN: false, SLACK_CHANNEL_ID: 'C0OPS', FAILS_BEFORE_ALERT: 1, MONITORS: [
        { name: 'App', url: 'https://app.northwind.example', keyword: 'Sign in' },
        { name: 'API', url: 'https://api.northwind.example/health', keyword: '' },
        { name: 'Blog', url: 'https://blog.northwind.example', keyword: '' },
      ] },
      mocks: {
        'Check each URL': [
          { statusCode: 200, statusMessage: 'OK', headers: {}, body: '<html><button>Sign in</button></html>' },
          { error: { message: 'timeout of 8000ms exceeded', name: 'AxiosError' } },
          { statusCode: 404, statusMessage: 'Not Found', headers: {}, body: 'Not found' },
        ],
        'Post the alert to Slack': [{ ok: true, ts: '1700000000.0004' }],
      },
      expect: { reached: ['Read check results', 'Post the alert to Slack'], notReached: ['Load sample check results'], outward: 'some' },
      check: out => {
        const r = out['Read check results'][0].results;
        const f: string[] = [];
        if (!r[0].ok) f.push('App returned 200 with the keyword');
        if (r[1].reason !== 'timed out') f.push(`API should time out, got ${r[1].reason}`);
        if (r[2].reason !== 'HTTP 404') f.push('Blog should fail on 404');
        if (out['Update failure streaks'][0].alerts.length !== 2) f.push('with FAILS_BEFORE_ALERT 1 both failures alert');
        return f;
      },
    },
  ],
});
