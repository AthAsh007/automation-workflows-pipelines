import { defineSpec } from '../_kit/spec';
import { trigger, code, ifTrue, merge, stop, http, slack } from '../_kit/n';

const cfg = (k: string) => `$('config').first().json.${k}`;
const tuesdayThisWeek = () => {
  const d = new Date(); d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) + 1);
  return d.toISOString().slice(0, 10);
};

export default defineSpec({
  slug: 'clockify-missing-timesheet-chaser',
  title: 'Chase missing Clockify hours in Slack every Friday',
  summary: 'Compares each person\'s logged Clockify hours this week with their contracted hours (part-time days and public holidays included), and sends every manager one Slack message listing only their people who are short.',
  category: 'HR and people',
  description: {
    who: 'Agencies and consultancies of 5 to 80 people who bill from Clockify and lose hours every week to timesheets nobody filled in. Managers get a short list on Friday afternoon while the week is still fresh.',
    how: [
      'Every Friday at 14:00 it pulls this week\'s Clockify summary report grouped by user, plus the workspace users, or sample data until Clockify is connected.',
      'Expected hours come from `TEAM`: weekly hours spread over each person\'s working days, minus any `PUBLIC_HOLIDAYS` that fall on one of those days.',
      'Anyone short by more than `SHORTFALL_HOURS` and `SHORTFALL_PCT` is listed. People missing from Clockify count as zero hours; Clockify users not in `TEAM` are ignored and reported.',
      'Each manager gets one Slack DM listing their people with logged, expected and missing hours, or the lists go to one channel.',
    ],
    setup: [
      'Run it once as imported. It checks sample hours and stops at `STOP: dry run - nothing posted`.',
      'Add a Clockify credential to `Fetch summary report` and `Fetch workspace users`, set `CLOCKIFY_WORKSPACE_ID` and `USE_CLOCKIFY = true`.',
      'Fill `TEAM` with each person\'s email, weekly hours, working days, Slack id and manager\'s Slack id. Connect Slack.',
      'Check the lists in `Group by manager`, then set `DRY_RUN = false`.',
    ],
    requirements: ['A Clockify workspace (any plan with the reports API)', 'A Slack workspace with a bot that can DM'],
    customize: [
      '`SHORTFALL_HOURS` and `SHORTFALL_PCT` decide how short counts as missing; both must be exceeded.',
      'Set `CHANNEL_ID` to post every manager\'s list in one channel instead of DMs.',
      '`PUBLIC_HOLIDAYS` lowers expected hours for anyone who works that day.',
    ],
  },
  config: {
    intro: ['USE_CLOCKIFY false -> SAMPLE hours. CHANNEL_ID blank -> each manager gets a DM.', 'DRY_RUN true -> lists are built and shown, nothing is posted.'],
    consts: [
      { name: 'USE_CLOCKIFY', value: false, note: 'set true after adding the Clockify credential to both Clockify nodes' },
      { name: 'CLOCKIFY_WORKSPACE_ID', value: '', note: 'workspace id from Clockify settings' },
      { name: 'TEAM', value: [
        { email: 'ana@studio.example', slack_id: 'U01ANA', weekly_hours: 40, days: [1, 2, 3, 4, 5], manager_slack_id: 'U0LEAD1' },
        { email: 'ben@studio.example', slack_id: 'U01BEN', weekly_hours: 40, days: [1, 2, 3, 4, 5], manager_slack_id: 'U0LEAD1' },
        { email: 'chloe@studio.example', slack_id: 'U01CHLOE', weekly_hours: 24, days: [1, 2, 3], manager_slack_id: 'U0LEAD1' },
        { email: 'dmitri@studio.example', slack_id: 'U01DMITRI', weekly_hours: 20, days: [2, 4], manager_slack_id: 'U0LEAD2' },
        { email: 'esme@studio.example', slack_id: 'U01ESME', weekly_hours: 32, days: [1, 2, 3, 4], manager_slack_id: 'U0LEAD2' },
      ], note: 'who should log what: weekly hours over working days (1 = Monday ... 5 = Friday)' },
      { name: 'SHORTFALL_HOURS', value: 2, note: 'missing hours must be above this...' },
      { name: 'SHORTFALL_PCT', value: 5, note: '...and above this percent of expected hours' },
      { name: 'PUBLIC_HOLIDAYS', value: ['2026-12-25', '2026-12-28', '2027-01-01'], note: 'dates nobody is expected to log' },
      { name: 'CHANNEL_ID', value: '', note: 'blank: DM each manager. Set: post every list in this channel' },
    ],
    flags: { channel_mode: "CHANNEL_ID.trim() !== ''" },
    safety: 'dry_run',
  },
  nodes: [
    trigger.manual(),
    trigger.schedule('Every Friday at 14:00', '0 14 * * 5'),
    ifTrue('Clockify off?', '!' + cfg('use_clockify')),
    http('Fetch summary report', {
      method: 'POST', outward: false, auth: 'clockifyApi',
      url: `={{ 'https://reports.api.clockify.me/v1/workspaces/' + ${cfg('clockify_workspace_id')} + '/reports/summary' }}`,
      jsonBody: `JSON.stringify((() => { const d = new Date(); d.setUTCHours(0, 0, 0, 0); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return { dateRangeStart: d.toISOString(), dateRangeEnd: new Date().toISOString(), summaryFilter: { groups: ['USER'] }, amountShown: 'HIDE_AMOUNT' }; })())`,
    }),
    http('Fetch workspace users', {
      url: `={{ 'https://api.clockify.me/api/v1/workspaces/' + ${cfg('clockify_workspace_id')} + '/users' }}`,
      auth: 'clockifyApi', query: { status: 'ACTIVE', 'page-size': '200' },
    }),
    code('Read Clockify hours', `
// Summary report groupOne = one row per user with total seconds; users map id -> email.
const report = $('Fetch summary report').first().json;
const users = $input.all().map(i => i.json).filter(u => u.id);
const email = Object.fromEntries(users.map(u => [u.id, String(u.email || '').toLowerCase()]));
const hours = {};
for (const g of report.groupOne || []) if (email[g._id]) hours[email[g._id]] = Math.round(g.duration / 36) / 100;
return [{ json: { hours, clockify_users: Object.values(email) } }];`),
    code('Load sample hours', `
// Used until USE_CLOCKIFY is true. Hours by email for this week so far.
return [{ json: {
  hours: { 'ana@studio.example': 39.25, 'ben@studio.example': 27.5, 'chloe@studio.example': 24, 'dmitri@studio.example': 11, 'zoe.freelance@partner.example': 6 },
  clockify_users: ['ana@studio.example', 'ben@studio.example', 'chloe@studio.example', 'dmitri@studio.example', 'zoe.freelance@partner.example'],
} }];`),
    merge('Combine hour sources'),
    code('Compare logged with expected', `
// Expected = weekly_hours / working days per week, for each working day this week
// that is not a public holiday. Short only when BOTH thresholds are exceeded.
const cfg = $('config').first().json;
const { hours, clockify_users } = $input.first().json;
const monday = new Date(); monday.setUTCHours(0, 0, 0, 0); monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
const week = Array.from({ length: 5 }, (_, i) => new Date(monday.getTime() + i * 864e5).toISOString().slice(0, 10));
const teamEmails = cfg.team.map(t => t.email.toLowerCase());
const rows = cfg.team.map(t => {
  const perDay = t.weekly_hours / t.days.length;
  const holidays = week.filter((d, i) => t.days.includes(i + 1) && cfg.public_holidays.includes(d));
  const expected = Math.round((t.weekly_hours - holidays.length * perDay) * 100) / 100;
  const inClockify = clockify_users.includes(t.email.toLowerCase());
  const logged = hours[t.email.toLowerCase()] || 0;
  const missing = Math.round((expected - logged) * 100) / 100;
  const short = missing > cfg.shortfall_hours && expected > 0 && missing / expected * 100 > cfg.shortfall_pct;
  return { email: t.email, slack_id: t.slack_id, manager: t.manager_slack_id, expected, logged, missing, short,
    holidays: holidays.length, note: inClockify ? '' : 'not found in Clockify' };
});
const unknown = clockify_users.filter(e => !teamEmails.includes(e));
return [{ json: { week_start: week[0], rows, short: rows.filter(r => r.short), unknown } }];`),
    ifTrue('Anyone short?', '$json.short.length > 0'),
    stop('STOP: everyone logged their hours'),
    code('Group by manager', `
// One message per manager, biggest gap first. In channel mode the manager is tagged.
const cfg = $('config').first().json;
const c = $input.first().json;
const by = {};
for (const r of c.short) (by[r.manager] ||= []).push(r);
return Object.entries(by).map(([manager, list]) => {
  list.sort((a, b) => b.missing - a.missing);
  const lines = list.map(r => '- <@' + r.slack_id + '>: ' + r.logged + 'h of ' + r.expected + 'h, ' + r.missing + 'h missing' + (r.holidays ? ' (holiday taken off)' : '') + (r.note ? ' (' + r.note + ')' : ''));
  const text = [(cfg.channel_mode ? '<@' + manager + '> ' : '') + 'Timesheets for the week of ' + c.week_start + ': ' + list.length + (list.length === 1 ? ' person is' : ' people are') + ' short.', ...lines, 'A nudge before 17:00 keeps this week billable.'].join('\\n');
  return { json: { manager, target: cfg.channel_mode ? cfg.channel_id : manager, people: list.length, text } };
});`),
    ifTrue('Post to Slack?', cfg('live')),
    stop('STOP: dry run - nothing posted'),
    slack.post('Send the list to the manager', '$json.target', '$json.text'),
  ],
  edges: [
    ['Run manually', 'config'], ['Every Friday at 14:00', 'config'],
    ['config', 'Clockify off?'],
    ['Clockify off?', 0, 'Load sample hours'], ['Clockify off?', 1, 'Fetch summary report'],
    ['Fetch summary report', 'Fetch workspace users'], ['Fetch workspace users', 'Read Clockify hours'],
    ['Load sample hours', 'Combine hour sources'], ['Read Clockify hours', 0, 'Combine hour sources', 1],
    ['Combine hour sources', 'Compare logged with expected'],
    ['Compare logged with expected', 'Anyone short?'],
    ['Anyone short?', 0, 'Group by manager'], ['Anyone short?', 1, 'STOP: everyone logged their hours'],
    ['Group by manager', 'Post to Slack?'],
    ['Post to Slack?', 0, 'Send the list to the manager'], ['Post to Slack?', 1, 'STOP: dry run - nothing posted'],
  ],
  groups: [
    { title: 'Start and settings', why: 'Runs every Friday at 14:00, early enough for people to fix the week. `TEAM` holds contracted hours and working days per person, which is what makes part-time staff come out right.', nodes: ['Run manually', 'Every Friday at 14:00', 'config'] },
    { title: 'Read logged hours', why: 'The summary report gives seconds per user id in one call; `Fetch workspace users` turns ids into emails so they match `TEAM`. `Load sample hours` returns the same hours-by-email item when Clockify is off.', nodes: ['Clockify off?', 'Load sample hours', 'Fetch summary report', 'Fetch workspace users', 'Read Clockify hours', 'Combine hour sources'] },
    { title: 'Find who is short', why: 'Both thresholds must be exceeded, so 15 minutes short on a 40-hour week is ignored. Someone missing from Clockify counts as zero rather than disappearing, and an all-clear week ends at its own STOP.', nodes: ['Compare logged with expected', 'Anyone short?', 'STOP: everyone logged their hours'] },
    { title: 'Tell each manager', why: 'Managers only see their own people, sorted by the biggest gap. `Post to Slack?` opens only on a live run; the DM goes to the manager\'s Slack id, or to `CHANNEL_ID` with the manager tagged.', nodes: ['Group by manager', 'Post to Slack?', 'STOP: dry run - nothing posted', 'Send the list to the manager'] },
  ],
  scenarios: [
    {
      name: 'shipped config (sample hours, dry run)', start: 'Run manually',
      expect: { reached: ['Load sample hours', 'Group by manager', 'STOP: dry run - nothing posted'], outward: 'none' },
      check: out => {
        const c = out['Compare logged with expected'][0];
        const f: string[] = [];
        const short = c.short.map((r: any) => r.email).sort().join();
        if (short !== 'ben@studio.example,dmitri@studio.example,esme@studio.example') f.push(`expected Ben, Dmitri and Esme short, got ${short}`);
        if (c.rows.find((r: any) => r.email === 'ana@studio.example').short) f.push('Ana is 0.75h short, under both thresholds');
        const esme = c.rows.find((r: any) => r.email === 'esme@studio.example');
        if (esme.missing !== 32 || esme.note !== 'not found in Clockify') f.push('Esme is missing from Clockify and should be 32h short');
        if (c.unknown.join() !== 'zoe.freelance@partner.example') f.push('the freelancer is not in TEAM and should be reported');
        const g = out['Group by manager'];
        if (g.length !== 2 || g.find((x: any) => x.manager === 'U0LEAD1')?.people !== 1) f.push('Lead 1 has Ben, Lead 2 has Dmitri and Esme');
        if (!g.find((x: any) => x.manager === 'U0LEAD2')?.text.startsWith('Timesheets')) f.push('DM text should not tag the manager');
        return f;
      },
    },
    {
      name: 'live, holiday on Tuesday, channel mode', start: 'Every Friday at 14:00',
      overrides: { USE_CLOCKIFY: true, CLOCKIFY_WORKSPACE_ID: '64a0c0ffee0000000000abcd', DRY_RUN: false, CHANNEL_ID: 'C0TIME', PUBLIC_HOLIDAYS: [tuesdayThisWeek()] },
      mocks: {
        'Fetch summary report': [{ totals: [{ totalTime: 216000 }], groupOne: [
          { _id: 'u1', name: 'Ana', duration: 115200 }, { _id: 'u2', name: 'Ben', duration: 64800 }, { _id: 'u3', name: 'Chloe', duration: 57600 },
          { _id: 'u4', name: 'Dmitri', duration: 0 }, { _id: 'u5', name: 'Esme', duration: 86400 },
        ] }],
        'Fetch workspace users': [
          { id: 'u1', email: 'ana@studio.example', name: 'Ana', status: 'ACTIVE' }, { id: 'u2', email: 'Ben@studio.example', name: 'Ben', status: 'ACTIVE' },
          { id: 'u3', email: 'chloe@studio.example', name: 'Chloe', status: 'ACTIVE' }, { id: 'u4', email: 'dmitri@studio.example', name: 'Dmitri', status: 'ACTIVE' },
          { id: 'u5', email: 'esme@studio.example', name: 'Esme', status: 'ACTIVE' },
        ],
        'Send the list to the manager': (items: any[]) => items.map(() => ({ ok: true, ts: '1700000000.0003' })),
      },
      expect: { reached: ['Read Clockify hours', 'Send the list to the manager'], notReached: ['Load sample hours'], outward: 'some' },
      check: out => {
        const rows = out['Compare logged with expected'][0].rows;
        const by = (e: string) => rows.find((r: any) => r.email === e);
        const f: string[] = [];
        if (by('ana@studio.example').expected !== 32 || by('ana@studio.example').short) f.push('Ana: 40 - 8 holiday = 32 expected, 32 logged, not short');
        if (by('chloe@studio.example').expected !== 16 || by('chloe@studio.example').short) f.push('Chloe works Tuesday: 24 - 8 = 16 expected, 16 logged');
        if (by('dmitri@studio.example').expected !== 10 || !by('dmitri@studio.example').short) f.push('Dmitri: 20 - 10 = 10 expected, 0 logged, short');
        if (by('ben@studio.example').logged !== 18) f.push('Ben email case should not matter: 18h logged');
        const posts = out['Group by manager'];
        if (!posts.every((p: any) => p.target === 'C0TIME' && p.text.startsWith('<@U0LEAD'))) f.push('channel mode should post to CHANNEL_ID and tag the manager');
        return f;
      },
    },
  ],
});
