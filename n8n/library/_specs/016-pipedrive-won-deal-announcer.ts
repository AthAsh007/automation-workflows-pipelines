import { defineSpec } from '../_kit/spec';
import { trigger, code, ifTrue, merge, stop, http, slack } from '../_kit/n';

const cfg = (k: string) => `$('config').first().json.${k}`;

export default defineSpec({
  slug: 'pipedrive-won-deal-announcer',
  title: 'Announce won Pipedrive deals in Slack with cycle time and source',
  summary: 'Polls Pipedrive every 10 minutes for newly won deals and posts one Slack message per win with the value band, days from creation to close, lead source and the team\'s running total for the month, never announcing the same deal twice.',
  category: 'Sales and CRM',
  description: {
    who: 'Sales teams on Pipedrive that celebrate wins in a Slack channel and want the post to say more than "deal won". Each message shows how long the deal took and where it came from, so patterns show up over a month.',
    how: [
      'Every 10 minutes it reads the 100 most recently won deals from Pipedrive, or sample deals until Pipedrive is connected.',
      'Only deals won in the last 48 hours that have not been announced are kept, so connecting an old account does not flood the channel.',
      'Each win gets a band from `VALUE_BANDS` (Big win from 50,000), its days to close compared with the month\'s median, and its source from the deal origin or a custom field.',
      'The month\'s running total is summed per currency from all wins this calendar month. One Slack message goes out per deal, oldest first.',
    ],
    setup: [
      'Run it once as imported. It formats sample wins and stops at `STOP: preview - nothing posted`.',
      'Add a Pipedrive credential to `Fetch recently won deals` and set `USE_PIPEDRIVE = true`.',
      'Connect Slack and set `SLACK_CHANNEL_ID`. If you track source in a custom field, put its key in `SOURCE_FIELD_KEY`.',
      'For a test, set `TEST_EMAIL` to any address and `TEST_SLACK_CHANNEL` to a private channel, where test messages land. Set `TEST_RUN = false` to post to `SLACK_CHANNEL_ID` and remember announced deals.',
    ],
    requirements: ['A Pipedrive account with an API token', 'A Slack workspace'],
    customize: [
      '`VALUE_BANDS` sets the thresholds, labels and emoji for each band.',
      '`ANNOUNCE_WITHIN_HOURS` decides how old a win can be and still be posted.',
      '`MAIN_CURRENCY` is listed first in the running total.',
    ],
  },
  config: {
    intro: ['USE_PIPEDRIVE false -> SAMPLE won deals so the run works before any credential exists.', 'Announced deal ids are remembered in workflow static data, only on a live run.', 'Test mode (TEST_RUN true + TEST_EMAIL set) posts to TEST_SLACK_CHANNEL, never to SLACK_CHANNEL_ID.'],
    consts: [
      { name: 'USE_PIPEDRIVE', value: false, note: 'set true after adding the Pipedrive credential' },
      { name: 'VALUE_BANDS', value: [
        { min: 50000, label: 'Big win', emoji: ':trophy:' },
        { min: 10000, label: 'Solid win', emoji: ':tada:' },
        { min: 0, label: 'Win', emoji: ':white_check_mark:' },
      ], note: 'checked top to bottom; first band whose min the value reaches' },
      { name: 'ANNOUNCE_WITHIN_HOURS', value: 48, note: 'wins older than this are never posted' },
      { name: 'SOURCE_FIELD_KEY', value: '', note: 'Pipedrive custom field key holding lead source; blank uses the deal origin' },
      { name: 'MAIN_CURRENCY', value: 'USD', note: 'listed first in the monthly running total' },
      { name: 'SLACK_CHANNEL_ID', value: '', note: 'channel for win posts; blank posts nothing' },
      { name: 'TEST_SLACK_CHANNEL', value: '', note: 'test mode posts here instead of the real channel; blank means test mode posts nothing' },
    ],
    flags: { slack_enabled: "SLACK_CHANNEL_ID.trim() !== ''", test_slack_enabled: "TEST_SLACK_CHANNEL.trim() !== ''" },
    safety: 'test_run',
  },
  nodes: [
    trigger.manual(),
    trigger.schedule('Every 10 minutes', '*/10 * * * *'),
    ifTrue('Use sample deals?', '!' + cfg('use_pipedrive')),
    code('Load sample deals', `
// Used until USE_PIPEDRIVE is true. Four recent wins, one old one that must not be posted.
const ago = h => new Date(Date.now() - h * 3600e3).toISOString().replace('T', ' ').slice(0, 19);
const d = (id, title, value, currency, wonH, cycleDays, owner, org, source) => ({ id, title, value, currency, won_time: ago(wonH), add_time: ago(wonH + cycleDays * 24), owner, org, source });
return [
  d(301, 'Harbour Dental annual plan', 62000, 'USD', 1, 45, 'Maya Ortiz', 'Harbour Dental', 'Referral'),
  d(302, 'Northfield retainer', 12500, 'USD', 3, 12, 'Theo Grant', 'Northfield Studio', 'Inbound'),
  d(303, 'Lumen add-on seats', 1800, 'USD', 5, 3, 'Ines Park', 'Lumen Physio', 'Existing customer'),
  d(304, 'Quarry Labs pilot', 9000, 'EUR', 2, 21, 'Owen Blake', 'Quarry Labs', 'Outbound'),
  d(305, 'Pine and Co logo', 3000, 'USD', 60 * 24, 9, 'Maya Ortiz', 'Pine and Co', 'Inbound'),
].map(json => ({ json }));`),
    http('Fetch recently won deals', { url: 'https://api.pipedrive.com/v1/deals', auth: 'pipedriveApi', query: { status: 'won', sort: 'won_time DESC', limit: '100' } }),
    code('Read Pipedrive deals', `
// Pipedrive v1 deals -> the sample shape. Source: custom field if set, else origin or channel.
const cfg = $('config').first().json;
const out = [];
for (const page of $input.all()) for (const d of page.json.data || []) out.push({ json: {
  id: d.id, title: d.title, value: Number(d.value || 0), currency: d.currency || cfg.main_currency, won_time: d.won_time, add_time: d.add_time,
  owner: d.owner_name || d.user_id?.name || '', org: d.org_name || d.org_id?.name || '',
  source: (cfg.source_field_key && d[cfg.source_field_key]) || d.origin || d.channel || 'not recorded',
} });
return out;`),
    merge('Combine deal sources'),
    code('Pick wins to announce', `
// Pipedrive times are UTC "YYYY-MM-DD HH:MM:SS". Month total and median use every win
// this month; only recent, unannounced wins are posted.
const cfg = $('config').first().json;
const announced = new Set($getWorkflowStaticData('global').announced || []);
const utc = s => new Date(String(s).replace(' ', 'T') + (String(s).endsWith('Z') ? '' : 'Z'));
const now = new Date();
const monthKey = now.toISOString().slice(0, 7);
const deals = $input.all().map(i => i.json).map(d => ({ ...d, won: utc(d.won_time), days_to_close: Math.max(0, Math.round((utc(d.won_time) - utc(d.add_time)) / 864e5)) }));
const month = deals.filter(d => d.won.toISOString().slice(0, 7) === monthKey);
const totals = {};
for (const d of month) totals[d.currency] = (totals[d.currency] || 0) + d.value;
const cycles = month.map(d => d.days_to_close).sort((a, b) => a - b);
const median = cycles.length ? cycles[Math.floor((cycles.length - 1) / 2)] : null;
const post = [], skipped = [];
for (const d of deals) {
  if (announced.has(String(d.id))) { skipped.push({ id: d.id, reason: 'already announced' }); continue; }
  if (now - d.won > cfg.announce_within_hours * 3600e3) { skipped.push({ id: d.id, reason: 'won more than ANNOUNCE_WITHIN_HOURS ago' }); continue; }
  const band = cfg.value_bands.find(b => d.value >= b.min) || cfg.value_bands[cfg.value_bands.length - 1];
  post.push({ ...d, won: d.won.toISOString(), band: band.label, emoji: band.emoji });
}
post.sort((a, b) => a.won.localeCompare(b.won));
return [{ json: { post, skipped, totals, median_days: median, month_wins: month.length } }];`),
    code('Write one message per win', `
// Cycle time is framed against this month's median so "fast" and "slow" mean something.
const cfg = $('config').first().json;
const { post, totals, median_days, month_wins } = $input.first().json;
const fmt = (n, c) => new Intl.NumberFormat('en-US', { style: 'currency', currency: c, maximumFractionDigits: 0 }).format(n);
const cur = Object.keys(totals).sort((a, b) => (a === cfg.main_currency ? -1 : b === cfg.main_currency ? 1 : a.localeCompare(b)));
const running = cur.map(c => fmt(totals[c], c)).join(' + ');
return post.map(d => {
  const pace = median_days === null ? '' : d.days_to_close < median_days ? ', faster than this month\\'s median of ' + median_days : d.days_to_close > median_days ? ', slower than this month\\'s median of ' + median_days : ', right on the median';
  const text = [
    (cfg.mode === 'test' ? '[TEST] ' : '') + d.emoji + ' *' + d.band + '*: ' + d.title + ' - ' + fmt(d.value, d.currency),
    'Won by ' + (d.owner || 'unknown') + (d['org'] ? ' with ' + d['org'] : '') + '. Closed in ' + d.days_to_close + ' day' + (d.days_to_close === 1 ? '' : 's') + pace + '.',
    'Source: ' + d.source + ' | Month so far: ' + running + ' from ' + month_wins + ' wins',
  ].join('\\n');
  return { json: { id: d.id, text, send_to: cfg.mode === 'test' ? cfg.test_slack_channel.trim() : cfg.slack_channel_id } };
});`),
    ifTrue('Posting switched on?', `${cfg('sends_enabled')} && (${cfg('mode')} === 'test' || ${cfg('slack_enabled')})`),
    stop('STOP: preview - nothing posted'),
    ifTrue('Test channel set?', `${cfg('mode')} !== 'test' || ${cfg('test_slack_enabled')}`),
    stop('STOP: test - TEST_SLACK_CHANNEL blank'),
    slack.post('Post the win to Slack', '$json.send_to', '$json.text'),
    ifTrue('Live run?', cfg('live')),
    stop('STOP: test post - deals not remembered'),
    code('Remember announced deals', `
// Live only: the last 1000 announced deal ids are kept.
const store = $getWorkflowStaticData('global');
const ids = $('Write one message per win').all().map(i => String(i.json.id));
store.announced = [...new Set([...(store.announced || []), ...ids])].slice(-1000);
return [{ json: { remembered: store.announced.length } }];`),
  ],
  edges: [
    ['Run manually', 'config'], ['Every 10 minutes', 'config'],
    ['config', 'Use sample deals?'],
    ['Use sample deals?', 0, 'Load sample deals'], ['Use sample deals?', 1, 'Fetch recently won deals'],
    ['Fetch recently won deals', 'Read Pipedrive deals'],
    ['Load sample deals', 'Combine deal sources'], ['Read Pipedrive deals', 0, 'Combine deal sources', 1],
    ['Combine deal sources', 'Pick wins to announce'],
    ['Pick wins to announce', 'Write one message per win'],
    ['Write one message per win', 'Posting switched on?'],
    ['Posting switched on?', 0, 'Test channel set?'], ['Posting switched on?', 1, 'STOP: preview - nothing posted'],
    ['Test channel set?', 0, 'Post the win to Slack'], ['Test channel set?', 1, 'STOP: test - TEST_SLACK_CHANNEL blank'],
    ['Post the win to Slack', 'Live run?'],
    ['Live run?', 0, 'Remember announced deals'], ['Live run?', 1, 'STOP: test post - deals not remembered'],
  ],
  groups: [
    { title: 'Start and settings', why: 'Polls every 10 minutes, close enough to feel live without a Pipedrive webhook to maintain. Bands, the announce window and the source field live in `config`.', nodes: ['Run manually', 'Every 10 minutes', 'config'] },
    { title: 'Read won deals', why: 'The 100 latest wins are read every time because the monthly total and median need the whole month, not only new deals. `Load sample deals` stands in until `USE_PIPEDRIVE` is true.', nodes: ['Use sample deals?', 'Load sample deals', 'Fetch recently won deals', 'Read Pipedrive deals', 'Combine deal sources'] },
    { title: 'Pick and write', why: '`Pick wins to announce` drops anything announced before or older than `ANNOUNCE_WITHIN_HOURS`, which is what keeps a first run from posting last year\'s wins.', nodes: ['Pick wins to announce', 'Write one message per win'] },
    { title: 'Post and remember', why: 'One message per win, oldest first, so the channel reads in order. A test post goes only to `TEST_SLACK_CHANNEL`, and stops at a STOP if that is blank. Only a live run stores the deal ids, so a test post never hides the real one.', nodes: ['Posting switched on?', 'STOP: preview - nothing posted', 'Test channel set?', 'STOP: test - TEST_SLACK_CHANNEL blank', 'Post the win to Slack', 'Live run?', 'STOP: test post - deals not remembered', 'Remember announced deals'] },
  ],
  scenarios: [
    {
      name: 'shipped config (preview)', start: 'Run manually',
      expect: { reached: ['Load sample deals', 'STOP: preview - nothing posted'], outward: 'none' },
      check: out => {
        const p = out['Pick wins to announce'][0];
        const f: string[] = [];
        const got = p.post.map((d: any) => d.id + ':' + d.band + ':' + d.days_to_close).join(',');
        if (got !== '303:Win:3,302:Solid win:12,304:Win:21,301:Big win:45') f.push(`posts wrong: ${got}`);
        if (p.skipped[0]?.id !== 305) f.push('60-day-old win must not be posted');
        const thisMonth = new Date().toISOString().slice(0, 7);
        const expUsd = [[62000, 1], [12500, 3], [1800, 5]].filter(([, h]) => new Date(Date.now() - h * 3600e3).toISOString().slice(0, 7) === thisMonth).reduce((s, [v]) => s + v, 0);
        if ((p.totals.USD || 0) !== expUsd) f.push(`USD month total should be ${expUsd}, got ${p.totals.USD}`);
        const msg = out['Write one message per win'].find((m: any) => m.id === 301)?.text || '';
        if (!msg.includes(':trophy: *Big win*') || !msg.includes('Source: Referral')) f.push('big win message wrong');
        return f;
      },
    },
    {
      name: 'test mode with no test channel', start: 'Run manually',
      overrides: { TEST_EMAIL: 'you@example.com', SLACK_CHANNEL_ID: 'C0WINS' },
      expect: { reached: ['STOP: test - TEST_SLACK_CHANNEL blank'], notReached: ['Post the win to Slack', 'STOP: preview - nothing posted'], outward: 'none' },
    },
    {
      name: 'test mode into the test channel', start: 'Run manually',
      overrides: { TEST_EMAIL: 'you@example.com', SLACK_CHANNEL_ID: 'C0WINS', TEST_SLACK_CHANNEL: 'C0TESTCHAN' },
      mocks: { 'Post the win to Slack': (items: any[]) => items.map(j => ({ ok: true, channel: j.send_to })) },
      expect: { reached: ['Post the win to Slack', 'STOP: test post - deals not remembered'], notReached: ['Remember announced deals'], outward: 'some' },
      check: out => {
        const f: string[] = [];
        const posts = out['Post the win to Slack'];
        if (posts.length !== 4 || !posts.every((p: any) => p.channel === 'C0TESTCHAN')) f.push(`all 4 test posts must go to TEST_SLACK_CHANNEL, got ${posts.map((p: any) => p.channel)}`);
        if (!out['Write one message per win'].every((m: any) => m.text.startsWith('[TEST] '))) f.push('test messages need the [TEST] prefix');
        return f;
      },
    },
    {
      name: 'live with Pipedrive and Slack', start: 'Every 10 minutes',
      overrides: { USE_PIPEDRIVE: true, SLACK_CHANNEL_ID: 'C0WINS', TEST_RUN: false },
      mocks: {
        'Fetch recently won deals': [{ success: true, data: [
          { id: 9001, title: 'Ridge Timber fleet', value: 15000, currency: 'USD', won_time: new Date(Date.now() - 600e3).toISOString().replace('T', ' ').slice(0, 19),
            add_time: new Date(Date.now() - 30 * 864e5).toISOString().replace('T', ' ').slice(0, 19), owner_name: 'Lena Fox', org_name: 'Ridge Timber', origin: 'ManuallyCreated' },
        ], additional_data: { pagination: { more_items_in_collection: false } } }],
        'Post the win to Slack': (items: any[]) => items.map(j => ({ ok: true, channel: j.send_to })),
      },
      expect: { reached: ['Read Pipedrive deals', 'Post the win to Slack', 'Remember announced deals'], outward: 'some' },
      check: out => {
        const t = out['Write one message per win'][0]?.text || '';
        const f: string[] = t.includes('Closed in 30 days') && t.includes('Source: ManuallyCreated') && t.includes(':tada:') ? [] : [`live message wrong: ${t}`];
        if (out['Post the win to Slack'][0]?.channel !== 'C0WINS') f.push('live post must go to SLACK_CHANNEL_ID');
        return f;
      },
    },
  ],
});
