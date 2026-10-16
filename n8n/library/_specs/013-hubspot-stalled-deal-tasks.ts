import { defineSpec } from '../_kit/spec';
import { trigger, code, ifTrue, merge, stop, http, slack } from '../_kit/n';

const cfg = (k: string) => `$('config').first().json.${k}`;

export default defineSpec({
  slug: 'hubspot-stalled-deal-tasks',
  title: 'Create follow-up tasks for stalled HubSpot deals',
  summary: 'Each weekday, compares every open HubSpot deal\'s days since last activity with a limit for its stage, creates one follow-up task per stalled deal (never a second while one is open), and posts a per-owner summary to Slack.',
  category: 'Sales and CRM',
  description: {
    who: 'Sales managers whose HubSpot pipeline has deals nobody has touched in weeks. Each rep gets a task on the deals that went quiet, so the follow-up happens in HubSpot where they already work.',
    how: [
      'Every weekday at 07:30 it reads open deals and open follow-up tasks from HubSpot, or sample data until HubSpot is connected.',
      'Days idle is counted from the last logged activity. Each stage has its own limit in `STAGE_MAX_IDLE_DAYS` (5 days for Contract sent, 14 for Decision maker bought in), with `DEFAULT_MAX_IDLE_DAYS` for custom stages.',
      'A deal over its limit gets one task, due tomorrow, with priority High at twice the limit. A deal that already has an open follow-up task is skipped, so tasks never pile up.',
      'Unowned deals go to `FALLBACK_OWNER_ID`. Slack gets one summary grouped by owner.',
    ],
    setup: [
      'Run it once as imported. It checks sample deals and stops at `STOP: not live - no tasks created` and `STOP: preview - nothing posted`.',
      'Create a HubSpot private app with deals and tasks scopes, add it to the three HubSpot nodes, then set `USE_HUBSPOT = true`.',
      'Edit `STAGE_MAX_IDLE_DAYS` with your internal stage ids, and connect Slack with `SLACK_CHANNEL_ID`.',
      'For a test, set `TEST_EMAIL` to any address and `TEST_SLACK_CHANNEL` to a private channel, where the test summary lands. Set `TEST_RUN = false` to create tasks and post to `SLACK_CHANNEL_ID`.',
    ],
    requirements: ['A HubSpot account with Sales Hub deals and a private app token', 'Optional: a Slack workspace'],
    customize: [
      '`STAGE_MAX_IDLE_DAYS` holds the limit per stage id.',
      '`MIN_DEAL_AMOUNT` leaves small deals alone.',
      '`MAX_TASKS_PER_RUN` caps how many tasks one run can create.',
    ],
  },
  config: {
    intro: ['USE_HUBSPOT false -> SAMPLE deals and tasks so the run works before any credential exists.', 'Tasks carry the deal id in the subject, which is how an open task is recognised next time.', 'Test mode (TEST_RUN true + TEST_EMAIL set) posts to TEST_SLACK_CHANNEL, never to SLACK_CHANNEL_ID.'],
    consts: [
      { name: 'USE_HUBSPOT', value: false, note: 'set true after adding the HubSpot credential to the HubSpot nodes' },
      { name: 'STAGE_MAX_IDLE_DAYS', value: { appointmentscheduled: 10, qualifiedtobuy: 10, presentationscheduled: 7, decisionmakerboughtin: 14, contractsent: 5 }, note: 'internal stage id -> days without activity before a task is made' },
      { name: 'DEFAULT_MAX_IDLE_DAYS', value: 14, note: 'limit for stages not listed above' },
      { name: 'MIN_DEAL_AMOUNT', value: 500, note: 'deals below this amount are skipped' },
      { name: 'FALLBACK_OWNER_ID', value: '101', note: 'HubSpot owner id that gets tasks for unowned deals' },
      { name: 'OWNER_NAMES', value: { '101': 'Maya Ortiz', '102': 'Theo Grant', '103': 'Ines Park' }, note: 'owner id -> name for the Slack summary' },
      { name: 'MAX_TASKS_PER_RUN', value: 30, note: 'hard ceiling on tasks created in one run' },
      { name: 'TASK_PREFIX', value: 'Stalled deal follow-up', note: 'start of every task subject; also used to find open tasks' },
      { name: 'SLACK_CHANNEL_ID', value: '', note: 'channel for the owner summary; blank posts nothing' },
      { name: 'TEST_SLACK_CHANNEL', value: '', note: 'test mode posts here instead of the real channel; blank means test mode posts nothing' },
    ],
    flags: { slack_enabled: "SLACK_CHANNEL_ID.trim() !== ''", test_slack_enabled: "TEST_SLACK_CHANNEL.trim() !== ''" },
    safety: 'test_run',
  },
  nodes: [
    trigger.manual(),
    trigger.schedule('Every weekday at 07:30', '30 7 * * 1-5'),
    ifTrue('Use sample deals?', '!' + cfg('use_hubspot')),
    code('Load sample deals', `
// Used until USE_HUBSPOT is true. One deal already has an open follow-up task.
const ago = n => new Date(Date.now() - n * 864e5).toISOString();
const d = (id, name, stage, idle, amount, owner) => ({ id, name, stage, amount, owner_id: owner, last_activity: ago(idle) });
return [{ json: {
  deals: [
    d('7001', 'Harbour Dental - website', 'contractsent', 9, 12000, '101'),
    d('7002', 'Northfield rebrand', 'qualifiedtobuy', 4, 8000, '102'),
    d('7003', 'Lumen booking app', 'presentationscheduled', 12, 15000, '102'),
    d('7004', 'Orchard menu site', 'decisionmakerboughtin', 20, 4500, '103'),
    d('7005', 'Pine and Co logo', 'appointmentscheduled', 30, 300, '103'),
    d('7006', 'Quarry Labs pilot', 'custom_pilot_stage', 25, 20000, '101'),
    d('7007', 'Tallow renewal', 'contractsent', 40, 6000, ''),
  ],
  open_task_subjects: ['Stalled deal follow-up: Lumen booking app (#7003)'],
} }];`),
    http('Search open deals', {
      method: 'POST', url: 'https://api.hubapi.com/crm/v3/objects/deals/search', auth: 'hubspotAppToken', outward: false,
      jsonBody: "JSON.stringify({ filterGroups: [{ filters: [{ propertyName: 'hs_is_closed', operator: 'EQ', value: 'false' }] }], properties: ['dealname', 'dealstage', 'amount', 'hubspot_owner_id', 'notes_last_updated', 'hs_last_sales_activity_timestamp', 'createdate'], sorts: [{ propertyName: 'notes_last_updated', direction: 'ASCENDING' }], limit: 100 })",
    }),
    code('Collect open deals', `
// Last activity: logged notes/calls/emails first, then sales activity, then creation date.
const deals = [];
for (const page of $input.all()) for (const r of page.json.results || []) {
  const p = r.properties || {};
  deals.push({ id: r.id, name: p.dealname || 'Deal ' + r.id, stage: p.dealstage || '', amount: Number(p.amount || 0), owner_id: p.hubspot_owner_id || '',
    last_activity: p.notes_last_updated || p.hs_last_sales_activity_timestamp || p.createdate });
}
return [{ json: { deals } }];`),
    http('Search open follow-up tasks', {
      method: 'POST', url: 'https://api.hubapi.com/crm/v3/objects/tasks/search', auth: 'hubspotAppToken', outward: false,
      jsonBody: `JSON.stringify({ filterGroups: [{ filters: [{ propertyName: 'hs_task_status', operator: 'NEQ', value: 'COMPLETED' }, { propertyName: 'hs_task_subject', operator: 'CONTAINS_TOKEN', value: ${cfg('task_prefix')}.split(' ')[0] }] }], properties: ['hs_task_subject', 'hs_task_status'], limit: 100 })`,
    }),
    code('Collect deals and tasks', `
// Pairs the deals with the subjects of open tasks, in the sample shape.
const subjects = [];
for (const page of $input.all()) for (const r of page.json.results || []) subjects.push(r.properties?.hs_task_subject || '');
return [{ json: { deals: $('Collect open deals').first().json.deals, open_task_subjects: subjects } }];`),
    merge('Combine deal sources'),
    code('Find stalled deals', `
// A deal is stalled when days idle exceed its stage limit. An open task whose
// subject carries "(#dealId)" means someone is already on it, so no second task.
const cfg = $('config').first().json;
const { deals, open_task_subjects } = $input.first().json;
const covered = new Set(open_task_subjects.filter(s => s.startsWith(cfg.task_prefix)).map(s => (s.match(/\\(#(\\d+)\\)/) || [])[1]).filter(Boolean));
const now = Date.now();
const tasks = [], skipped = [];
for (const d of deals) {
  const idle = Math.floor((now - new Date(d.last_activity).getTime()) / 864e5);
  const limit = cfg.stage_max_idle_days[d.stage] ?? cfg.default_max_idle_days;
  if (idle <= limit) continue;
  if (d.amount < cfg.min_deal_amount) { skipped.push({ id: d.id, name: d.name, reason: 'below MIN_DEAL_AMOUNT' }); continue; }
  if (covered.has(String(d.id))) { skipped.push({ id: d.id, name: d.name, reason: 'open follow-up task exists' }); continue; }
  tasks.push({ ...d, idle, limit, ratio: idle / limit, priority: idle >= 2 * limit ? 'HIGH' : 'MEDIUM', owner_id: d.owner_id || cfg.fallback_owner_id, unowned: !d.owner_id });
}
tasks.sort((a, b) => b.ratio - a.ratio);
for (const t of tasks.slice(cfg.max_tasks_per_run)) skipped.push({ id: t.id, name: t.name, reason: 'over MAX_TASKS_PER_RUN' });
return [{ json: { tasks: tasks.slice(0, cfg.max_tasks_per_run), skipped, open_deals: deals.length } }];`),
    code('Write one task per deal', `
// Task subject carries the deal id so the next run can see this task is open.
const cfg = $('config').first().json;
const due = new Date(); due.setDate(due.getDate() + 1); due.setHours(9, 0, 0, 0);
return $input.first().json.tasks.map(t => ({ json: { ...t,
  subject: cfg.task_prefix + ': ' + t.name + ' (#' + t.id + ')',
  body: 'No activity for ' + t.idle + ' days; the limit for stage ' + t.stage + ' is ' + t.limit + '. Log a call, email or meeting, or move the deal on.' + (t.unowned ? ' This deal had no owner.' : ''),
  due_ms: due.getTime() } }));`),
    code('Write the owner summary', `
// One Slack message grouped by owner, with what was skipped and why.
const cfg = $('config').first().json;
const { tasks, skipped, open_deals } = $input.first().json;
const name = id => cfg.owner_names[id] || 'owner ' + id;
const by = {};
for (const t of tasks) (by[t.owner_id] ||= []).push(t);
const text = [
  (cfg.mode === 'test' ? '[TEST] ' : '') + '*Stalled deals*: ' + tasks.length + ' follow-up task' + (tasks.length === 1 ? '' : 's') + (cfg.mode === 'live' ? ' created' : ' prepared') + ' from ' + open_deals + ' open deals',
  ...Object.entries(by).map(([id, list]) => '*' + name(id) + '*: ' + list.map(t => t.name + ' (' + t.idle + 'd idle' + (t.priority === 'HIGH' ? ', high' : '') + (t.unowned ? ', was unowned' : '') + ')').join('; ')),
  ...(skipped.length ? ['', 'Skipped: ' + skipped.map(s => s.name + ' - ' + s.reason).join('; ')] : []),
].join('\\n');
return [{ json: { text, send_to: cfg.mode === 'test' ? cfg.test_slack_channel.trim() : cfg.slack_channel_id } }];`),
    ifTrue('Posting switched on?', `${cfg('sends_enabled')} && (${cfg('mode')} === 'test' || ${cfg('slack_enabled')})`),
    stop('STOP: preview - nothing posted'),
    ifTrue('Test channel set?', `${cfg('mode')} !== 'test' || ${cfg('test_slack_enabled')}`),
    stop('STOP: test - TEST_SLACK_CHANNEL blank'),
    slack.post('Post the owner summary', '$json.send_to', '$json.text'),
    ifTrue('Live run?', cfg('live')),
    stop('STOP: not live - no tasks created'),
    http('Create the task in HubSpot', {
      method: 'POST', url: 'https://api.hubapi.com/crm/v3/objects/tasks', auth: 'hubspotAppToken',
      jsonBody: "JSON.stringify({ properties: { hs_timestamp: String($json.due_ms), hs_task_subject: $json.subject, hs_task_body: $json.body, hs_task_status: 'NOT_STARTED', hs_task_priority: $json.priority, hs_task_type: 'TODO', hubspot_owner_id: $json.owner_id }, associations: [{ to: { id: $json.id }, types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 216 }] }] })",
    }),
  ],
  edges: [
    ['Run manually', 'config'], ['Every weekday at 07:30', 'config'],
    ['config', 'Use sample deals?'],
    ['Use sample deals?', 0, 'Load sample deals'], ['Use sample deals?', 1, 'Search open deals'],
    ['Search open deals', 'Collect open deals'],
    ['Collect open deals', 'Search open follow-up tasks'],
    ['Search open follow-up tasks', 'Collect deals and tasks'],
    ['Load sample deals', 'Combine deal sources'], ['Collect deals and tasks', 0, 'Combine deal sources', 1],
    ['Combine deal sources', 'Find stalled deals'],
    ['Find stalled deals', 'Write one task per deal'],
    ['Find stalled deals', 'Write the owner summary'],
    ['Write the owner summary', 'Posting switched on?'],
    ['Posting switched on?', 0, 'Test channel set?'], ['Posting switched on?', 1, 'STOP: preview - nothing posted'],
    ['Test channel set?', 0, 'Post the owner summary'], ['Test channel set?', 1, 'STOP: test - TEST_SLACK_CHANNEL blank'],
    ['Write one task per deal', 'Live run?'],
    ['Live run?', 0, 'Create the task in HubSpot'], ['Live run?', 1, 'STOP: not live - no tasks created'],
  ],
  groups: [
    { title: 'Start and settings', why: 'Runs before the working day so tasks are waiting when reps log in. Stage limits, the fallback owner and the task cap live in `config`.', nodes: ['Run manually', 'Every weekday at 07:30', 'config'] },
    { title: 'Read deals and open tasks', why: 'Open follow-up tasks are fetched alongside deals, because the duplicate check has to happen before anything is created. `Load sample deals` supplies both until `USE_HUBSPOT` is true.', nodes: ['Use sample deals?', 'Load sample deals', 'Search open deals', 'Collect open deals', 'Search open follow-up tasks', 'Collect deals and tasks', 'Combine deal sources'] },
    { title: 'Find stalled deals and report', why: '`Find stalled deals` compares idle days with the limit for that stage, skips small deals and deals already covered by an open task, and applies `MAX_TASKS_PER_RUN`. Slack gets the same list grouped by owner. A test summary goes only to `TEST_SLACK_CHANNEL`, and stops at a STOP if that is blank.', nodes: ['Find stalled deals', 'Write one task per deal', 'Write the owner summary', 'Posting switched on?', 'STOP: preview - nothing posted', 'Test channel set?', 'STOP: test - TEST_SLACK_CHANNEL blank', 'Post the owner summary'] },
    { title: 'Create tasks', why: 'Tasks are created only on a live run, each associated with its deal and assigned to the deal owner. The deal id in the subject is what stops tomorrow\'s run from making a second one.', nodes: ['Live run?', 'STOP: not live - no tasks created', 'Create the task in HubSpot'] },
  ],
  scenarios: [
    {
      name: 'shipped config (preview)', start: 'Run manually',
      expect: { reached: ['Load sample deals', 'STOP: not live - no tasks created', 'STOP: preview - nothing posted'], outward: 'none' },
      check: out => {
        const s = out['Find stalled deals'][0];
        const f: string[] = [];
        const got = s.tasks.map((t: any) => t.id + ':' + t.priority + ':' + t.owner_id).join(',');
        if (got !== '7007:HIGH:101,7001:MEDIUM:101,7006:MEDIUM:101,7004:MEDIUM:103') f.push(`tasks wrong: ${got}`);
        const reasons = Object.fromEntries(s.skipped.map((x: any) => [x.id, x.reason]));
        if (reasons['7003'] !== 'open follow-up task exists') f.push('deal with an open task should be skipped');
        if (reasons['7005'] !== 'below MIN_DEAL_AMOUNT') f.push('small deal should be skipped');
        if (!out['Write one task per deal'][0].subject.endsWith('(#7007)')) f.push('subject must carry the deal id');
        return f;
      },
    },
    {
      name: 'test mode with no test channel', start: 'Run manually',
      overrides: { TEST_EMAIL: 'you@example.com', SLACK_CHANNEL_ID: 'C0SALES' },
      expect: { reached: ['STOP: test - TEST_SLACK_CHANNEL blank', 'STOP: not live - no tasks created'], notReached: ['Post the owner summary', 'STOP: preview - nothing posted', 'Create the task in HubSpot'], outward: 'none' },
    },
    {
      name: 'test mode into the test channel', start: 'Run manually',
      overrides: { TEST_EMAIL: 'you@example.com', SLACK_CHANNEL_ID: 'C0SALES', TEST_SLACK_CHANNEL: 'C0TESTCHAN' },
      mocks: { 'Post the owner summary': (items: any[]) => items.map(j => ({ ok: true, channel: j.send_to })) },
      expect: { reached: ['Post the owner summary', 'STOP: not live - no tasks created'], notReached: ['Create the task in HubSpot'], outward: 'some' },
      check: out => {
        const f: string[] = [];
        if (out['Post the owner summary'][0]?.channel !== 'C0TESTCHAN') f.push(`test post must go to TEST_SLACK_CHANNEL, went to ${out['Post the owner summary'][0]?.channel}`);
        if (!out['Write the owner summary'][0].text.startsWith('[TEST] ')) f.push('test summary needs the [TEST] prefix');
        return f;
      },
    },
    {
      name: 'live with HubSpot and Slack', start: 'Every weekday at 07:30',
      overrides: { USE_HUBSPOT: true, TEST_RUN: false, SLACK_CHANNEL_ID: 'C0SALES' },
      mocks: {
        'Search open deals': [{ total: 2, results: [
          { id: '8101', properties: { dealname: 'Ridge Timber expansion', dealstage: 'contractsent', amount: '9000', hubspot_owner_id: '102', notes_last_updated: new Date(Date.now() - 8 * 864e5).toISOString() } },
          { id: '8102', properties: { dealname: 'Brightline audit', dealstage: 'contractsent', amount: '7000', hubspot_owner_id: '102', notes_last_updated: new Date(Date.now() - 9 * 864e5).toISOString() } },
        ] }],
        'Search open follow-up tasks': [{ total: 1, results: [{ id: 't1', properties: { hs_task_subject: 'Stalled deal follow-up: Brightline audit (#8102)', hs_task_status: 'NOT_STARTED' } }] }],
        'Post the owner summary': (items: any[]) => items.map(j => ({ ok: true, channel: j.send_to })),
        'Create the task in HubSpot': (items: any[]) => items.map((_, i) => ({ id: 'task' + i, properties: {} })),
      },
      expect: { reached: ['Collect deals and tasks', 'Create the task in HubSpot', 'Post the owner summary'], outward: 'some' },
      check: out => {
        const t = out['Write one task per deal'];
        const f: string[] = t.length === 1 && t[0].id === '8101' ? [] : [`only 8101 should get a task, got ${t.map((x: any) => x.id)}`];
        if (out['Post the owner summary'][0]?.channel !== 'C0SALES') f.push('live post must go to SLACK_CHANNEL_ID');
        return f;
      },
    },
  ],
});
