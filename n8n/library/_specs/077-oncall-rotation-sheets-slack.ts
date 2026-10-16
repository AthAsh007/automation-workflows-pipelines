import { defineSpec } from '../_kit/spec';
import { trigger, code, ifTrue, ifWhen, merge, stop, http, sheets, slack } from '../_kit/n';

const cfg = (k: string) => `$('config').first().json.${k}`;
const upcomingMonday = (plusDays = 0) => {
  const d = new Date(); d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7) + plusDays);
  return d.toISOString().slice(0, 10);
};

export default defineSpec({
  slug: 'oncall-rotation-sheets-slack',
  title: 'Rotate the on-call schedule in Google Sheets and announce it in Slack',
  summary: 'Every Monday it picks the next primary and secondary from a rotation tab, skipping inactive people and anyone with leave in the week, writes the new row to the schedule tab and posts a handover in Slack with the count of unacknowledged PagerDuty incidents.',
  category: 'DevOps and engineering',
  description: {
    who: 'Small engineering teams of 3 to 15 who run on-call from a spreadsheet and forget to hand over, or hand over to someone who is on holiday. The sheet stays the source of truth and the handover happens on time.',
    how: [
      'Every Monday at 09:00 it reads the Rotation tab (order, name, Slack id, active, away dates) and the Schedule tab, or sample data until a sheet id is set.',
      'The next primary is the next person in rotation order after last week\'s primary who is active and has no away dates in the week. The secondary is the next eligible person after them. Everyone skipped is listed with the reason.',
      'If the Schedule tab already has a row for the week, the run stops, so a manual re-run never rotates twice.',
      'The count of unacknowledged incidents comes from PagerDuty (or a sample), the new row is appended and the handover is posted to Slack.',
    ],
    setup: [
      'Run it once as imported. It picks the next on-call from sample data and stops at `STOP: dry run - sheet and Slack untouched`.',
      'Create Rotation and Schedule tabs with the columns shown in `Load sample rotation`, connect Google Sheets and set `ROTA_SHEET_ID`.',
      'Optional: add a PagerDuty credential to `Count open incidents` and set `USE_PAGERDUTY = true`. Set `SLACK_CHANNEL_ID`.',
      'Check the pick on `Pick next on-call`, then set `DRY_RUN = false`.',
    ],
    requirements: ['A Google Sheet holding the rotation', 'A Slack workspace', 'Optional: PagerDuty'],
    customize: [
      '`HANDOVER_DAY` sets which weekday a rotation week starts on.',
      '`AWAY_GRACE_DAYS` lets someone take the week if they are away for only that many days of it.',
      '`HANDOVER_NOTE` is appended to every handover message.',
    ],
  },
  config: {
    intro: ['ROTA_SHEET_ID blank -> SAMPLE rotation. USE_PAGERDUTY false -> SAMPLE incident count.', 'DRY_RUN true -> the pick is shown, the sheet and Slack are untouched.'],
    consts: [
      { name: 'ROTA_SHEET_ID', value: '', note: 'Google Sheets id with Rotation and Schedule tabs; blank uses sample data' },
      { name: 'HANDOVER_DAY', value: 1, note: 'weekday a rotation week starts: 1 = Monday ... 7 = Sunday' },
      { name: 'AWAY_GRACE_DAYS', value: 0, note: 'away days in the week someone can still cover; 0 = any leave skips them' },
      { name: 'USE_PAGERDUTY', value: false, note: 'true counts open incidents in PagerDuty for the handover' },
      { name: 'SLACK_CHANNEL_ID', value: '', note: 'channel for the handover; blank skips Slack' },
      { name: 'HANDOVER_NOTE', value: 'Runbooks: wiki/oncall. Escalate to the secondary after 15 minutes without an ack.', note: 'added to every handover' },
    ],
    flags: { sheets_enabled: "ROTA_SHEET_ID.trim() !== ''", slack_enabled: "SLACK_CHANNEL_ID.trim() !== ''" },
    safety: 'dry_run',
  },
  nodes: [
    trigger.manual(),
    trigger.schedule('Every Monday at 09:00', '0 9 * * 1'),
    ifTrue('Rota sheet blank?', '!' + cfg('sheets_enabled')),
    code('Load sample rotation', `
// Used until ROTA_SHEET_ID is set. Same columns as the Rotation and Schedule tabs.
const cfg = $('config').first().json;
const d = new Date(); d.setUTCHours(0, 0, 0, 0);
d.setUTCDate(d.getUTCDate() + ((cfg.handover_day % 7) - d.getUTCDay() + 7) % 7);
const day = n => new Date(d.getTime() + n * 864e5).toISOString().slice(0, 10);
return [{ json: {
  rotation: [
    { order: 1, name: 'Ana Ruiz', email: 'ana@northwind.example', slack_id: 'U01ANA', active: 'yes', away: '' },
    { order: 2, name: 'Ben Okoro', email: 'ben@northwind.example', slack_id: 'U01BEN', active: 'yes', away: day(2) + '..' + day(4) },
    { order: 3, name: 'Chloe Martin', email: 'chloe@northwind.example', slack_id: 'U01CHLOE', active: 'no', away: '' },
    { order: 4, name: 'Dev Patel', email: 'dev@northwind.example', slack_id: 'U01DEV', active: 'yes', away: day(14) + '..' + day(18) },
    { order: 5, name: 'Esme Larsen', email: 'esme@northwind.example', slack_id: 'U01ESME', active: 'yes', away: '' },
  ],
  schedule: [
    { week_start: day(-14), primary: 'Esme Larsen', secondary: 'Ana Ruiz' },
    { week_start: day(-7), primary: 'Ana Ruiz', secondary: 'Ben Okoro' },
  ],
} }];`),
    sheets.read('Read Rotation tab', cfg('rota_sheet_id'), 'Rotation'),
    code('Collect rotation', `
// Many rows -> one item, so the Schedule read below runs once.
return [{ json: { rotation: $input.all().map(i => i.json).filter(r => r.name) } }];`),
    sheets.read('Read Schedule tab', cfg('rota_sheet_id'), 'Schedule'),
    code('Collect schedule', `
// Rotation and schedule side by side, in the sample's shape.
return [{ json: { rotation: $('Collect rotation').first().json.rotation, schedule: $input.all().map(i => i.json).filter(r => r.week_start) } }];`),
    merge('Combine rota sources'),
    ifTrue('PagerDuty connected?', cfg('use_pagerduty')),
    http('Count open incidents', { url: 'https://api.pagerduty.com/incidents', auth: 'pagerDutyApi', headers: { Accept: 'application/vnd.pagerduty+json;version=2' }, query: { 'statuses[]': 'triggered', total: 'true', limit: '25' } }),
    code('Read incident count', `
// Triggered incidents plus a count of high urgency ones for the handover line.
const r = $input.first().json;
const list = r.incidents || [];
return [{ json: { open: typeof r.total === 'number' ? r.total : list.length, high: list.filter(i => i.urgency === 'high').length } }];`),
    code('Load sample incident count', `
// Used until USE_PAGERDUTY is true.
return [{ json: { open: 3, high: 1 } }];`),
    merge('Combine incident counts'),
    code('Pick next on-call', `
// Walk the rotation order from last week's primary. Skip inactive people and anyone
// away for more than AWAY_GRACE_DAYS of the week. Secondary = next eligible after primary.
const cfg = $('config').first().json;
const { rotation, schedule } = $('Combine rota sources').first().json;
const incidents = $input.first().json;
const d = new Date(); d.setUTCHours(0, 0, 0, 0);
d.setUTCDate(d.getUTCDate() + ((cfg.handover_day % 7) - d.getUTCDay() + 7) % 7);
const weekStart = d.toISOString().slice(0, 10);
const days = Array.from({ length: 7 }, (_, i) => new Date(d.getTime() + i * 864e5).toISOString().slice(0, 10));
const people = [...rotation].sort((a, b) => Number(a.order) - Number(b.order));
const awayDays = p => String(p.away || '').split(/[;,]/).map(s => s.trim()).filter(Boolean).reduce((n, range) => {
  const [from, to] = range.split('..').map(s => s.trim());
  return n + days.filter(x => x >= from && x <= (to || from)).length;
}, 0);
const skipped = [];
const eligible = p => {
  if (['no', 'false', 'inactive'].includes(String(p.active || 'yes').toLowerCase())) { skipped.push({ name: p.name, reason: 'inactive' }); return false; }
  const a = awayDays(p);
  if (a > cfg.away_grace_days) { skipped.push({ name: p.name, reason: 'away ' + a + ' day' + (a === 1 ? '' : 's') + ' this week' }); return false; }
  return true;
};
const past = [...schedule].sort((a, b) => String(a.week_start).localeCompare(String(b.week_start)));
const last = past[past.length - 1];
if (past.some(r => String(r.week_start).slice(0, 10) === weekStart)) return [{ json: { already: true, week_start: weekStart } }];
const startIdx = last ? people.findIndex(p => p.name === last.primary) : -1;
const order = people.map((_, i) => people[(startIdx + 1 + i) % people.length]);
const pool = order.filter(eligible);
const primary = pool[0], secondary = pool.find(p => p !== primary);
if (!primary) return [{ json: { already: false, ok: false, week_start: weekStart, skipped, reason: 'nobody eligible this week' } }];
return [{ json: { already: false, ok: true, week_start: weekStart, previous: last?.primary || '', primary, secondary: secondary || null,
  skipped: skipped.filter((s, i, a) => a.findIndex(x => x.name === s.name) === i), incidents } }];`),
    ifTrue('Already rotated this week?', '$json.already === true'),
    stop('STOP: already rotated this week'),
    code('Write the handover', `
// Sheet row and Slack text from the same pick.
const cfg = $('config').first().json;
const p = $input.first().json;
if (!p.ok) return [{ json: { ...p, text: ':warning: On-call for the week of ' + p.week_start + ': ' + p.reason + '. Skipped: ' + p.skipped.map(s => s.name + ' (' + s.reason + ')').join(', '), row: null } }];
const tag = x => x?.slack_id ? '<@' + x.slack_id + '>' : (x?.name || 'nobody');
const prev = p.previous;
const text = [
  '*On-call handover, week of ' + p.week_start + '*',
  (prev ? prev + ' hands over to ' : 'Primary: ') + tag(p.primary) + '. Secondary: ' + tag(p.secondary) + '.',
  p.incidents.open + ' unacknowledged incident' + (p.incidents.open === 1 ? '' : 's') + (p.incidents.high ? ' (' + p.incidents.high + ' high urgency)' : '') + ' to pick up.',
  p.skipped.length ? 'Skipped this time: ' + p.skipped.map(s => s.name + ' (' + s.reason + ')').join(', ') + '.' : '',
  cfg.handover_note,
].filter(Boolean).join('\\n');
return [{ json: { ...p, text, row: { week_start: p.week_start, primary: p.primary.name, secondary: p.secondary?.name || '',
  open_incidents: p.incidents.open, skipped: p.skipped.map(s => s.name).join(', '), handed_over_at: new Date().toISOString() } } }];`),
    ifWhen('Write and announce?', [[cfg('live'), 'true'], [cfg('sheets_enabled'), 'true'], ['$json.row !== null', 'true']]),
    stop('STOP: dry run - sheet and Slack untouched'),
    code('Pick schedule columns', `
// Only the Schedule tab columns go to Sheets.
return [{ json: $input.first().json.row }];`),
    sheets.append('Append the schedule row', cfg('rota_sheet_id'), 'Schedule'),
    ifTrue('Slack channel set?', cfg('slack_enabled')),
    stop('STOP: no Slack channel'),
    slack.post('Post the handover to Slack', cfg('slack_channel_id'), "$('Write the handover').first().json.text"),
  ],
  edges: [
    ['Run manually', 'config'], ['Every Monday at 09:00', 'config'],
    ['config', 'Rota sheet blank?'],
    ['Rota sheet blank?', 0, 'Load sample rotation'], ['Rota sheet blank?', 1, 'Read Rotation tab'],
    ['Read Rotation tab', 'Collect rotation'], ['Collect rotation', 'Read Schedule tab'], ['Read Schedule tab', 'Collect schedule'],
    ['Load sample rotation', 'Combine rota sources'], ['Collect schedule', 0, 'Combine rota sources', 1],
    ['Combine rota sources', 'PagerDuty connected?'],
    ['PagerDuty connected?', 0, 'Count open incidents'], ['PagerDuty connected?', 1, 'Load sample incident count'],
    ['Count open incidents', 'Read incident count'],
    ['Read incident count', 'Combine incident counts'], ['Load sample incident count', 0, 'Combine incident counts', 1],
    ['Combine incident counts', 'Pick next on-call'],
    ['Pick next on-call', 'Already rotated this week?'],
    ['Already rotated this week?', 0, 'STOP: already rotated this week'], ['Already rotated this week?', 1, 'Write the handover'],
    ['Write the handover', 'Write and announce?'],
    ['Write and announce?', 0, 'Pick schedule columns'], ['Write and announce?', 1, 'STOP: dry run - sheet and Slack untouched'],
    ['Pick schedule columns', 'Append the schedule row'],
    ['Append the schedule row', 'Slack channel set?'],
    ['Slack channel set?', 0, 'Post the handover to Slack'], ['Slack channel set?', 1, 'STOP: no Slack channel'],
  ],
  groups: [
    { title: 'Start and settings', why: 'Runs every Monday at 09:00, the moment the week changes hands. The handover weekday, leave tolerance and note live in `config`; people and dates live in the sheet.', nodes: ['Run manually', 'Every Monday at 09:00', 'config'] },
    { title: 'Read the rotation', why: '`Collect rotation` folds the Rotation rows into one item so `Read Schedule tab` runs once. A blank `ROTA_SHEET_ID` routes to `Load sample rotation`, which has someone on leave and someone inactive.', nodes: ['Rota sheet blank?', 'Load sample rotation', 'Read Rotation tab', 'Collect rotation', 'Read Schedule tab', 'Collect schedule', 'Combine rota sources'] },
    { title: 'Count open incidents', why: 'The handover tells the incoming person what is already burning. PagerDuty is optional: `Load sample incident count` stands in until `USE_PAGERDUTY` is true.', nodes: ['PagerDuty connected?', 'Count open incidents', 'Read incident count', 'Load sample incident count', 'Combine incident counts'] },
    { title: 'Pick, write and announce', why: 'A Schedule row for the week stops the run first, so re-running never rotates twice. The row is appended before the Slack post, so the sheet is right even if Slack fails.', nodes: ['Pick next on-call', 'Already rotated this week?', 'STOP: already rotated this week', 'Write the handover', 'Write and announce?', 'STOP: dry run - sheet and Slack untouched', 'Pick schedule columns', 'Append the schedule row', 'Slack channel set?', 'STOP: no Slack channel', 'Post the handover to Slack'] },
  ],
  scenarios: [
    {
      name: 'shipped config (sample rotation, dry run)', start: 'Run manually',
      expect: { reached: ['Load sample rotation', 'Load sample incident count', 'Write the handover', 'STOP: dry run - sheet and Slack untouched'], outward: 'none' },
      check: out => {
        const p = out['Pick next on-call'][0];
        const f: string[] = [];
        if (p.primary?.name !== 'Dev Patel') f.push(`after Ana, Ben (away) and Chloe (inactive) are skipped: Dev, got ${p.primary?.name}`);
        if (p.secondary?.name !== 'Esme Larsen') f.push(`secondary should be Esme, got ${p.secondary?.name}`);
        if (p.skipped.map((s: any) => s.name + ':' + s.reason).join() !== 'Ben Okoro:away 3 days this week,Chloe Martin:inactive') f.push(`skips: ${JSON.stringify(p.skipped)}`);
        const t = out['Write the handover'][0].text;
        if (!t.includes('Ana Ruiz hands over to <@U01DEV>') || !t.includes('3 unacknowledged incidents (1 high urgency)')) f.push(`handover text: ${t}`);
        return f;
      },
    },
    {
      name: 'live with the sheet, PagerDuty and Slack', start: 'Every Monday at 09:00',
      overrides: { ROTA_SHEET_ID: '1SheetIdExample', USE_PAGERDUTY: true, DRY_RUN: false, SLACK_CHANNEL_ID: 'C0ONCALL', AWAY_GRACE_DAYS: 2 },
      mocks: {
        'Read Rotation tab': [
          { row_number: 2, order: 1, name: 'Kim', slack_id: 'U1KIM', active: 'yes', away: '' },
          { row_number: 3, order: 2, name: 'Lars', slack_id: 'U1LARS', active: 'yes', away: upcomingMonday(5) + '..' + upcomingMonday(6) },
          { row_number: 4, order: 3, name: 'Mo', slack_id: 'U1MO', active: 'yes', away: '' },
        ],
        'Read Schedule tab': [{ row_number: 2, week_start: upcomingMonday(-7), primary: 'Kim', secondary: 'Lars' }],
        'Count open incidents': [{ incidents: [{ id: 'P1', urgency: 'high', status: 'triggered' }], total: 1, limit: 25, more: false }],
        'Append the schedule row': (items: any[]) => items,
        'Post the handover to Slack': [{ ok: true, ts: '1700000000.0008' }],
      },
      expect: { reached: ['Read Schedule tab', 'Count open incidents', 'Append the schedule row', 'Post the handover to Slack'], notReached: ['Load sample rotation', 'Load sample incident count'], outward: 'some' },
      check: out => {
        const p = out['Pick next on-call'][0];
        const f: string[] = [];
        if (p.primary?.name !== 'Lars') f.push('Lars is away 2 days, inside AWAY_GRACE_DAYS 2, so takes the week');
        if (p.secondary?.name !== 'Mo') f.push('Mo is secondary');
        if (out['Append the schedule row'][0]?.primary !== 'Lars' || out['Append the schedule row'][0]?.open_incidents !== 1) f.push('the appended row should name Lars with 1 open incident');
        return f;
      },
    },
    {
      name: 'already rotated this week', start: 'Run manually',
      overrides: { ROTA_SHEET_ID: '1SheetIdExample' },
      mocks: {
        'Read Rotation tab': [{ order: 1, name: 'Kim', slack_id: 'U1KIM', active: 'yes', away: '' }],
        'Read Schedule tab': [{ week_start: upcomingMonday(), primary: 'Kim', secondary: '' }],
      },
      expect: { reached: ['STOP: already rotated this week'], notReached: ['Write the handover'], outward: 'none' },
    },
  ],
});
