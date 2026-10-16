import { defineSpec } from '../_kit/spec';
import { trigger, code, ifTrue, merge, stop, http, gmail } from '../_kit/n';

const cfg = (k: string) => `$('config').first().json.${k}`;
const due = (n: number) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);

export default defineSpec({
  slug: 'asana-overdue-status-email',
  title: 'Email a weekly overdue-task report from Asana to each project owner',
  summary: 'Every Monday it reads incomplete tasks from a list of Asana projects, keeps the ones past their due date, buckets them by days overdue, and sends each project owner one email covering all their projects, with unassigned tasks called out.',
  category: 'Productivity and operations',
  description: {
    who: 'Operations leads and agency owners running 5 to 40 Asana projects, where overdue tasks pile up quietly because nobody opens the project view. Each owner gets one list on Monday morning and can fix dates or nudge people from it.',
    how: [
      'Every Monday at 08:00 it reads each project in `PROJECT_GIDS` (name and owner), then its incomplete tasks with due date, assignee and tags. Sample projects are used until Asana is connected.',
      'Tasks due before today are overdue. Tasks tagged with any of `SKIP_TAGS` are left out.',
      'Each task goes into a bucket from `BUCKETS` (1-7, 8-30 and over 30 days by default), oldest first, and unassigned tasks are flagged.',
      'Owners get one email each with every project they own. Projects with no owner go to `FALLBACK_EMAIL`.',
    ],
    setup: [
      'Run it once as imported. It reports on sample projects and stops at `STOP: preview - nothing sent`.',
      'Add an Asana credential to `Fetch project details` and `Fetch incomplete tasks`, put your project gids in `PROJECT_GIDS` and set `USE_ASANA = true`.',
      'Connect Gmail and set `FALLBACK_EMAIL`.',
      'Put your own address in `TEST_EMAIL` to receive every owner email yourself, then set `TEST_RUN = false`.',
    ],
    requirements: ['An Asana workspace', 'A Gmail account'],
    customize: [
      '`BUCKETS` sets the overdue ranges and their labels.',
      '`SKIP_TAGS` keeps parked work, such as tasks tagged on hold, out of the report.',
      '`MAX_TASKS_PER_PROJECT` caps each project section; the rest is counted.',
    ],
  },
  config: {
    intro: ['USE_ASANA false -> SAMPLE projects and tasks, so the run works before any credential exists.', 'Owners without an email address on Asana get their report sent to FALLBACK_EMAIL.'],
    consts: [
      { name: 'USE_ASANA', value: false, note: 'set true after adding the Asana credential to both Asana nodes' },
      { name: 'PROJECT_GIDS', value: ['1204000000000001', '1204000000000002', '1204000000000003', '1204000000000004'], note: 'Asana project gids (the number in the project URL)' },
      { name: 'BUCKETS', value: [{ max: 7, label: '1-7 days late' }, { max: 30, label: '8-30 days late' }, { max: 99999, label: 'over 30 days late' }], note: 'overdue ranges, checked in order' },
      { name: 'SKIP_TAGS', value: ['on hold', 'someday'], note: 'tasks with any of these tags are not reported' },
      { name: 'MAX_TASKS_PER_PROJECT', value: 15, note: 'most tasks listed per project; the rest is counted' },
      { name: 'FALLBACK_EMAIL', value: 'ops@northwind.example', note: 'gets reports for projects without an owner email' },
    ],
    safety: 'test_run',
  },
  nodes: [
    trigger.manual(),
    trigger.schedule('Every Monday at 08:00', '0 8 * * 1'),
    code('List projects', `
// One item per project gid.
return $('config').first().json.project_gids.map(gid => ({ json: { gid } }));`),
    ifTrue('Asana off?', '!' + cfg('use_asana')),
    code('Load sample projects', `
// Used until USE_ASANA is true. Same shape Read projects and tasks builds, dates relative to today.
const day = n => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
const t = (gid, name, d, assignee, tags = []) => ({ gid, name, due_on: d === null ? null : day(d), assignee: assignee ? { name: assignee } : null, tags: tags.map(name => ({ name })),
  permalink_url: 'https://app.asana.com/0/0/' + gid });
return [
  { project: { gid: 'p1', name: 'Website relaunch', owner: { name: 'Maya Torres', email: 'maya@northwind.example' } }, tasks: [
    t('t11', 'Final copy for pricing page', 3, 'Ben Okoro'), t('t12', 'Accessibility audit', 12, null), t('t13', 'Redirect map', 45, 'Ana Ruiz'),
    t('t14', 'Launch checklist', -2, 'Maya Torres'), t('t15', 'Legacy blog import', 20, 'Ben Okoro', ['On hold']), t('t16', 'Favicon', null, 'Ana Ruiz') ] },
  { project: { gid: 'p2', name: 'Q4 newsletter', owner: { name: 'Maya Torres', email: 'maya@northwind.example' } }, tasks: [
    t('t21', 'Draft issue 3', 1, 'Chloe Martin') ] },
  { project: { gid: 'p3', name: 'Office move', owner: { name: 'Tom Reyes', email: 'tom@northwind.example' } }, tasks: [
    t('t31', 'Book movers', 0, 'Tom Reyes'), t('t32', 'Order desks', -5, 'Tom Reyes') ] },
  { project: { gid: 'p4', name: 'Vendor review', owner: null }, tasks: [
    t('t41', 'Compare payroll vendors', 9, 'Esme Larsen') ] },
].map(json => ({ json }));`),
    http('Fetch project details', { url: "={{ 'https://app.asana.com/api/1.0/projects/' + $json.gid }}", auth: 'asanaApi', query: { opt_fields: 'name,owner.name,owner.email,permalink_url' } }),
    http('Fetch incomplete tasks', { url: "={{ 'https://app.asana.com/api/1.0/projects/' + $json.data.gid + '/tasks' }}", auth: 'asanaApi', query: { completed_since: 'now', limit: '100', opt_fields: 'name,due_on,assignee.name,tags.name,permalink_url' } }),
    code('Read projects and tasks', `
// Task page i belongs to project i; completed_since=now already left only incomplete tasks.
const projects = $('Fetch project details').all().map(i => i.json.data || {});
return $input.all().map((it, i) => ({ json: { project: projects[i], tasks: it.json.data || [] } }));`),
    merge('Combine project sources'),
    code('Find overdue tasks', `
// Overdue = due_on before today. Bucket by days late, oldest first; skip SKIP_TAGS.
const cfg = $('config').first().json;
const today = new Date().toISOString().slice(0, 10);
const skip = cfg.skip_tags.map(s => s.toLowerCase());
const late = d => Math.round((new Date(today) - new Date(d)) / 864e5);
const owners = {};
let skipped = 0;
for (const { json: { project, tasks } } of $input.all()) {
  if (!project?.gid) continue;
  const overdue = [];
  for (const t of tasks) {
    if (!t.due_on || t.due_on >= today) continue;
    if ((t.tags || []).some(g => skip.includes(String(g.name).toLowerCase()))) { skipped++; continue; }
    const days = late(t.due_on);
    overdue.push({ name: t.name, due_on: t.due_on, days, bucket: cfg.buckets.find(b => days <= b.max)?.label || 'late',
      assignee: t.assignee?.name || '', url: t.permalink_url || '' });
  }
  if (!overdue.length) continue;
  overdue.sort((a, b) => b.days - a.days);
  const email = project.owner?.email || cfg.fallback_email;
  const o = (owners[email] ||= { email, name: project.owner?.name || '', fallback: !project.owner?.email, projects: [] });
  o.projects.push({ name: project.name, overdue, unassigned: overdue.filter(t => !t.assignee).length });
}
return [{ json: { owners: Object.values(owners), skipped } }];`),
    ifTrue('Anything overdue?', '$json.owners.length > 0'),
    stop('STOP: nothing overdue'),
    code('Write one email per owner', `
// Per owner: each project, grouped by bucket, capped at MAX_TASKS_PER_PROJECT.
const cfg = $('config').first().json;
return $input.first().json.owners.map(o => {
  const total = o.projects.reduce((n, p) => n + p.overdue.length, 0);
  const lines = ['Hi ' + (o.name.split(' ')[0] || 'there') + ',', '', total + ' overdue task' + (total === 1 ? '' : 's') + ' across ' + o.projects.length + ' project' + (o.projects.length === 1 ? '' : 's') + ':'];
  if (o.fallback) lines.push('(These projects have no owner email on Asana, so this went to the fallback address.)');
  for (const p of o.projects) {
    lines.push('', p.name + ' (' + p.overdue.length + ' overdue' + (p.unassigned ? ', ' + p.unassigned + ' unassigned' : '') + ')');
    const shown = p.overdue.slice(0, cfg.max_tasks_per_project);
    for (const b of cfg.buckets.map(b => b.label)) {
      const inB = shown.filter(t => t.bucket === b);
      if (!inB.length) continue;
      lines.push('  ' + b + ':');
      for (const t of inB) lines.push('  - ' + t.name + ' (due ' + t.due_on + ', ' + (t.assignee || 'UNASSIGNED') + ') ' + t.url);
    }
    if (p.overdue.length > shown.length) lines.push('  ...and ' + (p.overdue.length - shown.length) + ' more');
  }
  lines.push('', 'Move the date, reassign or close what is no longer needed.');
  return { json: { owner: o.email, total, subject: total + ' overdue Asana task' + (total === 1 ? '' : 's') + ' in your projects', body: lines.join('\\n'),
    send_to: cfg.mode === 'test' ? cfg.test_email : o.email } };
});`),
    ifTrue('Sending switched on?', cfg('sends_enabled')),
    stop('STOP: preview - nothing sent'),
    gmail.send('Email the owner', { to: '$json.send_to', subject: "($('config').first().json.mode === 'test' ? '[TEST to ' + $json.owner + '] ' : '') + $json.subject", message: '$json.body' }),
  ],
  edges: [
    ['Run manually', 'config'], ['Every Monday at 08:00', 'config'],
    ['config', 'List projects'], ['List projects', 'Asana off?'],
    ['Asana off?', 0, 'Load sample projects'], ['Asana off?', 1, 'Fetch project details'],
    ['Fetch project details', 'Fetch incomplete tasks'], ['Fetch incomplete tasks', 'Read projects and tasks'],
    ['Load sample projects', 'Combine project sources'], ['Read projects and tasks', 0, 'Combine project sources', 1],
    ['Combine project sources', 'Find overdue tasks'],
    ['Find overdue tasks', 'Anything overdue?'],
    ['Anything overdue?', 0, 'Write one email per owner'], ['Anything overdue?', 1, 'STOP: nothing overdue'],
    ['Write one email per owner', 'Sending switched on?'],
    ['Sending switched on?', 0, 'Email the owner'], ['Sending switched on?', 1, 'STOP: preview - nothing sent'],
  ],
  groups: [
    { title: 'Start and settings', why: 'Runs every Monday at 08:00. Projects, buckets and skip tags live in `config`; `List projects` makes one item per project gid so details and tasks stay paired.', nodes: ['Run manually', 'Every Monday at 08:00', 'config', 'List projects'] },
    { title: 'Read projects and tasks', why: 'The owner comes from the project, the tasks from a second call that asks only for incomplete ones. `Load sample projects` returns the same project-plus-tasks shape, including an unowned project and a task on hold.', nodes: ['Asana off?', 'Load sample projects', 'Fetch project details', 'Fetch incomplete tasks', 'Read projects and tasks', 'Combine project sources'] },
    { title: 'Find what is overdue', why: 'Tasks are grouped by owner email before any email is written, so someone who owns four projects gets one message. Tasks with no due date or a parked tag never count.', nodes: ['Find overdue tasks', 'Anything overdue?', 'STOP: nothing overdue'] },
    { title: 'Write and send', why: 'Nothing is emailed while `TEST_RUN` is true and `TEST_EMAIL` is blank. In test mode every owner email comes to you with the real owner in the subject.', nodes: ['Write one email per owner', 'Sending switched on?', 'STOP: preview - nothing sent', 'Email the owner'] },
  ],
  scenarios: [
    {
      name: 'shipped config (sample projects, preview)', start: 'Run manually',
      expect: { reached: ['Load sample projects', 'Write one email per owner', 'STOP: preview - nothing sent'], notReached: ['Fetch project details'], outward: 'none' },
      check: out => {
        const r = out['Find overdue tasks'][0];
        const f: string[] = [];
        const maya = r.owners.find((o: any) => o.email === 'maya@northwind.example');
        if (maya?.projects.length !== 2) f.push('Maya owns two projects with overdue work');
        const site = maya?.projects.find((p: any) => p.name === 'Website relaunch');
        if (site?.overdue.map((t: any) => t.days).join() !== '45,12,3') f.push(`relaunch should list 45, 12, 3 days late, got ${site?.overdue.map((t: any) => t.days)}`);
        if (site?.unassigned !== 1) f.push('accessibility audit is unassigned');
        if (r.skipped !== 1) f.push('the on-hold task should be skipped');
        if (r.owners.some((o: any) => o.email === 'tom@northwind.example')) f.push('Tom has nothing overdue (due today and in 5 days)');
        if (!r.owners.find((o: any) => o.email === 'ops@northwind.example')?.fallback) f.push('unowned project goes to FALLBACK_EMAIL');
        const mail = out['Write one email per owner'].find((m: any) => m.owner === 'maya@northwind.example');
        if (!mail?.body.includes('over 30 days late:') || mail?.total !== 4) f.push('Maya should get 4 tasks with an over-30 bucket');
        return f;
      },
    },
    {
      name: 'live with Asana', start: 'Every Monday at 08:00',
      overrides: { USE_ASANA: true, TEST_RUN: false, PROJECT_GIDS: ['1209'] },
      mocks: {
        'Fetch project details': [{ data: { gid: '1209', name: 'Client onboarding', owner: { gid: '55', name: 'Sara Holm', email: 'sara@northwind.example' } } }],
        'Fetch incomplete tasks': [{ data: [
          { gid: '1', name: 'Kickoff deck', due_on: due(2), assignee: { name: 'Leo' }, tags: [] },
          { gid: '2', name: 'Contract countersign', due_on: due(40), assignee: null, tags: [{ name: 'Someday' }] },
        ] }],
        'Email the owner': [{ id: 'msg_1', labelIds: ['SENT'] }],
      },
      expect: { reached: ['Read projects and tasks', 'Email the owner'], notReached: ['Load sample projects'], outward: 'some' },
      check: out => {
        const m = out['Write one email per owner'][0];
        const f: string[] = [];
        if (m?.send_to !== 'sara@northwind.example' || m?.total !== 1) f.push('Sara gets one task; the Someday task is skipped');
        return f;
      },
    },
  ],
});
