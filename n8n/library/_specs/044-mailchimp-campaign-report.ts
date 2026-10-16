import { defineSpec } from '../_kit/spec';
import { trigger, code, ifTrue, ifWhen, merge, stop, http, slack } from '../_kit/n';

const cfg = (k: string) => `$('config').first().json.${k}`;

export default defineSpec({
  slug: 'mailchimp-campaign-report',
  title: 'Report Mailchimp campaign results to Slack a day after sending',
  summary: 'Picks up every Mailchimp campaign sent 20 to 48 hours ago, compares open, click, unsubscribe and bounce rates with the list average (or your own benchmarks) and posts one scored report per campaign to Slack, once.',
  category: 'Marketing and content',
  description: {
    who: 'Email marketers and small teams who send a few Mailchimp campaigns a week and forget to look at the numbers once the day is over. The report arrives when the results have settled, with the weak spots flagged.',
    how: [
      'Every day at 10:00 it reads Mailchimp reports for campaigns sent in the last 48 hours, or 4 sample reports until Mailchimp is connected.',
      'Campaigns younger than 20 hours are left for tomorrow, and a campaign is only reported once.',
      'Open and click rates are compared with that list\'s own averages. A rate more than 20% below average is flagged, as are unsubscribes above 0.5%, bounces above 2% and any spam complaint.',
      'One Slack message lists each campaign with its numbers, its verdict and the reasons.',
    ],
    setup: [
      'Run it once as imported. It scores the sample reports and stops at `STOP: preview - nothing posted`.',
      'Add a Mailchimp credential to `Fetch recent campaign reports`, set `MAILCHIMP_DC` to the data centre in your API key (the part after the dash, e.g. us21) and set `USE_MAILCHIMP = true`.',
      'Connect Slack and set `SLACK_CHANNEL_ID`.',
      'Set `TEST_EMAIL` to any address to post with a [TEST] prefix. Set `TEST_RUN = false` to post normally and remember what was reported.',
    ],
    requirements: ['A Mailchimp account with sent campaigns', 'A Slack workspace'],
    customize: [
      '`MIN_HOURS` and `MAX_HOURS` set the reporting window after the send.',
      '`DROP_PCT` decides how far below the list average a rate must fall to be flagged.',
      '`BENCHMARKS` are used when Mailchimp has no list averages yet, for example on a new list.',
    ],
  },
  config: {
    intro: ['USE_MAILCHIMP false -> SAMPLE campaign reports.', 'SLACK_CHANNEL_ID blank -> the report is built but not posted.'],
    consts: [
      { name: 'USE_MAILCHIMP', value: false, note: 'set true after adding the Mailchimp credential' },
      { name: 'MAILCHIMP_DC', value: 'us21', note: 'data centre from your API key, the part after the dash' },
      { name: 'MIN_HOURS', value: 20, note: 'a campaign is reported once it is at least this many hours old' },
      { name: 'MAX_HOURS', value: 48, note: 'campaigns older than this are not picked up' },
      { name: 'DROP_PCT', value: 20, note: 'open or click rate this many percent below the list average is flagged' },
      { name: 'UNSUB_ALERT_PCT', value: 0.5, note: 'unsubscribe rate (percent of delivered) that is flagged' },
      { name: 'BOUNCE_ALERT_PCT', value: 2, note: 'bounce rate (percent of sent) that is flagged' },
      { name: 'BENCHMARKS', value: { open_rate: 35, click_rate: 2.5 }, note: 'percent; used when the list has no averages yet' },
      { name: 'SLACK_CHANNEL_ID', value: '', note: 'channel for the report; blank skips Slack' },
    ],
    flags: { slack_enabled: "SLACK_CHANNEL_ID.trim() !== ''" },
    safety: 'test_run',
  },
  nodes: [
    trigger.manual(),
    trigger.schedule('Every day at 10:00', '0 10 * * *'),
    ifTrue('Mailchimp connected?', cfg('use_mailchimp')),
    http('Fetch recent campaign reports', {
      url: `={{ 'https://' + ${cfg('mailchimp_dc')} + '.api.mailchimp.com/3.0/reports' }}`, auth: 'mailchimpApi',
      query: { count: '50', since_send_time: `={{ new Date(Date.now() - ${cfg('max_hours')} * 3600e3).toISOString() }}`,
        fields: 'reports.id,reports.campaign_title,reports.subject_line,reports.list_id,reports.list_name,reports.emails_sent,reports.send_time,reports.bounces,reports.unsubscribed,reports.abuse_reports,reports.opens,reports.clicks,reports.list_stats' },
    }),
    code('Read campaign reports', `
// Mailchimp /reports -> one item with every report, unchanged. Scoring reads this shape.
return [{ json: { reports: $input.all().flatMap(i => i.json.reports || []) } }];`),
    code('Load sample reports', `
// Used until USE_MAILCHIMP is true. Same fields as Mailchimp /reports.
// Report rates are fractions; list_stats rates are percents, as in the real API.
const hoursAgo = h => new Date(Date.now() - h * 3600e3).toISOString();
const r = (id, title, list, sent, h, opens, clicks, unsub, hard, soft, abuse, ls) => ({
  id, campaign_title: title, subject_line: title, list_id: list.toLowerCase().replace(/\\W+/g, ''), list_name: list, emails_sent: sent, send_time: hoursAgo(h),
  bounces: { hard_bounces: hard, soft_bounces: soft, syndication_bounces: 0 }, unsubscribed: unsub, abuse_reports: abuse,
  opens: { unique_opens: Math.round(sent * opens), open_rate: opens }, clicks: { unique_clicks: Math.round(sent * clicks), click_rate: clicks }, list_stats: ls });
return [{ json: { reports: [
  r('c_sample_1', 'October product update', 'Customers', 4200, 26, 0.462, 0.051, 6, 10, 14, 0, { open_rate: 41.2, click_rate: 4.1, sub_rate: 2.1, unsub_rate: 0.2 }),
  r('c_sample_2', 'Black Friday early access', 'Newsletter', 12800, 31, 0.214, 0.012, 96, 210, 140, 2, { open_rate: 33.5, click_rate: 2.4, sub_rate: 1.8, unsub_rate: 0.3 }),
  r('c_sample_3', 'Webinar reminder', 'Webinar leads', 640, 7, 0.38, 0.09, 0, 1, 0, 0, null),
  r('c_sample_4', 'Partner spotlight', 'New list', 300, 22, 0.26, 0.031, 0, 0, 2, 0, null),
] } }];`),
    merge('Combine report sources'),
    code('Score each campaign', `
// Window: MIN_HOURS..MAX_HOURS after send, so the numbers have settled.
// Each rate is compared with the list average from list_stats, or BENCHMARKS for
// a list with no history. Already-reported campaign ids live in static data.
const cfg = $('config').first().json;
const reported = new Set($getWorkflowStaticData('global').reported || []);
const pct = v => v == null ? null : (v <= 1 ? v * 100 : v);
const r1 = v => Math.round(v * 10) / 10, r2 = v => Math.round(v * 100) / 100;
const now = Date.now();
const campaigns = [], waiting = [];
for (const rep of $input.first().json.reports) {
  const age = (now - new Date(rep.send_time).getTime()) / 3600e3;
  if (age < cfg.min_hours) { waiting.push({ title: rep.campaign_title, reason: 'sent ' + Math.round(age) + 'h ago, too early' }); continue; }
  if (age > cfg.max_hours) continue;
  if (reported.has(rep.id)) { waiting.push({ title: rep.campaign_title, reason: 'already reported' }); continue; }
  const sent = rep.emails_sent || 0;
  const bounced = (rep.bounces?.hard_bounces || 0) + (rep.bounces?.soft_bounces || 0) + (rep.bounces?.syndication_bounces || 0);
  const delivered = Math.max(1, sent - bounced);
  const open = pct(rep.opens?.open_rate) ?? 0, click = pct(rep.clicks?.click_rate) ?? 0;
  const avgOpen = pct(rep.list_stats?.open_rate) ?? cfg.benchmarks.open_rate;
  const avgClick = pct(rep.list_stats?.click_rate) ?? cfg.benchmarks.click_rate;
  const unsubRate = rep.unsubscribed / delivered * 100, bounceRate = sent ? bounced / sent * 100 : 0;
  const flags = [], wins = [];
  const floor = avg => avg * (1 - cfg.drop_pct / 100);
  if (open < floor(avgOpen)) flags.push('opens ' + r1(open) + '% vs ' + r1(avgOpen) + '% average');
  else if (open > avgOpen * 1.1) wins.push('opens ' + r1(open - avgOpen) + ' pts above average');
  if (click < floor(avgClick)) flags.push('clicks ' + r2(click) + '% vs ' + r2(avgClick) + '% average');
  else if (click > avgClick * 1.1) wins.push('clicks ' + r2(click - avgClick) + ' pts above average');
  if (unsubRate > cfg.unsub_alert_pct) flags.push('unsubscribes ' + r2(unsubRate) + '%');
  if (bounceRate > cfg.bounce_alert_pct) flags.push('bounces ' + r2(bounceRate) + '% (' + (rep.bounces?.hard_bounces || 0) + ' hard)');
  if (rep.abuse_reports > 0) flags.push(rep.abuse_reports + ' spam complaint(s)');
  campaigns.push({ id: rep.id, title: rep.campaign_title, list: rep.list_name, sent, hours: Math.round(age),
    open_rate: r1(open), click_rate: r2(click), unsub_rate: r2(unsubRate), bounce_rate: r2(bounceRate),
    baseline: rep.list_stats ? 'list average' : 'BENCHMARKS', flags, wins,
    verdict: flags.length >= 2 ? 'needs a look' : flags.length === 1 ? 'mixed' : wins.length ? 'above average' : 'in line' });
}
return [{ json: { campaigns, waiting } }];`),
    code('Build the Slack report', `
// One message for all campaigns in the window; quiet campaigns get one line.
const cfg = $('config').first().json;
const { campaigns, waiting } = $input.first().json;
const icon = { 'needs a look': ':red_circle:', mixed: ':large_orange_circle:', 'in line': ':white_circle:', 'above average': ':large_green_circle:' };
const blocks = campaigns.map(c => [
  icon[c.verdict] + ' *' + c.title + '* (' + c.list + ', ' + c.sent.toLocaleString('en-US') + ' sent, ' + c.hours + 'h ago): ' + c.verdict,
  '   opens ' + c.open_rate + '%, clicks ' + c.click_rate + '%, unsubs ' + c.unsub_rate + '%, bounces ' + c.bounce_rate + '% (vs ' + c.baseline + ')',
  ...c.flags.map(x => '   - ' + x), ...c.wins.map(x => '   + ' + x),
].join('\\n'));
const text = [(cfg.mode === 'test' ? '[TEST] ' : '') + '*Mailchimp results, day after send*', ...blocks,
  waiting.length ? '_Not yet: ' + waiting.map(w => w.title + ' (' + w.reason + ')').join(', ') + '_' : ''].filter(Boolean).join('\\n\\n');
return [{ json: { text, count: campaigns.length, ids: campaigns.map(c => c.id) } }];`),
    ifWhen('Any campaigns to report?', [['$json.count', 'gt', 0]]),
    stop('STOP: no campaigns in the window'),
    ifTrue('Posting switched on?', cfg('sends_enabled')),
    stop('STOP: preview - nothing posted'),
    ifTrue('Slack channel set?', cfg('slack_enabled')),
    stop('STOP: no Slack channel'),
    slack.post('Post the results to Slack', cfg('slack_channel_id'), '$json.text'),
    ifTrue('Live run?', cfg('live')),
    stop('STOP: test post - not remembered'),
    code('Remember reported campaigns', `
// Live runs only: these ids are never reported again. Keeps the newest 300.
const store = $getWorkflowStaticData('global');
const ids = $('Build the Slack report').first().json.ids;
store.reported = [...ids, ...(store.reported || [])].slice(0, 300);
return [{ json: { remembered: ids.length } }];`),
  ],
  edges: [
    ['Run manually', 'config'], ['Every day at 10:00', 'config'],
    ['config', 'Mailchimp connected?'],
    ['Mailchimp connected?', 0, 'Fetch recent campaign reports'], ['Mailchimp connected?', 1, 'Load sample reports'],
    ['Fetch recent campaign reports', 'Read campaign reports'],
    ['Read campaign reports', 'Combine report sources'], ['Load sample reports', 0, 'Combine report sources', 1],
    ['Combine report sources', 'Score each campaign'],
    ['Score each campaign', 'Build the Slack report'],
    ['Build the Slack report', 'Any campaigns to report?'],
    ['Any campaigns to report?', 0, 'Posting switched on?'], ['Any campaigns to report?', 1, 'STOP: no campaigns in the window'],
    ['Posting switched on?', 0, 'Slack channel set?'], ['Posting switched on?', 1, 'STOP: preview - nothing posted'],
    ['Slack channel set?', 0, 'Post the results to Slack'], ['Slack channel set?', 1, 'STOP: no Slack channel'],
    ['Post the results to Slack', 'Live run?'],
    ['Live run?', 0, 'Remember reported campaigns'], ['Live run?', 1, 'STOP: test post - not remembered'],
  ],
  groups: [
    { title: 'Start and settings', why: 'Runs every day at 10:00 or by hand. The window, thresholds and fallback benchmarks all sit in `config`.', nodes: ['Run manually', 'Every day at 10:00', 'config'] },
    { title: 'Read campaign reports', why: 'One call to the Mailchimp reports endpoint returns opens, clicks, bounces and the list averages together, so no per-campaign request is needed. `Load sample reports` keeps the real fraction and percent formats.', nodes: ['Mailchimp connected?', 'Fetch recent campaign reports', 'Read campaign reports', 'Load sample reports', 'Combine report sources'] },
    { title: 'Score against the list average', why: 'Each campaign is judged against its own list, because a 25% open rate is poor on a customer list and normal on a cold one. Too-early and already-reported campaigns are listed as waiting, not dropped silently.', nodes: ['Score each campaign', 'Build the Slack report', 'Any campaigns to report?', 'STOP: no campaigns in the window'] },
    { title: 'Post and remember', why: 'Nothing is posted in preview. Only a live post records the campaign ids, so testing never stops tomorrow\'s real report from going out.', nodes: ['Posting switched on?', 'STOP: preview - nothing posted', 'Slack channel set?', 'STOP: no Slack channel', 'Post the results to Slack', 'Live run?', 'STOP: test post - not remembered', 'Remember reported campaigns'] },
  ],
  scenarios: [
    {
      name: 'shipped config (preview)', start: 'Run manually',
      expect: { reached: ['Load sample reports', 'STOP: preview - nothing posted'], outward: 'none' },
      check: out => {
        const f: string[] = [];
        const s = out['Score each campaign'][0];
        if (s.campaigns.length !== 3) f.push(`expected 3 campaigns in the window, got ${s.campaigns.length}`);
        const bf = s.campaigns.find((c: any) => c.id === 'c_sample_2');
        if (bf?.verdict !== 'needs a look' || bf.flags.length !== 5) f.push(`Black Friday should have 5 flags: ${JSON.stringify(bf?.flags)}`);
        const up = s.campaigns.find((c: any) => c.id === 'c_sample_1');
        if (up?.verdict !== 'above average') f.push(`product update should be above average, got ${up?.verdict}`);
        const nl = s.campaigns.find((c: any) => c.id === 'c_sample_4');
        if (nl?.baseline !== 'BENCHMARKS' || nl.verdict !== 'mixed') f.push(`new list should use BENCHMARKS and be mixed: ${JSON.stringify(nl)}`);
        if (!s.waiting.some((w: any) => w.title === 'Webinar reminder')) f.push('7h-old campaign should be waiting');
        return f;
      },
    },
    {
      name: 'live with Mailchimp and Slack', start: 'Every day at 10:00',
      overrides: { USE_MAILCHIMP: true, TEST_RUN: false, SLACK_CHANNEL_ID: 'C0EMAIL01' },
      mocks: {
        'Fetch recent campaign reports': [{ reports: [{ id: 'a1b2c3', campaign_title: 'November digest', list_name: 'Newsletter', emails_sent: 2000,
          send_time: new Date(Date.now() - 24 * 3600e3).toISOString(), bounces: { hard_bounces: 2, soft_bounces: 8, syndication_bounces: 0 }, unsubscribed: 3, abuse_reports: 0,
          opens: { open_rate: 0.35 }, clicks: { click_rate: 0.026 }, list_stats: { open_rate: 34.9, click_rate: 2.5 } }] }],
        'Post the results to Slack': [{ ok: true }],
      },
      expect: { reached: ['Post the results to Slack', 'Remember reported campaigns'], outward: 'some' },
      check: out => {
        const c = out['Score each campaign'][0].campaigns[0];
        return c?.verdict === 'in line' && out['Remember reported campaigns'][0].remembered === 1 ? [] : [`expected one in-line campaign remembered: ${JSON.stringify(c)}`];
      },
    },
  ],
});
