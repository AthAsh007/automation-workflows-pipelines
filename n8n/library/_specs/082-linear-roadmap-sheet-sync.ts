import { defineSpec } from '../_kit/spec';
import { trigger, code, ifTrue, ifWhen, merge, stop, http, sheets } from '../_kit/n';

const cfg = (k: string) => `$('config').first().json.${k}`;

export default defineSpec({
  slug: 'linear-roadmap-sheet-sync',
  title: 'Sync Linear issues to a Google Sheets roadmap',
  summary: 'Pulls roadmap-labelled Linear issues for one team each weekday, maps state, priority, estimate and cycle into sheet columns, upserts changed rows by issue id and marks rows whose issue left Linear as removed.',
  category: 'Project management',
  description: {
    who: 'Product and engineering leads who share a roadmap with sales or leadership in Google Sheets while the real work lives in Linear. It keeps the sheet current without anyone copying issues across on Friday afternoon.',
    how: [
      'Every weekday at 06:30 it queries Linear for one team, filtered to the labels in `ROADMAP_LABELS`, or loads 6 sample issues until Linear is connected.',
      'Each issue becomes one roadmap row: state, priority label, estimate, cycle number with its dates, assignee, project and due date.',
      'The rows already on the Roadmap tab are compared by issue id. New issues are added, rows with a changed field are updated, unchanged rows are left alone.',
      'Rows whose issue was cancelled or no longer matches the filter are marked removed with a date instead of being deleted, so nobody loses a line they were tracking.',
    ],
    setup: [
      'Run it once as imported. It plans changes against sample issues and stops at `STOP: dry run - roadmap untouched`.',
      'Add a Linear credential to `Query Linear issues`, set `LINEAR_TEAM` and set `USE_LINEAR = true`.',
      'Create a Roadmap tab with an `Issue ID` column, connect Google Sheets and paste the spreadsheet id into `ROADMAP_SHEET_ID`.',
      'Check the plan in `Plan roadmap changes`, then set `DRY_RUN = false` to write the tab.',
    ],
    requirements: ['A Linear workspace and API access', 'A Google Sheet with a Roadmap tab'],
    customize: [
      '`ROADMAP_LABELS` picks which issues belong on the roadmap. An empty list syncs the whole team.',
      '`COMPARE_FIELDS` decides which columns count as a change worth rewriting.',
      'Set `CANCELED_AS_REMOVED = false` to keep cancelled issues on the sheet with their state.',
    ],
  },
  config: {
    intro: ['USE_LINEAR false -> SAMPLE issues. ROADMAP_SHEET_ID blank -> SAMPLE roadmap rows.', 'DRY_RUN true -> the plan is computed and shown, the sheet is not written.'],
    consts: [
      { name: 'USE_LINEAR', value: false, note: 'set true after adding the Linear credential to Query Linear issues' },
      { name: 'LINEAR_TEAM', value: 'ENG', note: 'team key as shown in issue identifiers (ENG-123 -> ENG)' },
      { name: 'ROADMAP_LABELS', value: ['roadmap'], note: 'only issues with one of these labels are synced; [] syncs every issue in the team' },
      { name: 'ROADMAP_SHEET_ID', value: '', note: 'Google Sheets id holding the Roadmap tab; blank uses sample rows' },
      { name: 'COMPARE_FIELDS', value: ['Title', 'State', 'Priority', 'Estimate', 'Cycle', 'Assignee', 'Project', 'Due'], note: 'a row is rewritten only when one of these columns changed' },
      { name: 'CANCELED_AS_REMOVED', value: true, note: 'cancelled and duplicate issues are marked removed on the sheet' },
    ],
    flags: { sheets_enabled: "ROADMAP_SHEET_ID.trim() !== ''" },
    safety: 'dry_run',
  },
  nodes: [
    trigger.manual(),
    trigger.schedule('Every weekday at 06:30', '30 6 * * 1-5'),
    ifTrue('Linear connected?', cfg('use_linear')),
    code('Build the Linear query', `
// One GraphQL request: the team filter always applies, the label filter only when
// ROADMAP_LABELS has entries. 100 issues per run is the API page limit.
const cfg = $('config').first().json;
const filter = { team: { key: { eq: cfg.linear_team } } };
if (cfg.roadmap_labels.length) filter.labels = { some: { name: { in: cfg.roadmap_labels } } };
const query = [
  'query Roadmap($filter: IssueFilter) {',
  '  issues(first: 100, filter: $filter, orderBy: updatedAt) {',
  '    nodes { id identifier title url priority priorityLabel estimate dueDate updatedAt',
  '      state { name type } assignee { name } project { name }',
  '      cycle { number startsAt endsAt } }',
  '    pageInfo { hasNextPage }',
  '  }',
  '}',
].join('\\n');
return [{ json: { body: { query, variables: { filter } } } }];`),
    http('Query Linear issues', { method: 'POST', url: 'https://api.linear.app/graphql', auth: 'linearApi', outward: false, jsonBody: 'JSON.stringify($json.body)' }),
    code('Load sample Linear issues', `
// Used until USE_LINEAR is true. Same shape as the GraphQL response so the mapper runs on both.
const day = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const cycle = { number: 14, startsAt: day(-4) + 'T00:00:00.000Z', endsAt: day(10) + 'T00:00:00.000Z' };
const issue = (id, key, title, state, type, priority, estimate, who, project, due, c) => ({
  id, identifier: key, title, url: 'https://linear.app/acme-example/issue/' + key, priority, estimate,
  dueDate: due, updatedAt: new Date().toISOString(), state: { name: state, type },
  assignee: who ? { name: who } : null, project: project ? { name: project } : null, cycle: c,
});
return [{ json: { data: { issues: { pageInfo: { hasNextPage: false }, nodes: [
  issue('lin-1', 'ENG-201', 'SSO login for workspace admins', 'In Progress', 'started', 1, 5, 'Priya Natarajan', 'Enterprise auth', day(9), cycle),
  issue('lin-2', 'ENG-207', 'Usage-based billing export', 'Done', 'completed', 2, 3, 'Marco Lindqvist', 'Billing v2', day(-2), cycle),
  issue('lin-3', 'ENG-215', 'Audit log retention settings', 'Todo', 'unstarted', 3, 2, 'Priya Natarajan', 'Enterprise auth', null, cycle),
  issue('lin-4', 'ENG-220', 'Bulk invite from CSV', 'Backlog', 'backlog', 4, null, null, 'Onboarding', null, null),
  issue('lin-5', 'ENG-224', 'Public status page', 'Todo', 'unstarted', 0, 8, 'Dana Okafor', null, day(30), null),
  issue('lin-6', 'ENG-190', 'Legacy CSV importer rewrite', 'Canceled', 'canceled', 3, 5, 'Marco Lindqvist', 'Onboarding', null, null),
] } } } }];`),
    merge('Combine issue sources'),
    code('Map issues to roadmap rows', `
// GraphQL nodes -> one sheet row per issue, with the column names the Roadmap tab uses.
// Linear priority is 0-4; priorityLabel is used when the API sends it.
const cfg = $('config').first().json;
const PRIORITY = { 0: 'No priority', 1: 'Urgent', 2: 'High', 3: 'Normal', 4: 'Low' };
const rows = [];
let truncated = false;
for (const { json } of $input.all()) {
  const issues = json.data?.issues;
  if (!issues) continue;
  if (issues.pageInfo?.hasNextPage) truncated = true;
  for (const i of issues.nodes || []) {
    const cyc = i.cycle ? 'Cycle ' + i.cycle.number + ' (' + String(i.cycle.startsAt).slice(0, 10) + ' to ' + String(i.cycle.endsAt).slice(0, 10) + ')' : '';
    const dropped = cfg.canceled_as_removed && ['canceled', 'duplicate'].includes(i.state?.type);
    rows.push({
      'Issue ID': i.id, Key: i.identifier, Title: i.title, State: i.state?.name || '',
      Priority: i.priorityLabel || PRIORITY[i.priority] || 'No priority',
      Estimate: i.estimate ?? '', Cycle: cyc, Assignee: i.assignee?.name || 'Unassigned',
      Project: i.project?.name || '', Due: i.dueDate || '', URL: i.url, _dropped: dropped,
    });
  }
}
return [{ json: { rows, truncated } }];`),
    ifTrue('Roadmap sheet set?', cfg('sheets_enabled')),
    sheets.read('Read current roadmap rows', cfg('roadmap_sheet_id'), 'Roadmap'),
    code('Load sample roadmap rows', `
// Used until ROADMAP_SHEET_ID is set. What last week's sync left on the tab.
const cycle = 'Cycle 13 (old)';
return [
  { 'Issue ID': 'lin-1', Key: 'ENG-201', Title: 'SSO login for workspace admins', State: 'In Progress', Priority: 'Urgent', Estimate: 5, Cycle: '', Assignee: 'Priya Natarajan', Project: 'Enterprise auth', Due: '', 'Sync status': 'active' },
  { 'Issue ID': 'lin-2', Key: 'ENG-207', Title: 'Usage-based billing export', State: 'In Progress', Priority: 'High', Estimate: 3, Cycle: cycle, Assignee: 'Marco Lindqvist', Project: 'Billing v2', Due: '', 'Sync status': 'active' },
  { 'Issue ID': 'lin-4', Key: 'ENG-220', Title: 'Bulk invite from CSV', State: 'Backlog', Priority: 'Low', Estimate: '', Cycle: '', Assignee: 'Unassigned', Project: 'Onboarding', Due: '', 'Sync status': 'active' },
  { 'Issue ID': 'lin-6', Key: 'ENG-190', Title: 'Legacy CSV importer rewrite', State: 'Todo', Priority: 'Normal', Estimate: 5, Cycle: '', Assignee: 'Marco Lindqvist', Project: 'Onboarding', Due: '', 'Sync status': 'active' },
  { 'Issue ID': 'lin-9', Key: 'ENG-150', Title: 'Moved to the Platform team', State: 'Todo', Priority: 'Normal', Estimate: 2, Cycle: '', Assignee: 'Dana Okafor', Project: '', Due: '', 'Sync status': 'active' },
  { 'Issue ID': 'lin-8', Key: 'ENG-120', Title: 'Old pricing page', State: 'Canceled', Priority: 'Low', Estimate: '', Cycle: '', Assignee: 'Unassigned', Project: '', Due: '', 'Sync status': 'removed', 'Removed on': '2026-01-05' },
].map(json => ({ json }));`),
    merge('Combine roadmap sources'),
    code('Plan roadmap changes', `
// Diff by Issue ID. Only rows that need writing leave this node, each tagged in
// 'Sync status' so the sheet shows why it changed. Rows are never deleted.
const cfg = $('config').first().json;
const { rows } = $('Map issues to roadmap rows').first().json;
const today = new Date().toISOString().slice(0, 10);
const sheet = new Map();
for (const { json } of $input.all()) if (json['Issue ID']) sheet.set(String(json['Issue ID']), json);
const seen = new Set();
const out = [];
for (const r of rows) {
  const { _dropped, ...row } = r;
  seen.add(row['Issue ID']);
  const old = sheet.get(row['Issue ID']);
  if (_dropped) {
    if (old && old['Sync status'] !== 'removed') out.push({ 'Issue ID': row['Issue ID'], State: row.State, 'Sync status': 'removed', 'Removed on': today, 'Last synced': today, _change: 'removed: ' + row.State.toLowerCase() });
    continue;
  }
  if (!old) { out.push({ ...row, 'Sync status': 'active', 'Removed on': '', 'Last synced': today, _change: 'new' }); continue; }
  const changed = cfg.compare_fields.filter(f => String(old[f] ?? '') !== String(row[f] ?? ''));
  if (changed.length || old['Sync status'] === 'removed') out.push({ ...row, 'Sync status': 'active', 'Removed on': '', 'Last synced': today, _change: 'updated: ' + (changed.join(', ') || 'back on roadmap') });
}
for (const [id, old] of sheet) {
  if (seen.has(id) || old['Sync status'] === 'removed') continue;
  out.push({ 'Issue ID': id, 'Sync status': 'removed', 'Removed on': today, 'Last synced': today, _change: 'removed: no longer matches the filter' });
}
// _change explains the decision in the run log; strip it before the sheet sees the row.
return out.map(({ _change, ...json }) => ({ json: { ...json, Change: _change } }));`),
    ifWhen('Write to the roadmap?', [[cfg('live'), 'true'], [cfg('sheets_enabled'), 'true']]),
    stop('STOP: dry run - roadmap untouched'),
    sheets.upsert('Upsert roadmap rows', cfg('roadmap_sheet_id'), 'Roadmap', 'Issue ID'),
    code('Summarise the sync', `
// One line per change plus totals, readable in the execution log.
const cfg = $('config').first().json;
const plan = $input.all().map(i => i.json);
const mapped = $('Map issues to roadmap rows').first().json;
const count = p => plan.filter(r => r.Change.startsWith(p)).length;
const lines = plan.map(r => '- ' + (r.Key || r['Issue ID']) + ': ' + r.Change);
const text = [
  'Roadmap sync (' + cfg.mode + '): ' + mapped.rows.length + ' Linear issues read.',
  count('new') + ' new, ' + count('updated') + ' updated, ' + count('removed') + ' marked removed.',
  mapped.truncated ? 'Linear returned more than 100 issues; narrow ROADMAP_LABELS or the oldest are missing.' : '',
  ...lines,
].filter(Boolean).join('\\n');
return [{ json: { text, new: count('new'), updated: count('updated'), removed: count('removed') } }];`),
  ],
  edges: [
    ['Run manually', 'config'], ['Every weekday at 06:30', 'config'],
    ['config', 'Linear connected?'],
    ['Linear connected?', 0, 'Build the Linear query'], ['Linear connected?', 1, 'Load sample Linear issues'],
    ['Build the Linear query', 'Query Linear issues'],
    ['Query Linear issues', 'Combine issue sources'], ['Load sample Linear issues', 0, 'Combine issue sources', 1],
    ['Combine issue sources', 'Map issues to roadmap rows'],
    ['Map issues to roadmap rows', 'Roadmap sheet set?'],
    ['Roadmap sheet set?', 0, 'Read current roadmap rows'], ['Roadmap sheet set?', 1, 'Load sample roadmap rows'],
    ['Read current roadmap rows', 'Combine roadmap sources'], ['Load sample roadmap rows', 0, 'Combine roadmap sources', 1],
    ['Combine roadmap sources', 'Plan roadmap changes'],
    ['Plan roadmap changes', 'Write to the roadmap?'],
    ['Plan roadmap changes', 'Summarise the sync'],
    ['Write to the roadmap?', 0, 'Upsert roadmap rows'], ['Write to the roadmap?', 1, 'STOP: dry run - roadmap untouched'],
  ],
  groups: [
    { title: 'Start and settings', why: 'Runs every weekday at 06:30 or by hand. Team key, labels and the columns that count as a change all live in `config`, so the sync can be pointed at another team by editing one node.', nodes: ['Run manually', 'Every weekday at 06:30', 'config'] },
    { title: 'Read Linear issues', why: '`Build the Linear query` adds the label filter only when labels are set. Until `USE_LINEAR` is true, `Load sample Linear issues` returns the same GraphQL shape, so `Map issues to roadmap rows` is tested on every run.', nodes: ['Linear connected?', 'Build the Linear query', 'Query Linear issues', 'Load sample Linear issues', 'Combine issue sources', 'Map issues to roadmap rows'] },
    { title: 'Read the roadmap tab', why: 'The current tab is read before anything is written, because the diff needs it. A blank `ROADMAP_SHEET_ID` routes to `Load sample roadmap rows`, a tab that is one week out of date.', nodes: ['Roadmap sheet set?', 'Read current roadmap rows', 'Load sample roadmap rows', 'Combine roadmap sources'] },
    { title: 'Plan, write and summarise', why: 'Only new, changed and removed rows leave `Plan roadmap changes`, so an idle week writes nothing. Rows are marked removed rather than deleted. `Write to the roadmap?` needs a live run and a sheet id.', nodes: ['Plan roadmap changes', 'Write to the roadmap?', 'STOP: dry run - roadmap untouched', 'Upsert roadmap rows', 'Summarise the sync'] },
  ],
  scenarios: [
    {
      name: 'shipped config (dry run)', start: 'Run manually',
      expect: { reached: ['Load sample Linear issues', 'Load sample roadmap rows', 'STOP: dry run - roadmap untouched', 'Summarise the sync'], outward: 'none' },
      check: out => {
        const plan = out['Plan roadmap changes'];
        const by = (id: string) => plan.find((r: any) => r['Issue ID'] === id)?.Change;
        const f: string[] = [];
        const want: Record<string, string> = {
          'lin-1': 'updated: Cycle, Due', 'lin-2': 'updated: State, Cycle, Due', 'lin-3': 'new', 'lin-5': 'new',
          'lin-6': 'removed: canceled', 'lin-9': 'removed: no longer matches the filter',
        };
        for (const [id, ch] of Object.entries(want)) if (by(id) !== ch) f.push(`${id} should be "${ch}", got "${by(id)}"`);
        if (by('lin-4')) f.push('unchanged lin-4 must not be written');
        if (by('lin-8')) f.push('already removed lin-8 must not be written again');
        if (plan.find((r: any) => r['Issue ID'] === 'lin-5')?.Priority !== 'No priority') f.push('priority 0 should map to No priority');
        const s = out['Summarise the sync'][0];
        if (s.new !== 2 || s.updated !== 2 || s.removed !== 2) f.push(`summary counts wrong: ${s.new}/${s.updated}/${s.removed}`);
        return f;
      },
    },
    {
      name: 'live sync with Linear and the sheet', start: 'Every weekday at 06:30',
      overrides: { USE_LINEAR: true, ROADMAP_SHEET_ID: '1RoadmapSheetIdExample', DRY_RUN: false, ROADMAP_LABELS: [] },
      mocks: {
        'Query Linear issues': [{ data: { issues: { pageInfo: { hasNextPage: true }, nodes: [
          { id: 'abc-1', identifier: 'ENG-301', title: 'Dark mode', url: 'https://linear.app/x/issue/ENG-301', priority: 2, priorityLabel: 'High', estimate: 3, dueDate: null, updatedAt: '2026-10-01T00:00:00Z', state: { name: 'In Review', type: 'started' }, assignee: { name: 'Lee Chen' }, project: null, cycle: { number: 15, startsAt: '2026-10-12T00:00:00Z', endsAt: '2026-10-26T00:00:00Z' } },
        ] } } }],
        'Read current roadmap rows': [{ row_number: 2, 'Issue ID': 'abc-1', Key: 'ENG-301', Title: 'Dark mode', State: 'Todo', Priority: 'High', Estimate: 3, Cycle: 'Cycle 15 (2026-10-12 to 2026-10-26)', Assignee: 'Lee Chen', Project: '', Due: '', 'Sync status': 'active' }],
        'Upsert roadmap rows': (items: any[]) => items,
      },
      expect: { reached: ['Query Linear issues', 'Upsert roadmap rows'], notReached: ['Load sample Linear issues', 'STOP: dry run - roadmap untouched'], outward: 'some' },
      check: out => {
        const f: string[] = [];
        const q = out['Build the Linear query'][0].body.variables.filter;
        if (q.labels) f.push('empty ROADMAP_LABELS must not add a label filter');
        if (out['Plan roadmap changes'][0]?.Change !== 'updated: State') f.push('only State changed on ENG-301');
        if (!out['Summarise the sync'][0].text.includes('more than 100')) f.push('truncation warning missing');
        return f;
      },
    },
  ],
});
