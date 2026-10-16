import { defineSpec } from '../_kit/spec';
import { trigger, code, ifTrue, ifWhen, merge, stop, http, slack } from '../_kit/n';

const cfg = (k: string) => `$('config').first().json.${k}`;

export default defineSpec({
  slug: 'pagerduty-weekly-incident-summary',
  title: 'Summarise PagerDuty incidents weekly to Slack',
  summary: 'Every Monday it pulls two weeks of PagerDuty incident analytics, reports last week\'s count against the week before, MTTA and MTTR, high versus low urgency, pages outside business hours, unacknowledged incidents and the noisiest services with their flapping alerts.',
  category: 'DevOps and engineering',
  description: {
    who: 'Engineering managers and on-call leads at teams of 5 to 60 who review on-call load once a week and currently copy numbers out of PagerDuty by hand. The Monday message shows whether last week was worse, and which service caused it.',
    how: [
      'Every Monday at 08:00 it reads raw incident analytics for the last two calendar weeks from PagerDuty, or sample incidents until PagerDuty is connected.',
      'Last week (Monday to Sunday, UTC) is compared with the week before. MTTA averages time to first acknowledgement over acknowledged incidents; MTTR averages time to resolve, with the median alongside.',
      'Pages outside `BUSINESS_HOURS` in `TIMEZONE`, or on a weekend, count as after-hours. Incidents resolved within `FLAP_SECONDS` count as flapping alerts.',
      'The top `TOP_SERVICES` services by count are listed with high-urgency and flapping counts, and one message goes to Slack.',
    ],
    setup: [
      'Run it once as imported. It summarises sample incidents and stops at `STOP: dry run - nothing posted`.',
      'Add a PagerDuty credential (a read-only API key) to `Fetch incident analytics` and set `USE_PAGERDUTY = true`.',
      'Connect Slack and set `SLACK_CHANNEL_ID`. Set `TIMEZONE` and `BUSINESS_HOURS` to your team\'s working day.',
      'Read the numbers on `Compute the weekly numbers`, then set `DRY_RUN = false`.',
    ],
    requirements: ['A PagerDuty account with access to the Analytics API', 'A Slack workspace'],
    customize: [
      '`TEAM_IDS` limits the report to some PagerDuty teams.',
      '`FLAP_SECONDS` sets how short an incident must be to count as a flapping alert.',
      '`TOP_SERVICES` sets how many services are listed.',
    ],
  },
  config: {
    intro: ['USE_PAGERDUTY false -> SAMPLE incidents. SLACK_CHANNEL_ID blank -> nothing is posted.', 'DRY_RUN true -> the summary is built and shown, not posted.'],
    consts: [
      { name: 'USE_PAGERDUTY', value: false, note: 'set true after adding the PagerDuty credential' },
      { name: 'TEAM_IDS', value: [], note: 'PagerDuty team ids to include; empty means every team' },
      { name: 'TIMEZONE', value: 'Europe/London', note: 'time zone for business hours' },
      { name: 'BUSINESS_HOURS', value: { start: 9, end: 18 }, note: 'local hours counted as working time, Monday to Friday' },
      { name: 'FLAP_SECONDS', value: 300, note: 'incidents resolved faster than this count as flapping' },
      { name: 'TOP_SERVICES', value: 3, note: 'services listed in the noisiest block' },
      { name: 'SLACK_CHANNEL_ID', value: '', note: 'channel for the weekly summary; blank skips Slack' },
    ],
    flags: { slack_enabled: "SLACK_CHANNEL_ID.trim() !== ''" },
    safety: 'dry_run',
  },
  nodes: [
    trigger.manual(),
    trigger.schedule('Every Monday at 08:00', '0 8 * * 1'),
    ifTrue('PagerDuty connected?', cfg('use_pagerduty')),
    http('Fetch incident analytics', {
      method: 'POST', outward: false, url: 'https://api.pagerduty.com/analytics/raw/incidents', auth: 'pagerDutyApi',
      headers: { Accept: 'application/vnd.pagerduty+json;version=2', 'X-EARLY-ACCESS': 'analytics-v2' },
      jsonBody: `JSON.stringify((() => { const d = new Date(); d.setUTCHours(0, 0, 0, 0); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); const t = ${cfg('team_ids')}; return { filters: { created_at_start: new Date(d.getTime() - 14 * 864e5).toISOString(), created_at_end: d.toISOString(), ...(t.length ? { team_ids: t } : {}) }, limit: 1000, order: 'asc', order_by: 'created_at' }; })())`,
    }),
    code('Load sample incidents', `
// Used until USE_PAGERDUTY is true. Analytics rows placed on fixed weekdays of last week
// (and 6 from the week before), so the numbers are the same whenever it runs.
const monday = new Date(); monday.setUTCHours(0, 0, 0, 0); monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
const at = (day, hh, mm = 0) => new Date(monday.getTime() + (day - 7) * 864e5 + (hh * 60 + mm) * 60000).toISOString();
const row = (n, svc, urgency, created, ack, resolve, extra = {}) => ({ id: 'PINC' + n, incident_number: n, service_name: svc, urgency, created_at: created,
  seconds_to_first_ack: ack, seconds_to_resolve: resolve, resolved_at: new Date(new Date(created).getTime() + resolve * 1000).toISOString(), major: false, ...extra });
return [{ json: { data: [
  row(101, 'Checkout API', 'high', at(0, 2, 10), 300, 2400),
  row(102, 'Checkout API', 'high', at(0, 11), 120, 1800),
  row(103, 'Checkout API', 'low', at(1, 13), 600, 120),
  row(104, 'Checkout API', 'high', at(2, 21), 900, 5400),
  row(105, 'Search', 'low', at(2, 10, 30), null, 240),
  row(106, 'Search', 'low', at(3, 10, 40), null, 200),
  row(107, 'Search', 'low', at(3, 15), 60, 600),
  row(108, 'Payments worker', 'high', at(5, 12), 240, 3600, { major: true }),
  row(109, 'Payments worker', 'high', at(6, 2), 420, 7200),
  row(110, 'Marketing site', 'low', at(4, 14), 1800, 3600),
  ...[0, 1, 2, 3, 4, 5].map(i => row(90 + i, i % 2 ? 'Search' : 'Checkout API', 'low', at(i - 7, 11), 200, 900)),
] } }];`),
    merge('Combine incident sources'),
    code('Compute the weekly numbers', `
// Last week = the 7 days before this Monday 00:00 UTC; the 7 before that are the baseline.
// Local hour and weekday come from TIMEZONE, so "after hours" means your team's evening.
const cfg = $('config').first().json;
const rows = $input.all().flatMap(i => i.json.data || []);
const monday = new Date(); monday.setUTCHours(0, 0, 0, 0); monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
const start = new Date(monday.getTime() - 7 * 864e5), prevStart = new Date(monday.getTime() - 14 * 864e5);
const week = rows.filter(r => new Date(r.created_at) >= start && new Date(r.created_at) < monday);
const prev = rows.filter(r => new Date(r.created_at) >= prevStart && new Date(r.created_at) < start);
const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: cfg.timezone, hour: 'numeric', hourCycle: 'h23', weekday: 'short' });
const afterHours = r => {
  const parts = Object.fromEntries(fmt.formatToParts(new Date(r.created_at)).map(p => [p.type, p.value]));
  const h = Number(parts.hour);
  return ['Sat', 'Sun'].includes(parts.weekday) || h < cfg.business_hours.start || h >= cfg.business_hours.end;
};
const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
const median = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const mins = s => s === null ? null : Math.round(s / 60);
const acks = week.map(r => r.seconds_to_first_ack).filter(x => typeof x === 'number');
const res = week.map(r => r.seconds_to_resolve).filter(x => typeof x === 'number');
const flapping = r => typeof r.seconds_to_resolve === 'number' && r.seconds_to_resolve < cfg.flap_seconds;
const svc = {};
for (const r of week) {
  const s = (svc[r.service_name || 'unknown'] ||= { service: r.service_name || 'unknown', count: 0, high: 0, flapping: 0, after_hours: 0 });
  s.count++; if (r.urgency === 'high') s.high++; if (flapping(r)) s.flapping++; if (afterHours(r)) s.after_hours++;
}
return [{ json: {
  from: start.toISOString().slice(0, 10), to: new Date(monday.getTime() - 864e5).toISOString().slice(0, 10),
  total: week.length, previous: prev.length, high: week.filter(r => r.urgency === 'high').length, low: week.filter(r => r.urgency !== 'high').length,
  major: week.filter(r => r.major).length, after_hours: week.filter(afterHours).length, unacknowledged: week.length - acks.length,
  mtta_min: mins(mean(acks)), mttr_min: mins(mean(res)), mttr_median_min: mins(median(res)), flapping: week.filter(flapping).length,
  services: Object.values(svc).sort((a, b) => b.count - a.count || b.high - a.high).slice(0, cfg.top_services),
} }];`),
    code('Write the summary', `
// Short enough to read in the channel; the deltas say whether the week got better.
const s = $input.first().json;
const delta = s.previous ? Math.round((s.total - s.previous) / s.previous * 100) : null;
const t = m => m === null ? 'n/a' : m >= 120 ? (m / 60).toFixed(1) + ' h' : m + ' min';
const lines = [
  '*On-call week ' + s.from + ' to ' + s.to + '*',
  s.total + ' incidents' + (delta === null ? '' : ' (' + (delta >= 0 ? '+' : '') + delta + '% vs ' + s.previous + ' the week before)') + ': ' + s.high + ' high, ' + s.low + ' low urgency' + (s.major ? ', ' + s.major + ' major' : '') + '.',
  'MTTA ' + t(s.mtta_min) + ', MTTR ' + t(s.mttr_min) + ' (median ' + t(s.mttr_median_min) + ').',
  s.after_hours + ' pages outside business hours. ' + s.unacknowledged + ' never acknowledged. ' + s.flapping + ' resolved within the flap window.',
  ...(s.services.length ? ['', '*Noisiest services*', ...s.services.map((v, i) => (i + 1) + '. ' + v.service + ': ' + v.count + ' (' + v.high + ' high, ' + v.after_hours + ' after hours' + (v.flapping ? ', ' + v.flapping + ' flapping' : '') + ')')] : []),
];
return [{ json: { text: lines.join('\\n') } }];`),
    ifWhen('Post to Slack?', [[cfg('live'), 'true'], [cfg('slack_enabled'), 'true']]),
    stop('STOP: dry run - nothing posted'),
    slack.post('Post the summary to Slack', cfg('slack_channel_id'), '$json.text'),
  ],
  edges: [
    ['Run manually', 'config'], ['Every Monday at 08:00', 'config'],
    ['config', 'PagerDuty connected?'],
    ['PagerDuty connected?', 0, 'Fetch incident analytics'], ['PagerDuty connected?', 1, 'Load sample incidents'],
    ['Fetch incident analytics', 'Combine incident sources'], ['Load sample incidents', 0, 'Combine incident sources', 1],
    ['Combine incident sources', 'Compute the weekly numbers'],
    ['Compute the weekly numbers', 'Write the summary'],
    ['Write the summary', 'Post to Slack?'],
    ['Post to Slack?', 0, 'Post the summary to Slack'], ['Post to Slack?', 1, 'STOP: dry run - nothing posted'],
  ],
  groups: [
    { title: 'Start and settings', why: 'Runs every Monday at 08:00, after the week has closed. Time zone, business hours and the flap window live in `config`, because "after hours" only means something in your team\'s local time.', nodes: ['Run manually', 'Every Monday at 08:00', 'config'] },
    { title: 'Read two weeks of incidents', why: 'The raw analytics endpoint returns time to first acknowledgement and time to resolve per incident, so no log entries need fetching. Two weeks come back in one call to give the comparison.', nodes: ['PagerDuty connected?', 'Fetch incident analytics', 'Load sample incidents', 'Combine incident sources'] },
    { title: 'Compute and post', why: 'MTTA only averages acknowledged incidents and reports the unacknowledged ones separately, so silent auto-resolves do not flatter the number. `Post to Slack?` needs a live run and a channel.', nodes: ['Compute the weekly numbers', 'Write the summary', 'Post to Slack?', 'STOP: dry run - nothing posted', 'Post the summary to Slack'] },
  ],
  scenarios: [
    {
      name: 'shipped config (sample incidents, dry run)', start: 'Run manually',
      expect: { reached: ['Load sample incidents', 'Write the summary', 'STOP: dry run - nothing posted'], notReached: ['Fetch incident analytics'], outward: 'none' },
      check: out => {
        const s = out['Compute the weekly numbers'][0];
        const f: string[] = [];
        const want: Record<string, any> = { total: 10, previous: 6, high: 5, low: 5, major: 1, after_hours: 4, unacknowledged: 2, mtta_min: 9, mttr_min: 42, flapping: 3 };
        for (const [k, v] of Object.entries(want)) if (s[k] !== v) f.push(`${k} should be ${v}, got ${s[k]}`);
        if (s.services[0]?.service !== 'Checkout API' || s.services[0]?.count !== 4) f.push('Checkout API is the noisiest with 4');
        if (s.services[1]?.flapping !== 2) f.push('Search has 2 flapping alerts');
        if (!out['Write the summary'][0].text.includes('+67% vs 6')) f.push('week-over-week delta should be +67%');
        return f;
      },
    },
    {
      name: 'live with PagerDuty and Slack', start: 'Every Monday at 08:00',
      overrides: { USE_PAGERDUTY: true, DRY_RUN: false, SLACK_CHANNEL_ID: 'C0ONCALL', TIMEZONE: 'America/New_York' },
      mocks: {
        'Fetch incident analytics': () => {
          const m = new Date(); m.setUTCHours(0, 0, 0, 0); m.setUTCDate(m.getUTCDate() - ((m.getUTCDay() + 6) % 7));
          const at = (d: number, h: number) => new Date(m.getTime() + (d - 7) * 864e5 + h * 36e5).toISOString();
          return [{ data: [
            { id: 'Q1', service_name: 'Auth', urgency: 'high', created_at: at(1, 15), seconds_to_first_ack: 180, seconds_to_resolve: 1200, major: false },
            { id: 'Q2', service_name: 'Auth', urgency: 'high', created_at: at(2, 3), seconds_to_first_ack: 600, seconds_to_resolve: 2400, major: false },
          ], first: null, last: null, limit: 1000, more: false }];
        },
        'Post the summary to Slack': [{ ok: true, ts: '1700000000.0007' }],
      },
      expect: { reached: ['Post the summary to Slack'], notReached: ['Load sample incidents'], outward: 'some' },
      check: out => {
        const s = out['Compute the weekly numbers'][0];
        const f: string[] = [];
        if (s.total !== 2 || s.previous !== 0) f.push('2 incidents, none the week before');
        if (s.after_hours !== 1) f.push('15:00 UTC is 10:00 or 11:00 in New York (inside); 03:00 UTC is the night before (outside)');
        if (s.mtta_min !== 7) f.push(`MTTA (180+600)/2 s = 6.5 min rounds to 7, got ${s.mtta_min}`);
        return f;
      },
    },
  ],
});
