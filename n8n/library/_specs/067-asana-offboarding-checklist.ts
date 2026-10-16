import { defineSpec } from '../_kit/spec';
import { trigger, code, ifTrue, ifWhen, merge, stop, http } from '../_kit/n';

const cfg = (k: string) => `$('config').first().json.${k}`;
const dayFromNow = (n: number) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

export default defineSpec({
  slug: 'asana-offboarding-checklist',
  title: 'Create offboarding checklists in Asana from a leaver form',
  summary: 'Turns one leaver form into an Asana task with dated subtasks for access, equipment, handover, payroll and people steps, picked by department and leaving type, assigned by task type and moved off weekends.',
  category: 'HR and people',
  description: {
    who: 'People and IT teams at companies of 20 to 500 that offboard from memory or an old checklist and find out months later that someone kept access. Each leaver gets the same dated list, owned by the right people.',
    how: [
      'A manager submits the leaver form with the last day, department, leaving type and whether a laptop must come back. A manual run uses a sample leaver.',
      'Tasks come from `BASE_TASKS` plus the department\'s `ROLE_TASKS`. The laptop task is dropped when there is none, and the exit interview is skipped for dismissals.',
      'Each task is due relative to the last day. Weekend dates move to the Friday before, past dates move to today, and for a dismissal every access task is due today and marked urgent.',
      'One parent task goes into `ASANA_PROJECT_GID` and every step becomes a subtask, assigned through `OWNERS` by task type.',
    ],
    setup: [
      'Run it once as imported. It builds the checklist for a sample leaver and stops at `STOP: dry run - Asana untouched`.',
      'Add an Asana credential to `Create the offboarding task` and `Create each subtask`, and set `ASANA_PROJECT_GID` (the number in the project URL).',
      'Replace the addresses in `OWNERS` with people in your Asana workspace and edit the task lists.',
      'Check the plan in `Build the checklist`, then set `DRY_RUN = false` and share the form URL with managers.',
    ],
    requirements: ['An Asana workspace and project', 'An n8n instance that can serve a form'],
    customize: [
      '`BASE_TASKS` and `ROLE_TASKS` hold each step with its type and day offset from the last day.',
      '`OWNERS` maps a task type to an assignee; `manager` means the manager named on the form.',
      '`MIN_NOTICE_DAYS` flags forms submitted too close to the last day.',
    ],
  },
  config: {
    intro: ['A manual run uses a SAMPLE leaver; the form trigger uses the submitted one.', 'DRY_RUN true -> the checklist is built and shown, nothing is created in Asana.'],
    consts: [
      { name: 'ASANA_PROJECT_GID', value: '', note: 'Asana project that holds offboarding tasks; blank skips Asana' },
      { name: 'BASE_TASKS', value: [
        { task: 'Handover document reviewed with manager', type: 'handover', offset: -5 },
        { task: 'Final payroll: unused leave, expenses and last payslip', type: 'payroll', offset: -5 },
        { task: 'Exit interview', type: 'people', offset: -3, skip_for: ['Dismissal'] },
        { task: 'Transfer Drive files and shared inboxes to the manager', type: 'handover', offset: -2 },
        { task: 'Collect laptop, charger and badge', type: 'equipment', offset: 0, needs_laptop: true },
        { task: 'Suspend Google Workspace account and SSO', type: 'access', offset: 0 },
        { task: 'Remove from Slack, password manager and shared vaults', type: 'access', offset: 0 },
        { task: 'Update the HR system and org chart', type: 'people', offset: 1 },
      ], note: 'steps for every leaver; offset = days relative to the last day' },
      { name: 'ROLE_TASKS', value: {
        Engineering: [{ task: 'Reassign open pull requests and on-call shifts', type: 'handover', offset: -3 }, { task: 'Remove GitHub org membership and rotate shared secrets', type: 'access', offset: 0 }],
        Sales: [{ task: 'Reassign CRM accounts and open deals', type: 'handover', offset: -3 }, { task: 'Remove CRM seat and calling licence', type: 'access', offset: 1 }],
        'Customer Success': [{ task: 'Reassign open tickets and customer accounts', type: 'handover', offset: -3 }, { task: 'Remove helpdesk seat', type: 'access', offset: 0 }],
      }, note: 'extra steps by department' },
      { name: 'OWNERS', value: { access: 'it@northwind.example', equipment: 'it@northwind.example', handover: 'manager', payroll: 'payroll@northwind.example', people: 'people@northwind.example' }, note: "task type -> Asana assignee email or gid; 'manager' = the manager on the form" },
      { name: 'PARENT_OWNER', value: 'people@northwind.example', note: 'assignee of the parent offboarding task' },
      { name: 'MIN_NOTICE_DAYS', value: 5, note: 'a form submitted with fewer days left than this is flagged as short notice' },
    ],
    flags: { asana_enabled: "ASANA_PROJECT_GID.trim() !== ''", from_form: 'FROM_FORM' },
    safety: 'dry_run',
    extra: `// The form trigger's item carries formMode; a manual run does not.
const FROM_FORM = Boolean($input.first() && ($input.first().json.formMode || $input.first().json.submittedAt));`,
  },
  nodes: [
    trigger.manual(),
    trigger.form('Leaver form', 'Someone is leaving', 'Fill this in as soon as a last day is agreed. It creates the offboarding checklist in Asana.', [
      { label: 'Leaver name', required: true },
      { label: 'Leaver work email', type: 'email', required: true },
      { label: 'Manager email', type: 'email', required: true },
      { label: 'Department', type: 'dropdown', options: ['Engineering', 'Sales', 'Customer Success', 'Operations', 'Finance'], required: true },
      { label: 'Last working day', type: 'date', required: true },
      { label: 'Leaving type', type: 'dropdown', options: ['Resignation', 'Contract end', 'Dismissal'], required: true },
      { label: 'Has a company laptop', type: 'dropdown', options: ['Yes', 'No'], required: true },
      { label: 'Anything IT or payroll should know', type: 'textarea' },
    ]),
    ifTrue('Came from the form?', cfg('from_form')),
    code('Read the leaver form', `
// Form labels -> the leaver shape the checklist reads.
const f = $('Leaver form').first().json;
return [{ json: {
  name: String(f['Leaver name'] || '').trim(), email: String(f['Leaver work email'] || '').trim().toLowerCase(),
  manager_email: String(f['Manager email'] || '').trim().toLowerCase(), department: f['Department'] || '',
  last_day: String(f['Last working day'] || '').slice(0, 10), leaving_type: f['Leaving type'] || 'Resignation',
  laptop: f['Has a company laptop'] === 'Yes', notes: f['Anything IT or payroll should know'] || '',
} }];`),
    code('Load sample leaver', `
// Manual run: an engineer resigning with a laptop to return, last day 12 days out.
return [{ json: {
  name: 'Felix Andersen', email: 'felix.andersen@northwind.example', manager_email: 'tomas.reyes@northwind.example',
  department: 'Engineering', last_day: new Date(Date.now() + 12 * 864e5).toISOString().slice(0, 10),
  leaving_type: 'Resignation', laptop: true, notes: 'Keeps the monitor (bought personally).',
} }];`),
    merge('Combine leaver sources'),
    code('Build the checklist', `
// Dates: last day + offset, Saturday/Sunday back to Friday, anything past pulled to today.
// A dismissal makes every access step due today and urgent, whatever its offset.
const cfg = $('config').first().json;
const l = $input.first().json;
const today = new Date().toISOString().slice(0, 10);
const problems = [];
if (!l.name || !l.email) problems.push('leaver name or email missing');
if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(l.last_day || '')) problems.push('last working day missing');
else if (l.last_day < new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10)) problems.push('last day is more than 30 days ago');
if (problems.length) return [{ json: { ok: false, problems, leaver: l } }];
const shift = (iso, n) => {
  const d = new Date(new Date(iso + 'T00:00:00Z').getTime() + n * 864e5);
  const dow = d.getUTCDay();
  if (dow === 6) d.setUTCDate(d.getUTCDate() - 1);
  if (dow === 0) d.setUTCDate(d.getUTCDate() - 2);
  const s = d.toISOString().slice(0, 10);
  return { due: s < today ? today : s, moved: dow % 6 === 0, pulled: s < today };
};
const dismissal = l.leaving_type === 'Dismissal';
const owner = t => { const o = cfg.owners[t] || cfg.parent_owner; return o === 'manager' ? (l.manager_email || cfg.parent_owner) : o; };
const skipped = [];
const steps = [...cfg.base_tasks, ...(cfg.role_tasks[l.department] || [])].filter(t => {
  if (t.needs_laptop && !l.laptop) { skipped.push(t.task + ' (no laptop)'); return false; }
  if ((t.skip_for || []).includes(l.leaving_type)) { skipped.push(t.task + ' (' + l.leaving_type + ')'); return false; }
  return true;
}).map(t => {
  const urgent = dismissal && t.type === 'access';
  const d = urgent ? { due: today, moved: false, pulled: false } : shift(l.last_day, t.offset);
  return { name: (urgent ? '[URGENT] ' : '') + t.task, type: t.type, due_on: d.due, assignee: owner(t.type),
    note: d.moved ? 'moved off a weekend' : d.pulled ? 'due date already passed, set to today' : '' };
}).sort((a, b) => a.due_on.localeCompare(b.due_on));
const daysLeft = Math.round((new Date(l.last_day) - new Date(today)) / 864e5);
const flags = [];
if (daysLeft < cfg.min_notice_days) flags.push('short notice: ' + daysLeft + ' days to the last day');
if (!cfg.role_tasks[l.department]) flags.push('no ROLE_TASKS for ' + l.department);
const parent = {
  name: 'Offboarding: ' + l.name + ' (last day ' + l.last_day + ')',
  due_on: l.last_day, assignee: cfg.parent_owner,
  notes: [l.name + ' <' + l.email + '>, ' + l.department + ', ' + l.leaving_type.toLowerCase() + '.', 'Manager: ' + (l.manager_email || 'not given'),
    'Laptop to return: ' + (l.laptop ? 'yes' : 'no'), l.notes ? 'Notes: ' + l.notes : '', ...flags.map(x => 'Flag: ' + x),
    skipped.length ? 'Not needed: ' + skipped.join('; ') : ''].filter(Boolean).join('\\n'),
};
return [{ json: { ok: true, leaver: l, parent, steps, skipped, flags, days_left: daysLeft } }];`),
    ifTrue('Checklist complete?', '$json.ok'),
    stop('STOP: form incomplete - nothing created'),
    ifWhen('Create in Asana?', [[cfg('live'), 'true'], [cfg('asana_enabled'), 'true']]),
    stop('STOP: dry run - Asana untouched'),
    http('Create the offboarding task', {
      method: 'POST', url: 'https://app.asana.com/api/1.0/tasks', auth: 'asanaApi',
      jsonBody: `JSON.stringify({ data: { ...$json.parent, projects: [${cfg('asana_project_gid')}] } })`,
    }),
    code('Shape subtasks', `
// One item per step, each pointing at the parent task Asana just created.
const parentGid = $input.first().json.data.gid;
return $('Build the checklist').first().json.steps.map(s => ({ json: { parent_gid: parentGid,
  body: { data: { name: s.name, due_on: s.due_on, assignee: s.assignee, notes: 'Type: ' + s.type + (s.note ? '. ' + s.note : '') } } } }));`),
    http('Create each subtask', {
      method: 'POST', auth: 'asanaApi',
      url: "={{ 'https://app.asana.com/api/1.0/tasks/' + $json.parent_gid + '/subtasks' }}",
      jsonBody: 'JSON.stringify($json.body)',
    }),
    code('Report what was created', `
// Links back to Asana for the execution log.
const parent = $('Create the offboarding task').first().json.data;
return [{ json: { parent: parent.permalink_url || parent.gid, subtasks: $input.all().filter(i => i.json.data?.gid).length } }];`),
  ],
  edges: [
    ['Run manually', 'config'], ['Leaver form', 'config'],
    ['config', 'Came from the form?'],
    ['Came from the form?', 0, 'Read the leaver form'], ['Came from the form?', 1, 'Load sample leaver'],
    ['Read the leaver form', 'Combine leaver sources'], ['Load sample leaver', 0, 'Combine leaver sources', 1],
    ['Combine leaver sources', 'Build the checklist'],
    ['Build the checklist', 'Checklist complete?'],
    ['Checklist complete?', 0, 'Create in Asana?'], ['Checklist complete?', 1, 'STOP: form incomplete - nothing created'],
    ['Create in Asana?', 0, 'Create the offboarding task'], ['Create in Asana?', 1, 'STOP: dry run - Asana untouched'],
    ['Create the offboarding task', 'Shape subtasks'],
    ['Shape subtasks', 'Create each subtask'],
    ['Create each subtask', 'Report what was created'],
  ],
  groups: [
    { title: 'Start and settings', why: 'The form is the real entry point and a manual run uses the sample leaver. Every task, offset and owner lives in `config`, so a new department is one more entry in `ROLE_TASKS`.', nodes: ['Run manually', 'Leaver form', 'config'] },
    { title: 'Read the leaver', why: '`config` records whether the form fired and `Came from the form?` picks the reader. Both emit the same leaver shape, so the checklist logic never knows which one ran.', nodes: ['Came from the form?', 'Read the leaver form', 'Load sample leaver', 'Combine leaver sources'] },
    { title: 'Build the dated checklist', why: '`Build the checklist` refuses a form without a usable last day rather than guessing. Dates are moved off weekends and out of the past, and a dismissal pulls every access step to today so nothing waits on the calendar.', nodes: ['Build the checklist', 'Checklist complete?', 'STOP: form incomplete - nothing created'] },
    { title: 'Create in Asana', why: 'The parent task is created first because subtasks need its gid. `Create in Asana?` needs a live run and a project id; in a dry run the full plan is still visible on `Build the checklist`.', nodes: ['Create in Asana?', 'STOP: dry run - Asana untouched', 'Create the offboarding task', 'Shape subtasks', 'Create each subtask', 'Report what was created'] },
  ],
  scenarios: [
    {
      name: 'shipped config (sample leaver, dry run)', start: 'Run manually',
      expect: { reached: ['Load sample leaver', 'STOP: dry run - Asana untouched'], outward: 'none' },
      check: out => {
        const b = out['Build the checklist'][0];
        const f: string[] = [];
        if (b.steps.length !== 10) f.push(`8 base + 2 Engineering steps expected, got ${b.steps.length}`);
        if (b.steps.some((s: any) => [0, 6].includes(new Date(s.due_on + 'T00:00:00Z').getUTCDay()))) f.push('a step is due on a weekend');
        const handover = b.steps.find((s: any) => s.name.startsWith('Reassign open pull'));
        if (handover?.assignee !== 'tomas.reyes@northwind.example') f.push('handover steps belong to the manager');
        if (b.steps.some((s: any) => s.name.startsWith('[URGENT]'))) f.push('a resignation has no urgent steps');
        if (b.flags.length) f.push(`no flags expected, got ${b.flags}`);
        return f;
      },
    },
    {
      name: 'dismissal from the form, live in Asana', start: 'Leaver form',
      input: [{ 'Leaver name': 'Rory Quinn', 'Leaver work email': 'rory.quinn@northwind.example', 'Manager email': 'ana.duarte@northwind.example', Department: 'Sales', 'Last working day': dayFromNow(2), 'Leaving type': 'Dismissal', 'Has a company laptop': 'No', 'Anything IT or payroll should know': '', submittedAt: new Date().toISOString(), formMode: 'production' }],
      overrides: { DRY_RUN: false, ASANA_PROJECT_GID: '1204567890123456' },
      mocks: {
        'Create the offboarding task': [{ data: { gid: '1209000000000001', resource_type: 'task', name: 'Offboarding: Rory Quinn', permalink_url: 'https://app.asana.com/0/1204567890123456/1209000000000001' } }],
        'Create each subtask': (items: any[]) => items.map((_, i) => ({ data: { gid: '120900000000010' + i, resource_type: 'task' } })),
      },
      expect: { reached: ['Read the leaver form', 'Create the offboarding task', 'Create each subtask', 'Report what was created'], notReached: ['Load sample leaver'], outward: 'some' },
      check: out => {
        const b = out['Build the checklist'][0];
        const f: string[] = [];
        if (b.steps.length !== 8) f.push(`8 base - laptop - exit interview + 2 Sales = 8, got ${b.steps.length}`);
        const today = new Date().toISOString().slice(0, 10);
        const access = b.steps.filter((s: any) => s.type === 'access');
        if (access.length !== 3 || access.some((s: any) => s.due_on !== today || !s.name.startsWith('[URGENT]'))) f.push('every access step should be urgent and due today');
        if (!b.flags.some((x: string) => x.startsWith('short notice'))) f.push('2 days notice should be flagged');
        if (out['Shape subtasks'][0].parent_gid !== '1209000000000001') f.push('subtasks must point at the new parent');
        if (out['Report what was created'][0].subtasks !== 8) f.push('8 subtasks should be reported');
        return f;
      },
    },
    {
      name: 'form without a last day', start: 'Leaver form',
      input: [{ 'Leaver name': 'Sam Ode', 'Leaver work email': 'sam.ode@northwind.example', 'Manager email': '', Department: 'Finance', 'Last working day': '', 'Leaving type': 'Resignation', 'Has a company laptop': 'Yes', formMode: 'production', submittedAt: new Date().toISOString() }],
      expect: { reached: ['STOP: form incomplete - nothing created'], notReached: ['Create in Asana?'], outward: 'none' },
    },
  ],
});
