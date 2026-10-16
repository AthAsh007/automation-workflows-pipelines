import { defineSpec } from '../_kit/spec';
import { trigger, code, ifTrue, ifWhen, merge, stop, sheets, slack } from '../_kit/n';

const cfg = (k: string) => `$('config').first().json.${k}`;

export default defineSpec({
  slug: 'metric-anomaly-zscore-alerts',
  title: 'Detect anomalies in daily Google Sheets metrics and alert Slack',
  summary: 'Each morning scores the latest value of every metric in a Google Sheet against its last 28 days with a z-score and a percent-change rule, optionally comparing only the same weekday, skips metrics with too little history and posts one Slack alert per metric per day.',
  category: 'Productivity and operations',
  description: {
    who: 'Founders, ops and growth people who log daily numbers (signups, orders, revenue, errors) in a Google Sheet and only notice a broken checkout or a tracking gap days later. One Slack message lands only when something is off.',
    how: [
      'Every day at 07:30 it reads the Metrics tab (Date, Metric, Value), or 40 days of sample data until a sheet is set.',
      'For each metric, the latest value is compared with the previous 28 days: mean, standard deviation and z-score. With `WEEKDAY_SEASONALITY` on, only the same weekday over the last 8 weeks is used, so a quiet Sunday is not an anomaly.',
      'A value is flagged only when |z| is at least `Z_THRESHOLD` and it is also `MIN_PCT_CHANGE` percent away from the mean. Small, noisy metrics stop paging you over 3 extra rows.',
      'Metrics with fewer than `MIN_SAMPLES` points, or whose newest row is older than `STALE_DAYS`, are reported as such instead of being scored.',
      'One Slack message lists every anomaly with its direction and size. Each metric is alerted once per day.',
    ],
    setup: [
      'Run it once as imported. It scores sample metrics and stops at `STOP: preview - nothing sent`.',
      'Point `METRICS_SHEET_ID` at a sheet with a Metrics tab in Date, Metric, Value format and connect Google Sheets.',
      'Connect Slack and set `SLACK_CHANNEL_ID`. Set `DIRECTIONS` for metrics where only a drop or only a rise matters.',
      'Set `TEST_EMAIL` to any address to post marked [TEST] alerts, then set `TEST_RUN = false`.',
    ],
    requirements: ['A Google Sheet with one row per metric per day', 'A Slack workspace'],
    customize: [
      '`Z_THRESHOLD` and `MIN_PCT_CHANGE` set how unusual a value must be.',
      'Turn on `WEEKDAY_SEASONALITY` for metrics with a weekly rhythm.',
      '`DIRECTIONS` limits a metric to drops (revenue) or rises (errors).',
    ],
  },
  config: {
    intro: ['METRICS_SHEET_ID blank -> SAMPLE metrics so the run works before any credential exists.', 'SLACK_CHANNEL_ID blank -> anomalies are computed and shown, nothing is posted.'],
    consts: [
      { name: 'METRICS_SHEET_ID', value: '', note: 'Google Sheets id with a Metrics tab (Date, Metric, Value); blank uses sample data' },
      { name: 'WINDOW_DAYS', value: 28, note: 'days of history before the latest value' },
      { name: 'WEEKDAY_SEASONALITY', value: false, note: 'true compares with the same weekday over SEASONAL_WEEKS weeks' },
      { name: 'SEASONAL_WEEKS', value: 8, note: 'weeks of same-weekday history when seasonality is on' },
      { name: 'MIN_SAMPLES', value: 14, note: 'fewer points than this (5 with seasonality) and the metric is not scored' },
      { name: 'Z_THRESHOLD', value: 3, note: 'flag when |z| is at least this' },
      { name: 'MIN_PCT_CHANGE', value: 20, note: 'and the value is at least this percent away from the mean' },
      { name: 'STALE_DAYS', value: 2, note: 'a newest row older than this many days is reported as stale' },
      { name: 'DIRECTIONS', value: { revenue: 'down', orders: 'down', errors: 'up' }, note: "metric -> 'down', 'up' or 'both' (default both)" },
      { name: 'SLACK_CHANNEL_ID', value: '', note: 'channel for anomaly alerts' },
    ],
    flags: { sheets_enabled: "METRICS_SHEET_ID.trim() !== ''", slack_enabled: "SLACK_CHANNEL_ID.trim() !== ''" },
    safety: 'test_run',
  },
  nodes: [
    trigger.manual(),
    trigger.schedule('Every day at 07:30', '30 7 * * *'),
    ifTrue('Metrics sheet set?', cfg('sheets_enabled')),
    sheets.read('Read the Metrics tab', cfg('metrics_sheet_id'), 'Metrics'),
    code('Load sample metrics', `
// Used until METRICS_SHEET_ID is set. 40 days of seeded noise (same every run) ending
// yesterday: signups crash, revenue spikes (ignored: only drops count), orders stay
// normal, errors is too new and churned is stale.
let seed = 42;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648 - 0.5;
const day = n => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
const rows = [];
for (let n = 40; n >= 1; n--) {
  const last = n === 1;
  rows.push({ Date: day(n), Metric: 'signups', Value: last ? 41 : Math.round(120 + rnd() * 20) });
  rows.push({ Date: day(n), Metric: 'orders', Value: last ? 64 : Math.round(60 + rnd() * 12) });
  rows.push({ Date: day(n), Metric: 'revenue', Value: last ? 9800 : Math.round(5200 + rnd() * 900) });
  if (n <= 9) rows.push({ Date: day(n), Metric: 'errors', Value: last ? 90 : Math.round(12 + rnd() * 6) });
}
rows.push({ Date: day(6), Metric: 'churned', Value: 3 });
return rows.map(json => ({ json }));`),
    merge('Combine metric sources'),
    code('Score the latest value per metric', `
// Per metric: newest row vs history (WINDOW_DAYS, or same weekday with seasonality).
// Anomaly = |z| >= Z_THRESHOLD AND |pct| >= MIN_PCT_CHANGE AND the direction counts.
const cfg = $('config').first().json;
const memory = $getWorkflowStaticData('global').anomalies_sent || {};
const today = Date.parse(new Date().toISOString().slice(0, 10));
const series = {};
for (const { json: r } of $input.all()) {
  const d = String(r.Date || '').slice(0, 10), v = Number(String(r.Value ?? '').replace(/[^\\d.-]/g, ''));
  if (!r.Metric || !Date.parse(d) || r.Value === '' || Number.isNaN(v)) continue;
  (series[String(r.Metric).trim()] ||= new Map()).set(d, v);
}
const anomalies = [], skipped = [], normal = [];
for (const [metric, map] of Object.entries(series)) {
  const pts = [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const [lastDate, value] = pts[pts.length - 1];
  const lastMs = Date.parse(lastDate);
  if ((today - lastMs) / 864e5 > cfg.stale_days) { skipped.push({ metric, reason: 'stale: newest row is ' + lastDate }); continue; }
  const seasonal = cfg.weekday_seasonality;
  const span = seasonal ? cfg.seasonal_weeks * 7 : cfg.window_days;
  const hist = pts.slice(0, -1).filter(([d]) => { const ago = (lastMs - Date.parse(d)) / 864e5; return ago >= 1 && ago <= span && (!seasonal || ago % 7 === 0); }).map(p => p[1]);
  const need = seasonal ? 5 : cfg.min_samples;
  if (hist.length < need) { skipped.push({ metric, reason: 'only ' + hist.length + ' points, need ' + need }); continue; }
  const mean = hist.reduce((a, b) => a + b, 0) / hist.length;
  const sd = Math.sqrt(hist.reduce((a, b) => a + (b - mean) ** 2, 0) / (hist.length - 1));
  const z = sd > 0 ? (value - mean) / sd : (value === mean ? 0 : Math.sign(value - mean) * Infinity);
  const pct = mean !== 0 ? (value - mean) / Math.abs(mean) * 100 : (value === 0 ? 0 : 100);
  const dir = cfg.directions[metric] || 'both';
  const wrongWay = dir === 'both' || (dir === 'down' && z < 0) || (dir === 'up' && z > 0);
  const row = { metric, date: lastDate, value, mean: Math.round(mean * 10) / 10, sd: Math.round(sd * 10) / 10,
    z: Number.isFinite(z) ? Math.round(z * 10) / 10 : z, pct: Math.round(pct), samples: hist.length, seasonal };
  const unusual = Math.abs(z) >= cfg.z_threshold && Math.abs(pct) >= cfg.min_pct_change;
  if (unusual && !wrongWay) { normal.push({ ...row, note: (z > 0 ? 'rise' : 'drop') + ' ignored, DIRECTIONS says ' + dir }); continue; }
  if (unusual) {
    const key = metric + '|' + lastDate;
    if (memory[key]) { skipped.push({ metric, reason: 'already alerted for ' + lastDate }); continue; }
    anomalies.push({ ...row, key, severity: Math.abs(z) >= cfg.z_threshold + 1 ? 'high' : 'medium' });
  } else normal.push(row);
}
anomalies.sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
return [{ json: { anomalies, skipped, normal, metrics: Object.keys(series).length } }];`),
    code('Write the Slack alert', `
// One message per run, biggest deviation first.
const cfg = $('config').first().json;
const r = $input.first().json;
const fmt = n => Number(n).toLocaleString('en-US');
const text = [
  (cfg.mode === 'test' ? '[TEST] ' : '') + '*Metric anomalies* (' + r.anomalies.length + ' of ' + r.metrics + ' metrics)',
  ...r.anomalies.map(a => '- ' + a.metric + ' on ' + a.date + ': ' + fmt(a.value) + ' vs ' + (a.seasonal ? 'same-weekday' : a.samples + '-day') + ' mean ' + fmt(a.mean) +
    ' (' + (a.pct > 0 ? '+' : '') + a.pct + '%, z ' + a.z + ')' + (a.severity === 'high' ? ' HIGH' : '')),
  ...(r.skipped.length ? ['Not scored: ' + r.skipped.map(s => s.metric + ' (' + s.reason + ')').join(', ')] : []),
].join('\\n');
return [{ json: { text, count: r.anomalies.length } }];`),
    ifTrue('Anything to alert?', '$json.count > 0'),
    stop('STOP: no anomalies'),
    ifWhen('Sending switched on?', [[cfg('sends_enabled'), 'true'], [cfg('slack_enabled'), 'true']]),
    stop('STOP: preview - nothing sent'),
    slack.post('Post the anomaly alert to Slack', cfg('slack_channel_id'), '$json.text'),
    ifTrue('Live run?', cfg('live')),
    stop('STOP: test post - not remembered'),
    code('Remember alerted metrics', `
// Metric + date keys, so a re-run the same day stays quiet. Older than 14 days pruned.
const memory = $getWorkflowStaticData('global');
const sent = memory.anomalies_sent || {};
for (const k of Object.keys(sent)) if (sent[k] < Date.now() - 14 * 864e5) delete sent[k];
for (const a of $('Score the latest value per metric').first().json.anomalies) sent[a.key] = Date.now();
memory.anomalies_sent = sent;
return [{ json: { remembered: Object.keys(sent).length } }];`),
  ],
  edges: [
    ['Run manually', 'config'], ['Every day at 07:30', 'config'],
    ['config', 'Metrics sheet set?'],
    ['Metrics sheet set?', 0, 'Read the Metrics tab'], ['Metrics sheet set?', 1, 'Load sample metrics'],
    ['Read the Metrics tab', 'Combine metric sources'], ['Load sample metrics', 0, 'Combine metric sources', 1],
    ['Combine metric sources', 'Score the latest value per metric'],
    ['Score the latest value per metric', 'Write the Slack alert'],
    ['Write the Slack alert', 'Anything to alert?'],
    ['Anything to alert?', 0, 'Sending switched on?'], ['Anything to alert?', 1, 'STOP: no anomalies'],
    ['Sending switched on?', 0, 'Post the anomaly alert to Slack'], ['Sending switched on?', 1, 'STOP: preview - nothing sent'],
    ['Post the anomaly alert to Slack', 'Live run?'],
    ['Live run?', 0, 'Remember alerted metrics'], ['Live run?', 1, 'STOP: test post - not remembered'],
  ],
  groups: [
    { title: 'Start and settings', why: 'Runs every day at 07:30, after overnight imports have filled yesterday. The window, thresholds, seasonality and per-metric directions all live in `config`.', nodes: ['Run manually', 'Every day at 07:30', 'config'] },
    { title: 'Read the metrics', why: 'A long Date, Metric, Value tab takes a new metric without any change here. `Load sample metrics` uses seeded noise, so the same three outcomes appear in every preview.', nodes: ['Metrics sheet set?', 'Read the Metrics tab', 'Load sample metrics', 'Combine metric sources'] },
    { title: 'Score each metric', why: 'Two rules must agree before anything is flagged: a z-score and a percent change. Thin or stale series are reported as not scored instead of producing a confident number from 3 points.', nodes: ['Score the latest value per metric', 'Write the Slack alert', 'Anything to alert?', 'STOP: no anomalies'] },
    { title: 'Alert once', why: 'A quiet day ends at `STOP: no anomalies` and posts nothing. Only a live post stores the metric and date in static data, so a test post never silences the real alert.', nodes: ['Sending switched on?', 'STOP: preview - nothing sent', 'Post the anomaly alert to Slack', 'Live run?', 'STOP: test post - not remembered', 'Remember alerted metrics'] },
  ],
  scenarios: [
    {
      name: 'shipped config (preview)', start: 'Run manually',
      expect: { reached: ['Load sample metrics', 'STOP: preview - nothing sent'], outward: 'none' },
      check: out => {
        const r = out['Score the latest value per metric'][0];
        const f: string[] = [];
        const names = r.anomalies.map((a: any) => a.metric).sort().join(',');
        if (names !== 'signups') f.push(`expected only signups, got ${names}`);
        if (r.normal.find((n: any) => n.metric === 'revenue')?.note !== 'rise ignored, DIRECTIONS says down') f.push('revenue spike should be ignored by direction');
        if (!r.normal.some((n: any) => n.metric === 'orders')) f.push('orders should be normal');
        if (!r.skipped.some((s: any) => s.metric === 'errors' && s.reason === 'only 8 points, need 14')) f.push('errors has 8 points of history');
        if (!r.skipped.some((s: any) => s.metric === 'churned' && s.reason.startsWith('stale'))) f.push('churned is stale');
        return f;
      },
    },
    {
      name: 'weekday seasonality, live post', start: 'Every day at 07:30',
      overrides: { METRICS_SHEET_ID: '1MetricsSheetExample', TEST_RUN: false, SLACK_CHANNEL_ID: 'C0DATA', WEEKDAY_SEASONALITY: true },
      mocks: {
        'Read the Metrics tab': () => {
          const rows: any[] = [];
          for (let n = 60; n >= 1; n--) {
            const d = new Date(Date.now() - n * 864e5);
            const sameDow = n % 7 === 1;
            rows.push({ row_number: 100 - n, Date: d.toISOString().slice(0, 10), Metric: 'sessions', Value: sameDow ? 30 + (n % 3) : 100 + (n % 5) });
            rows.push({ row_number: 200 - n, Date: d.toISOString().slice(0, 10), Metric: 'errors', Value: n === 1 ? 400 : 20 + (n % 4) });
          }
          return rows;
        },
        'Post the anomaly alert to Slack': [{ ok: true }],
      },
      expect: { reached: ['Post the anomaly alert to Slack', 'Remember alerted metrics'], notReached: ['Load sample metrics'], outward: 'some' },
      check: out => {
        const r = out['Score the latest value per metric'][0];
        const f: string[] = [];
        if (r.anomalies.some((a: any) => a.metric === 'sessions')) f.push('a low value matching the same weekday must not be an anomaly');
        if (!r.anomalies.some((a: any) => a.metric === 'errors')) f.push('errors spike should alert');
        if (out['Remember alerted metrics'][0].remembered !== 1) f.push('one key remembered');
        return f;
      },
    },
  ],
});
