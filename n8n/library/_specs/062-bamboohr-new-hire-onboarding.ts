import { defineSpec } from '../_kit/spec';
import { trigger, code, ifTrue, ifWhen, merge, stop, http, slack } from '../_kit/n';

const cfg = (k: string) => `$('config').first().json.${k}`;

export default defineSpec({
  slug: 'bamboohr-new-hire-onboarding',
  title: 'Create Notion onboarding checklists and Slack welcomes for new BambooHR hires',
  summary: 'Reads BambooHR hires starting in the next 7 days, builds a dated onboarding checklist per hire from common and department tasks, creates one Notion page each and posts a Slack welcome on their first day.',
  category: 'HR and people',
  description: {
    who: 'People teams of 20 to 300 staff who run onboarding from a copied checklist and a reminder in someone\'s calendar. Every hire gets the same dated list a week before they start, with nothing to copy by hand.',
    how: [
      'Every weekday at 08:00 it reads hires from a BambooHR custom report, or sample hires until BambooHR is connected.',
      'Hires starting in the next 7 days get a checklist: the common tasks plus their department\'s tasks, each dated relative to the start day and given an owner.',
      'Inactive records, hires outside the window and hires that already have a page are held back with a reason.',
      'Each checklist becomes a Notion page with to-do blocks. On the start day (or the Monday after a weekend start) a welcome is posted to Slack.',
    ],
    setup: [
      'Run it once as imported. It plans checklists for sample hires and stops at `STOP: dry run - no Notion pages`.',
      'Add a Header Auth credential to `Fetch hires from BambooHR` (name `Authorization`, value `Basic` plus base64 of `your_api_key:x`), set `BAMBOOHR_SUBDOMAIN` and `USE_BAMBOOHR = true`.',
      'Create a Notion database with Name, Start date and Department properties, share it with your integration and put its id in `NOTION_DATABASE_ID`.',
      'Set `SLACK_CHANNEL_ID` for welcomes, check the preview in `Plan onboarding per hire`, then set `DRY_RUN = false`.',
    ],
    requirements: ['A BambooHR account with API access', 'A Notion workspace and integration', 'Optional: a Slack workspace'],
    customize: [
      '`COMMON_TASKS` and `DEPARTMENT_TASKS` hold every checklist line with its day offset and owner.',
      '`LOOKAHEAD_DAYS` sets how early a page is created before the start date.',
      '`WELCOME_TEMPLATE` is the Slack message; `{name}`, `{title}`, `{team}` and `{manager}` are filled in.',
    ],
  },
  config: {
    intro: ['USE_BAMBOOHR false -> SAMPLE hires. NOTION_DATABASE_ID blank -> no pages. SLACK_CHANNEL_ID blank -> no welcome.', 'DRY_RUN true -> checklists are planned and shown, nothing is created or posted.'],
    consts: [
      { name: 'USE_BAMBOOHR', value: false, note: 'set true after adding the Header Auth credential to the BambooHR node' },
      { name: 'BAMBOOHR_SUBDOMAIN', value: 'yourcompany', note: 'the part before .bamboohr.com in your BambooHR address' },
      { name: 'LOOKAHEAD_DAYS', value: 7, note: 'hires starting within this many days get their checklist page' },
      { name: 'COMMON_TASKS', value: [
        { task: 'Order and ship laptop', offset: -5, owner: 'IT' },
        { task: 'Send first-day email with time, address and contact', offset: -3, owner: 'People team' },
        { task: 'Create email, Slack and HR system accounts', offset: -2, owner: 'IT' },
        { task: 'Book first-week 1:1s', offset: -1, owner: 'Manager' },
        { task: 'Benefits enrolment walkthrough', offset: 3, owner: 'People team' },
        { task: '30-day check-in', offset: 30, owner: 'Manager' },
      ], note: 'tasks every hire gets; offset = days relative to the start date' },
      { name: 'DEPARTMENT_TASKS', value: {
        Engineering: [{ task: 'Grant GitHub and staging access', offset: -1, owner: 'IT' }, { task: 'Pair on a first pull request', offset: 2, owner: 'Buddy' }],
        Sales: [{ task: 'CRM seat and territory assignment', offset: -1, owner: 'Sales ops' }, { task: 'Shadow 3 discovery calls', offset: 5, owner: 'Manager' }],
        'Customer Success': [{ task: 'Helpdesk seat and macros', offset: -1, owner: 'Support ops' }, { task: 'Take 10 supervised tickets', offset: 4, owner: 'Buddy' }],
      }, note: 'extra tasks by BambooHR department name' },
      { name: 'NOTION_DATABASE_ID', value: '', note: 'Notion database for onboarding pages; blank skips page creation' },
      { name: 'SLACK_CHANNEL_ID', value: '', note: 'channel for start-day welcomes; blank skips Slack' },
      { name: 'WELCOME_TEMPLATE', value: 'Please welcome {name}, who joins {team} today as {title}. {manager} is their manager. Say hi!', note: 'start-day Slack message' },
    ],
    flags: { notion_enabled: "NOTION_DATABASE_ID.trim() !== ''", slack_enabled: "SLACK_CHANNEL_ID.trim() !== ''" },
    safety: 'dry_run',
  },
  nodes: [
    trigger.manual(),
    trigger.schedule('Every weekday at 08:00', '0 8 * * 1-5'),
    ifTrue('BambooHR connected?', cfg('use_bamboohr')),
    http('Fetch hires from BambooHR', {
      method: 'POST', outward: false, auth: 'header',
      url: `={{ 'https://api.bamboohr.com/api/gateway.php/' + ${cfg('bamboohr_subdomain')} + '/v1/reports/custom' }}`,
      query: { format: 'JSON', onlyCurrent: 'false' }, headers: { Accept: 'application/json' },
      jsonBody: "JSON.stringify({ title: 'Upcoming hires', fields: ['id', 'displayName', 'firstName', 'workEmail', 'jobTitle', 'department', 'location', 'hireDate', 'supervisor', 'status'] })",
    }),
    code('Read BambooHR employees', `
// Custom report response -> one item per employee in the shape the planner reads.
const out = [];
for (const page of $input.all()) {
  for (const e of page.json.employees || []) {
    out.push({ json: {
      id: String(e.id), name: e.displayName || e.firstName || '', first_name: e.firstName || '',
      email: e.workEmail || '', title: e.jobTitle || '', department: e.department || '',
      location: e.location || '', hire_date: e.hireDate && e.hireDate !== '0000-00-00' ? e.hireDate : '',
      manager: e.supervisor || '', status: e.status || 'Active',
    } });
  }
}
return out;`),
    code('Load sample hires', `
// Used until USE_BAMBOOHR is true. Start dates are relative to today so the window always has work.
const day = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
return [
  { id: '4101', name: 'Priya Natarajan', first_name: 'Priya', email: 'priya.n@northwind.example', title: 'Backend Engineer', department: 'Engineering', location: 'Remote', hire_date: day(3), manager: 'Tomas Reyes', status: 'Active' },
  { id: '4102', name: 'Leon Fischer', first_name: 'Leon', email: 'leon.f@northwind.example', title: 'Account Executive', department: 'Sales', location: 'Berlin', hire_date: day(0), manager: 'Ana Duarte', status: 'Active' },
  { id: '4103', name: 'Grace Okafor', first_name: 'Grace', email: 'grace.o@northwind.example', title: 'Office Coordinator', department: 'Operations', location: 'London', hire_date: day(6), manager: 'Sam Whitlow', status: 'Active' },
  { id: '4104', name: 'Mateo Silva', first_name: 'Mateo', email: 'mateo.s@northwind.example', title: 'Support Specialist', department: 'Customer Success', location: 'Lisbon', hire_date: day(12), manager: 'Ana Duarte', status: 'Active' },
  { id: '4105', name: 'Hana Ito', first_name: 'Hana', email: '', title: 'Designer', department: 'Product', location: 'Remote', hire_date: day(2), manager: 'Tomas Reyes', status: 'Inactive' },
  { id: '3020', name: 'Owen Price', first_name: 'Owen', email: 'owen.p@northwind.example', title: 'Analyst', department: 'Finance', location: 'London', hire_date: day(-200), manager: 'Sam Whitlow', status: 'Active' },
].map(json => ({ json }));`),
    merge('Combine hire sources'),
    code('Plan onboarding per hire', `
// A hire gets a page once, when they first fall inside LOOKAHEAD_DAYS. Task dates are
// start date + offset; a task already in the past is pulled to today and marked late.
// Welcomes go out on the start day, or on Monday for a Saturday/Sunday start.
const cfg = $('config').first().json;
const store = $getWorkflowStaticData('global');
const paged = new Set(store.paged || []), welcomed = new Set(store.welcomed || []);
const today = new Date().toISOString().slice(0, 10);
const addDays = (d, n) => new Date(new Date(d + 'T00:00:00Z').getTime() + n * 864e5).toISOString().slice(0, 10);
const diff = (a, b) => Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 864e5);
const isMonday = new Date(today + 'T00:00:00Z').getUTCDay() === 1;
const pages = [], welcomes = [], held = [];
let checked = 0;
for (const { json: h } of $input.all()) {
  if (!h.id) continue;
  checked++;
  const days = h.hire_date ? diff(today, h.hire_date) : null;
  const welcomeDue = days === 0 || (isMonday && (days === -1 || days === -2));
  if (h.status !== 'Active') { held.push({ name: h.name, reason: 'record is ' + h.status }); continue; }
  if (days === null) { held.push({ name: h.name, reason: 'no hire date' }); continue; }
  if (days > cfg.lookahead_days) { held.push({ name: h.name, reason: 'starts in ' + days + ' days, outside LOOKAHEAD_DAYS' }); continue; }
  if (days < -2) continue; // existing staff, not a new hire
  if (welcomeDue && !welcomed.has(h.id)) {
    const text = cfg.welcome_template.replace('{name}', h.name).replace('{team}', h.department || 'the team')
      .replace('{title}', h.title || 'a new teammate').replace('{manager}', h.manager || 'Their manager');
    welcomes.push({ id: h.id, name: h.name, text });
  }
  if (paged.has(h.id)) { held.push({ name: h.name, reason: 'page already created' }); continue; }
  const extra = cfg.department_tasks[h.department] || [];
  const tasks = [...cfg.common_tasks, ...extra].map(t => {
    const due = addDays(h.hire_date, t.offset);
    const late = due < today;
    return { task: t.task, owner: t.owner, due: late ? today : due, late };
  }).sort((a, b) => a.due.localeCompare(b.due));
  pages.push({ ...h, days_to_start: days, tasks, late_tasks: tasks.filter(t => t.late).length,
    department_tasks: extra.length, note: extra.length ? '' : 'no DEPARTMENT_TASKS for ' + (h.department || 'blank department') });
}
return [{ json: { pages, welcomes, held, checked } }];`),
    code('Summarise the run', `
// One readable line per decision for the execution log.
const cfg = $('config').first().json;
const p = $input.first().json;
const text = [
  'New hire onboarding (' + cfg.mode + '): ' + p.checked + ' records, ' + p.pages.length + ' checklists, ' + p.welcomes.length + ' welcomes.',
  ...p.pages.map(x => '- ' + x.name + ' (' + x.department + ') starts in ' + x.days_to_start + ' days: ' + x.tasks.length + ' tasks' + (x.late_tasks ? ', ' + x.late_tasks + ' late' : '')),
  ...p.held.map(h => '- held: ' + h.name + ': ' + h.reason),
].join('\\n');
return [{ json: { text } }];`),
    code('Shape Notion pages', `
// One Notion page per hire: database properties plus one to-do block per task.
const cfg = $('config').first().json;
const rt = s => [{ type: 'text', text: { content: String(s).slice(0, 1900) } }];
return $input.first().json.pages.map(h => ({ json: {
  hire_id: h.id, name: h.name,
  notion_body: {
    parent: { database_id: cfg.notion_database_id },
    properties: {
      Name: { title: rt('Onboarding: ' + h.name) },
      'Start date': { date: { start: h.hire_date } },
      Department: { select: { name: h.department || 'Unassigned' } },
    },
    children: [
      { object: 'block', type: 'paragraph', paragraph: { rich_text: rt(h.title + ', ' + h.location + '. Manager: ' + (h.manager || 'not set') + '. Starts ' + h.hire_date + '.') } },
      ...h.tasks.map(t => ({ object: 'block', type: 'to_do', to_do: { checked: false,
        rich_text: rt(t.due + ' | ' + t.owner + ' | ' + t.task + (t.late ? ' (late)' : '')) } })),
    ],
  },
} }));`),
    ifWhen('Create Notion pages?', [[cfg('live'), 'true'], [cfg('notion_enabled'), 'true']]),
    stop('STOP: dry run - no Notion pages'),
    http('Create onboarding page in Notion', { method: 'POST', url: 'https://api.notion.com/v1/pages', auth: 'notionApi', headers: { 'Notion-Version': '2022-06-28' }, jsonBody: 'JSON.stringify($json.notion_body)' }),
    code('Remember paged hires', `
// Only hires whose page came back with an id are remembered, so a failed create retries tomorrow.
const store = $getWorkflowStaticData('global');
const shaped = $('Shape Notion pages').all();
const ids = new Set(store.paged || []);
const done = $input.all().map((it, i) => ({ hire: shaped[i]?.json.name, hire_id: shaped[i]?.json.hire_id, page_id: it.json.id, url: it.json.url }))
  .filter(x => x.page_id);
done.forEach(x => ids.add(x.hire_id));
store.paged = [...ids].slice(-500);
return done.map(json => ({ json }));`),
    code('Write start-day welcomes', `
// One item per welcome so each Slack post can be retried on its own.
return $input.first().json.welcomes.map(w => ({ json: w }));`),
    ifWhen('Post welcomes?', [[cfg('live'), 'true'], [cfg('slack_enabled'), 'true']]),
    stop('STOP: dry run - no welcome posted'),
    slack.post('Post welcome to Slack', cfg('slack_channel_id'), "$('Write start-day welcomes').item.json.text"),
    code('Remember welcomed hires', `
// Stops a manual re-run on the same day from welcoming someone twice.
const store = $getWorkflowStaticData('global');
const ids = new Set(store.welcomed || []);
$('Write start-day welcomes').all().forEach(w => ids.add(w.json.id));
store.welcomed = [...ids].slice(-500);
return [{ json: { welcomed: ids.size } }];`),
  ],
  edges: [
    ['Run manually', 'config'], ['Every weekday at 08:00', 'config'],
    ['config', 'BambooHR connected?'],
    ['BambooHR connected?', 0, 'Fetch hires from BambooHR'], ['BambooHR connected?', 1, 'Load sample hires'],
    ['Fetch hires from BambooHR', 'Read BambooHR employees'],
    ['Read BambooHR employees', 'Combine hire sources'], ['Load sample hires', 0, 'Combine hire sources', 1],
    ['Combine hire sources', 'Plan onboarding per hire'],
    ['Plan onboarding per hire', 'Shape Notion pages'],
    ['Plan onboarding per hire', 'Write start-day welcomes'],
    ['Plan onboarding per hire', 'Summarise the run'],
    ['Shape Notion pages', 'Create Notion pages?'],
    ['Create Notion pages?', 0, 'Create onboarding page in Notion'], ['Create Notion pages?', 1, 'STOP: dry run - no Notion pages'],
    ['Create onboarding page in Notion', 'Remember paged hires'],
    ['Write start-day welcomes', 'Post welcomes?'],
    ['Post welcomes?', 0, 'Post welcome to Slack'], ['Post welcomes?', 1, 'STOP: dry run - no welcome posted'],
    ['Post welcome to Slack', 'Remember welcomed hires'],
  ],
  groups: [
    { title: 'Start and settings', why: 'Runs every weekday at 08:00 or by hand. Both task lists, the look-ahead window and the welcome wording live in `config`, so changing the checklist never means touching a Code node.', nodes: ['Run manually', 'Every weekday at 08:00', 'config'] },
    { title: 'Read upcoming hires', why: 'A BambooHR custom report returns hire date, department and supervisor in one call. Until `USE_BAMBOOHR` is true, `Load sample hires` feeds the same shape, including an inactive record and an existing employee.', nodes: ['BambooHR connected?', 'Fetch hires from BambooHR', 'Read BambooHR employees', 'Load sample hires', 'Combine hire sources'] },
    { title: 'Plan each checklist', why: '`Plan onboarding per hire` dates every task from the start day and pulls late ones to today, so a hire added two days before starting still gets a usable list. Hires that already have a page are held back by id.', nodes: ['Plan onboarding per hire'] },
    { title: 'Create pages and post welcomes', why: 'Pages and welcomes need both a live run and a target. `Remember paged hires` stores only ids whose page came back from Notion, so a failed create is retried on the next run instead of being lost.', nodes: ['Shape Notion pages', 'Write start-day welcomes', 'Summarise the run', 'Create Notion pages?', 'Post welcomes?', 'STOP: dry run - no Notion pages', 'Create onboarding page in Notion', 'Remember paged hires', 'STOP: dry run - no welcome posted', 'Post welcome to Slack', 'Remember welcomed hires'] },
  ],
  scenarios: [
    {
      name: 'shipped config (dry run)', start: 'Run manually',
      expect: { reached: ['Load sample hires', 'STOP: dry run - no Notion pages', 'STOP: dry run - no welcome posted', 'Summarise the run'], outward: 'none' },
      check: out => {
        const p = out['Plan onboarding per hire'][0];
        const f: string[] = [];
        if (p.pages.length !== 3) f.push(`expected 3 checklists, got ${p.pages.length}`);
        if (p.welcomes.length !== 1 || p.welcomes[0].name !== 'Leon Fischer') f.push('Leon Fischer starts today and should get the only welcome');
        const eng = p.pages.find((x: any) => x.name === 'Priya Natarajan');
        if (eng?.tasks.length !== 8) f.push(`engineering hire should have 6 common + 2 department tasks, got ${eng?.tasks.length}`);
        if (eng?.late_tasks !== 1) f.push(`only the laptop task (5 days before a start in 3 days) is late; expected 1, got ${eng?.late_tasks}`);
        const ops = p.pages.find((x: any) => x.name === 'Grace Okafor');
        if (!ops?.note.includes('Operations')) f.push('Operations has no department tasks and should say so');
        if (!p.held.some((h: any) => h.reason.includes('Inactive'))) f.push('inactive record not held');
        if (!p.held.some((h: any) => h.reason.includes('12 days'))) f.push('hire 12 days out not held');
        if (out['Shape Notion pages'].length !== 3) f.push('3 Notion payloads expected');
        return f;
      },
    },
    {
      name: 'live with BambooHR, Notion and Slack', start: 'Every weekday at 08:00',
      overrides: { USE_BAMBOOHR: true, DRY_RUN: false, NOTION_DATABASE_ID: 'a1b2c3d4e5f6', SLACK_CHANNEL_ID: 'C0123456' },
      mocks: {
        'Fetch hires from BambooHR': [{ title: 'Upcoming hires', fields: [], employees: [
          { id: '77', displayName: 'Ruth Adeyemi', firstName: 'Ruth', workEmail: 'ruth@northwind.example', jobTitle: 'Frontend Engineer', department: 'Engineering', location: 'Remote', hireDate: new Date().toISOString().slice(0, 10), supervisor: 'Tomas Reyes', status: 'Active' },
          { id: '78', displayName: 'Kofi Mensah', firstName: 'Kofi', workEmail: 'kofi@northwind.example', jobTitle: 'SDR', department: 'Sales', location: 'Accra', hireDate: new Date(Date.now() + 4 * 864e5).toISOString().slice(0, 10), supervisor: 'Ana Duarte', status: 'Active' },
        ] }],
        'Create onboarding page in Notion': (items: any[]) => items.map((_, i) => ({ object: 'page', id: 'page-' + i, url: 'https://www.notion.so/page' + i })),
        'Post welcome to Slack': (items: any[]) => items.map(() => ({ ok: true, ts: '1700000000.0001' })),
      },
      expect: { reached: ['Create onboarding page in Notion', 'Remember paged hires', 'Post welcome to Slack', 'Remember welcomed hires'], notReached: ['Load sample hires'], outward: 'some' },
      check: out => {
        const f: string[] = [];
        if (out['Remember paged hires'].length !== 2) f.push('both hires should be remembered as paged');
        const body = out['Shape Notion pages'][0].notion_body;
        if (body.parent.database_id !== 'a1b2c3d4e5f6') f.push('page parent should be NOTION_DATABASE_ID');
        if (!out['Write start-day welcomes'][0]?.text.includes('Ruth Adeyemi')) f.push('welcome should name Ruth');
        return f;
      },
    },
  ],
});
