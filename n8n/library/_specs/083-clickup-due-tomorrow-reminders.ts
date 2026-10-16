import { defineSpec } from '../_kit/spec';
import { trigger, code, ifTrue, merge, stop, http, slack } from '../_kit/n';

const cfg = (k: string) => `$('config').first().json.${k}`;

export default defineSpec({
  slug: 'clickup-due-tomorrow-reminders',
  title: 'Remind ClickUp assignees in Slack about tasks due tomorrow',
  summary: 'Every weekday afternoon finds open ClickUp tasks due tomorrow in your timezone (Saturday to Monday on Fridays), groups them per assignee and sends each person one Slack DM, with unassigned tasks going to a team channel.',
  category: 'Project management',
  description: {
    who: 'Team leads and agency project managers whose ClickUp due dates slip because nobody looks at them until the morning they are due. Each person gets one short Slack message the afternoon before.',
    how: [
      'Every weekday at 16:00 it works out tomorrow in your `TIMEZONE`. On Fridays the window runs from Saturday to the end of Monday, so weekend and Monday work shows up before people log off.',
      'It reads open tasks due in that window from ClickUp, or 7 sample tasks until ClickUp is connected.',
      'Tasks in a done status are dropped. The rest are grouped per assignee, sorted by priority and capped at `MAX_TASKS_PER_DM`.',
      'Each ClickUp user is looked up in `USER_MAP` and sent one Slack DM. Unassigned tasks go to `UNASSIGNED_CHANNEL`. Anyone missing from the map is listed in the run summary.',
    ],
    setup: [
      'Run it once as imported. It previews against sample tasks and stops at `STOP: preview - nothing sent`.',
      'Add a ClickUp credential to `Fetch tasks due from ClickUp`, fill in `CLICKUP_TEAM_ID` and set `USE_CLICKUP = true`.',
      'Connect Slack and map each ClickUp user id to a Slack member id in `USER_MAP`.',
      'For a test, set `TEST_EMAIL` to any address and `TEST_SLACK_CHANNEL` to a private channel: every DM lands there. Set `TEST_RUN = false` to message real people.',
    ],
    requirements: ['A ClickUp workspace', 'A Slack workspace with a bot that can send DMs'],
    customize: [
      '`TIMEZONE` decides where tomorrow starts and ends.',
      'Set `FRIDAY_ROLLUP = false` to send only Saturday tasks on Fridays.',
      '`DONE_STATUSES` lists the status names that count as finished on your boards.',
    ],
  },
  config: {
    intro: ['USE_CLICKUP false -> SAMPLE tasks so the run works before any credential exists.', 'TEST_RUN true + TEST_EMAIL set -> every DM goes to TEST_SLACK_CHANNEL instead.'],
    consts: [
      { name: 'USE_CLICKUP', value: false, note: 'set true after adding the ClickUp credential to the ClickUp node' },
      { name: 'CLICKUP_TEAM_ID', value: '', note: 'workspace (team) id, the number after app.clickup.com/ in your browser' },
      { name: 'TIMEZONE', value: 'America/New_York', note: 'IANA timezone that decides where tomorrow starts and ends' },
      { name: 'FRIDAY_ROLLUP', value: true, note: 'on Fridays remind about Saturday, Sunday and Monday in one message' },
      { name: 'DONE_STATUSES', value: ['complete', 'closed', 'done', 'shipped'], note: 'status names (lower case) that never get a reminder' },
      { name: 'USER_MAP', value: { '81001': 'U01AAAA0001', '81002': 'U01AAAA0002' }, note: 'ClickUp user id -> Slack member id' },
      { name: 'UNASSIGNED_CHANNEL', value: '', note: 'Slack channel for tasks with no assignee; blank lists them in the summary only' },
      { name: 'MAX_TASKS_PER_DM', value: 12, note: 'longer lists are cut with a count of the rest' },
      { name: 'TEST_SLACK_CHANNEL', value: '', note: 'test mode posts every reminder here instead of DMing the assignee' },
    ],
    flags: { unassigned_enabled: "UNASSIGNED_CHANNEL.trim() !== ''" },
    safety: 'test_run',
  },
  nodes: [
    trigger.manual(),
    trigger.schedule('Every weekday at 16:00', '0 16 * * 1-5'),
    code('Work out the due window', `
// Tomorrow in TIMEZONE, as epoch milliseconds for the ClickUp filter. On Friday
// (with FRIDAY_ROLLUP) the window stretches to the end of Monday.
const cfg = $('config').first().json;
const tz = cfg.timezone;
const parts = t => Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23',
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
  .formatToParts(new Date(t)).map(p => [p.type, p.value]));
const offset = t => { const p = parts(t); return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - t; };
const midnight = (y, m, d) => { const g = Date.UTC(y, m - 1, d); return g - offset(g - offset(g)); };
const p = parts(Date.now());
const y = +p.year, m = +p.month, d = +p.day;
const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 Sunday .. 6 Saturday
const days = cfg.friday_rollup && weekday === 5 ? 3 : 1;
const start = midnight(y, m, d + 1);
const end = midnight(y, m, d + 1 + days) - 1;
const label = new Date(Date.UTC(y, m - 1, d + 1)).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' });
return [{ json: { start, end, days, rollup: days > 1, label: days > 1 ? 'this weekend and Monday' : 'tomorrow, ' + label } }];`),
    ifTrue('ClickUp connected?', cfg('use_clickup')),
    http('Fetch tasks due from ClickUp', {
      url: `={{ 'https://api.clickup.com/api/v2/team/' + ${cfg('clickup_team_id')} + '/task' }}`, auth: 'clickUpApi',
      query: { due_date_gt: '={{ $json.start - 1 }}', due_date_lt: '={{ $json.end + 1 }}', include_closed: 'false', subtasks: 'true', order_by: 'due_date', page: '0' },
    }),
    code('Load sample ClickUp tasks', `
// Used until USE_CLICKUP is true. Due dates sit inside the window computed above,
// plus one task on day 2 of the window that only counts on a Friday roll-up.
const w = $('Work out the due window').first().json;
const at = h => String(w.start + h * 36e5);
const user = (id, username) => ({ id: Number(id), username, email: username.toLowerCase().replace(' ', '.') + '@studio.example' });
const ana = user('81001', 'Ana Ruiz'), tom = user('81002', 'Tom Becker'), kai = user('81003', 'Kai Morgan');
const task = (id, name, status, due, assignees, priority, list) => ({
  id, name, status: { status, type: status === 'complete' ? 'closed' : 'custom' }, due_date: due, assignees,
  priority: priority ? { priority } : null, list: { name: list }, url: 'https://app.clickup.com/t/' + id,
});
return [{ json: { last_page: true, tasks: [
  task('86a1', 'Send homepage copy for review', 'in progress', at(10), [ana], 'high', 'Northfield website'),
  task('86a2', 'Export final logo files', 'to do', at(12), [ana, tom], 'urgent', 'Northfield brand'),
  task('86a3', 'Book photographer for shoot', 'to do', at(15), [tom], 'normal', 'Orchard Lane campaign'),
  task('86a4', 'Invoice October retainer', 'complete', at(9), [tom], 'high', 'Admin'),
  task('86a5', 'Draft social calendar', 'to do', at(11), [], 'low', 'Orchard Lane campaign'),
  task('86a6', 'QA contact form', 'review', at(14), [kai], 'normal', 'Northfield website'),
  task('86a7', 'Prep Monday client workshop', 'to do', at(34), [ana], 'normal', 'Lumen Physio'),
] } }];`),
    merge('Combine task sources'),
    code('Group tasks per assignee', `
// Re-check the window (ClickUp compares in UTC, the sample is synthetic), drop done
// statuses, then build one message per person. Every task not sent says why.
const cfg = $('config').first().json;
const w = $('Work out the due window').first().json;
const rank = { urgent: 0, high: 1, normal: 2, low: 3 };
const done = cfg.done_statuses.map(s => s.toLowerCase());
const tasks = $input.all().flatMap(i => i.json.tasks || []);
const people = {}, unassigned = [], held = [];
for (const t of tasks) {
  const due = Number(t.due_date);
  if (!due || due < w.start || due > w.end) { held.push({ task: t.name, reason: 'outside the due window' }); continue; }
  if (done.includes(String(t.status?.status || '').toLowerCase())) { held.push({ task: t.name, reason: 'already ' + t.status.status }); continue; }
  const row = { id: t.id, name: t.name, url: t.url, list: t.list?.name || '', due, priority: t.priority?.priority || 'normal' };
  if (!(t.assignees || []).length) { unassigned.push(row); continue; }
  for (const a of t.assignees) (people[a.id] ||= { clickup_id: String(a.id), name: a.username, tasks: [] }).tasks.push(row);
}
const day = ms => new Date(ms).toLocaleDateString('en-US', { weekday: 'short', timeZone: cfg.timezone });
const lines = list => {
  const sorted = [...list].sort((a, b) => (rank[a.priority] ?? 2) - (rank[b.priority] ?? 2) || a.due - b.due);
  const shown = sorted.slice(0, cfg.max_tasks_per_dm).map(t => '- [' + t.priority + '] <' + t.url + '|' + t.name + '> (' + t.list + (w.rollup ? ', ' + day(t.due) : '') + ')');
  if (sorted.length > shown.length) shown.push('- ...and ' + (sorted.length - shown.length) + ' more in ClickUp');
  return shown;
};
const messages = [];
for (const p of Object.values(people)) {
  const slackId = cfg.user_map[p.clickup_id];
  if (!slackId) { held.push({ task: p.tasks.length + ' task(s) for ' + p.name, reason: 'no Slack user in USER_MAP for ' + p.clickup_id }); continue; }
  messages.push({ kind: 'dm', who: p.name, target: slackId, count: p.tasks.length,
    text: ['Hi ' + p.name.split(' ')[0] + ', you have ' + p.tasks.length + ' task(s) due ' + w.label + ':', ...lines(p.tasks)].join('\\n') });
}
if (unassigned.length) {
  if (cfg.unassigned_enabled) messages.push({ kind: 'channel', who: 'unassigned', target: cfg.unassigned_channel, count: unassigned.length,
    text: [unassigned.length + ' unassigned task(s) due ' + w.label + '. Can someone pick these up?', ...lines(unassigned)].join('\\n') });
  else for (const t of unassigned) held.push({ task: t.name, reason: 'unassigned and UNASSIGNED_CHANNEL is blank' });
}
const out = messages.map(m => ({ ...m, send_to: cfg.mode === 'test' ? cfg.test_slack_channel : m.target }));
return [{ json: { messages: out.filter(m => m.send_to), held: [...held, ...out.filter(m => !m.send_to).map(m => ({ task: m.who, reason: 'test mode needs TEST_SLACK_CHANNEL' }))], window: w.label, checked: tasks.length } }];`),
    code('Split into Slack messages', `
// One item per message so each DM is its own Slack call.
return $input.first().json.messages.map(json => ({ json }));`),
    ifTrue('Sending switched on?', cfg('sends_enabled')),
    stop('STOP: preview - nothing sent'),
    slack.post('Send the reminder in Slack', '$json.send_to', "($('config').first().json.mode === 'test' ? '[TEST for ' + $json.who + '] ' : '') + $json.text"),
    code('Summarise the run', `
// What the run decided, for the execution log: who was messaged and what was held back.
const cfg = $('config').first().json;
const g = $input.first().json;
const text = [
  'ClickUp due reminders (' + cfg.mode + ') for ' + g.window + ': ' + g.checked + ' tasks read, ' + g.messages.length + ' message(s).',
  ...g.messages.map(m => '- ' + m.who + ': ' + m.count + ' task(s)'),
  ...(g.held.length ? ['Held back:', ...g.held.map(h => '- ' + h.task + ': ' + h.reason)] : []),
].join('\\n');
return [{ json: { text, messages: g.messages.length, held: g.held.length } }];`),
  ],
  edges: [
    ['Run manually', 'config'], ['Every weekday at 16:00', 'config'],
    ['config', 'Work out the due window'],
    ['Work out the due window', 'ClickUp connected?'],
    ['ClickUp connected?', 0, 'Fetch tasks due from ClickUp'], ['ClickUp connected?', 1, 'Load sample ClickUp tasks'],
    ['Fetch tasks due from ClickUp', 'Combine task sources'], ['Load sample ClickUp tasks', 0, 'Combine task sources', 1],
    ['Combine task sources', 'Group tasks per assignee'],
    ['Group tasks per assignee', 'Split into Slack messages'],
    ['Group tasks per assignee', 'Summarise the run'],
    ['Split into Slack messages', 'Sending switched on?'],
    ['Sending switched on?', 0, 'Send the reminder in Slack'], ['Sending switched on?', 1, 'STOP: preview - nothing sent'],
  ],
  groups: [
    { title: 'Start and settings', why: 'Runs every weekday at 16:00 or by hand, late enough that today is mostly done and early enough to replan. The timezone, user map and done statuses all live in `config`.', nodes: ['Run manually', 'Every weekday at 16:00', 'config'] },
    { title: 'Read tasks due in the window', why: '`Work out the due window` turns tomorrow in `TIMEZONE` into the epoch range ClickUp filters on, and widens it on Fridays. `Load sample ClickUp tasks` uses that same window, so the sample always has work.', nodes: ['Work out the due window', 'ClickUp connected?', 'Fetch tasks due from ClickUp', 'Load sample ClickUp tasks', 'Combine task sources'] },
    { title: 'Group per person and report', why: 'One message per person instead of one per task keeps the DMs readable. Done statuses, tasks outside the window and people missing from `USER_MAP` are held with a reason, and `Summarise the run` lists them.', nodes: ['Group tasks per assignee', 'Split into Slack messages', 'Summarise the run'] },
    { title: 'Send in Slack', why: 'Nothing is posted while `TEST_RUN` is true and `TEST_EMAIL` is blank. In test mode every DM is redirected to `TEST_SLACK_CHANNEL`, so the wording can be checked without pinging the team.', nodes: ['Sending switched on?', 'STOP: preview - nothing sent', 'Send the reminder in Slack'] },
  ],
  scenarios: [
    {
      name: 'shipped config (preview)', start: 'Run manually',
      expect: { reached: ['Load sample ClickUp tasks', 'STOP: preview - nothing sent', 'Summarise the run'], outward: 'none' },
      check: out => {
        const g = out['Group tasks per assignee'][0];
        const f: string[] = [];
        const friday = out['Work out the due window'][0].rollup;
        const ana = g.messages.find((m: any) => m.who === 'Ana Ruiz');
        if (ana?.count !== (friday ? 3 : 2)) f.push(`Ana should have ${friday ? 3 : 2} tasks, got ${ana?.count}`);
        if (g.messages.find((m: any) => m.who === 'Tom Becker')?.count !== 2) f.push('Tom should have 2 open tasks (the complete one dropped)');
        if (!g.held.some((h: any) => h.reason === 'already complete')) f.push('completed task not held');
        if (!g.held.some((h: any) => h.reason.startsWith('no Slack user'))) f.push('Kai (unmapped) not held');
        if (!g.held.some((h: any) => h.reason.startsWith('unassigned'))) f.push('unassigned task not held');
        if (!friday && !g.held.some((h: any) => h.reason === 'outside the due window')) f.push('day-2 task should be outside the window on non-Fridays');
        const first = ana?.text.split('\n')[1] || '';
        if (!first.startsWith('- [urgent]')) f.push('urgent task should be listed first');
        return f;
      },
    },
    {
      name: 'test mode into a test channel', start: 'Run manually',
      overrides: { TEST_EMAIL: 'you@example.com', TEST_SLACK_CHANNEL: 'C0TESTCHAN', UNASSIGNED_CHANNEL: 'C0TEAM' },
      mocks: { 'Send the reminder in Slack': (items: any[]) => items.map(() => ({ ok: true })) },
      expect: { reached: ['Send the reminder in Slack'], notReached: ['STOP: preview - nothing sent'], outward: 'some' },
      check: out => {
        const msgs = out['Split into Slack messages'];
        const f: string[] = [];
        if (!msgs.every((m: any) => m.send_to === 'C0TESTCHAN')) f.push('test mode must redirect every message');
        if (!msgs.some((m: any) => m.kind === 'channel')) f.push('unassigned message should be built when UNASSIGNED_CHANNEL is set');
        return f;
      },
    },
    {
      name: 'live with ClickUp', start: 'Every weekday at 16:00',
      overrides: { USE_CLICKUP: true, CLICKUP_TEAM_ID: '9012345', TEST_RUN: false },
      mocks: {
        'Fetch tasks due from ClickUp': (items: any[]) => [{ last_page: true, tasks: [
          { id: 'x1', name: 'Ship release notes', status: { status: 'in progress' }, due_date: String(items[0].start + 9 * 36e5), assignees: [{ id: 81002, username: 'Tom Becker' }], priority: { priority: 'high' }, list: { name: 'Product' }, url: 'https://app.clickup.com/t/x1' },
        ] }],
        'Send the reminder in Slack': [{ ok: true }],
      },
      expect: { reached: ['Fetch tasks due from ClickUp', 'Send the reminder in Slack'], notReached: ['Load sample ClickUp tasks'], outward: 'some' },
      check: out => out['Split into Slack messages'][0]?.send_to === 'U01AAAA0002' ? [] : ['live DM should go to the mapped Slack id'],
    },
  ],
});
