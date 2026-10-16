import { defineSpec } from '../_kit/spec';
import { trigger, code, ifTrue, ifWhen, merge, stop, http } from '../_kit/n';

const cfg = (k: string) => `$('config').first().json.${k}`;

export default defineSpec({
  slug: 'sentry-errors-to-jira',
  title: 'Open Jira issues from repeated Sentry errors',
  summary: 'Every hour it reads unresolved Sentry issues, keeps those over an event and affected-user threshold, checks Jira for an issue already labelled with the Sentry id, and opens a Jira bug with a mapped priority for the rest.',
  category: 'DevOps and engineering',
  description: {
    who: 'Product engineering teams of 3 to 40 who use Sentry for errors and Jira for planned work, and find that real bugs stay in Sentry because nobody files them. Only errors that hit enough people become tickets, and each only once.',
    how: [
      'Every hour it lists unresolved issues from each project in `SENTRY_PROJECTS` for the last 24 hours, sorted by frequency, or sample issues until Sentry is connected.',
      'An issue qualifies with at least `MIN_EVENTS` events and `MIN_USERS` affected users, or with any users at `fatal` level. Ignored and muted issues are skipped.',
      'One Jira search looks for issues labelled `sentry-<id>` for every candidate. Linked ones are skipped; a linked issue already marked Done is reported as a regression instead.',
      'The rest become Jira bugs with the error, culprit, counts and a Sentry link, a priority from `PRIORITY_RULES`, and the `sentry-<id>` label that prevents duplicates.',
    ],
    setup: [
      'Run it once as imported. It checks sample errors and stops at `STOP: dry run - Jira untouched`.',
      'Add a Header Auth credential to `Fetch unresolved Sentry issues` (name `Authorization`, value `Bearer` plus an internal integration token), set `SENTRY_ORG`, `SENTRY_PROJECTS` and `USE_SENTRY = true`.',
      'Add a Jira Software Cloud credential to `Search Jira for linked issues` and `Create the Jira issue`, and set `JIRA_SITE` and `JIRA_PROJECT`.',
      'Check the plan in `Decide what to open`, then set `DRY_RUN = false`.',
    ],
    requirements: ['A Sentry organisation with an internal integration token', 'A Jira Cloud project with a Bug issue type'],
    customize: [
      '`MIN_EVENTS` and `MIN_USERS` set how loud an error must be before it becomes a ticket.',
      '`PRIORITY_RULES` maps affected users and level to Jira priority names.',
      '`MAX_PER_RUN` caps how many issues one run can open.',
    ],
  },
  config: {
    intro: ['USE_SENTRY false -> SAMPLE errors. JIRA_SITE blank -> nothing is treated as linked and nothing is created.', 'DRY_RUN true -> the plan is shown, Jira is not changed.'],
    consts: [
      { name: 'USE_SENTRY', value: false, note: 'set true after adding the Header Auth credential to the Sentry node' },
      { name: 'SENTRY_ORG', value: 'northwind', note: 'organisation slug from your Sentry URL' },
      { name: 'SENTRY_PROJECTS', value: ['web-app', 'api'], note: 'project slugs to watch' },
      { name: 'MIN_EVENTS', value: 50, note: 'events in the last 24 hours before an error qualifies...' },
      { name: 'MIN_USERS', value: 5, note: '...and affected users; fatal errors need only one user' },
      { name: 'PRIORITY_RULES', value: [
        { min_users: 100, priority: 'Highest' }, { min_users: 25, priority: 'High' }, { min_users: 0, priority: 'Medium' },
      ], note: 'first rule whose min_users is met sets the priority; fatal level is raised one step' },
      { name: 'JIRA_SITE', value: '', note: 'your Jira host, e.g. yourcompany.atlassian.net; blank skips Jira' },
      { name: 'JIRA_PROJECT', value: 'BUG', note: 'project the issues are created in' },
      { name: 'MAX_PER_RUN', value: 5, note: 'hard ceiling on Jira issues per run' },
    ],
    flags: { jira_enabled: "JIRA_SITE.trim() !== ''" },
    safety: 'dry_run',
  },
  nodes: [
    trigger.manual(),
    trigger.schedule('Every hour', '20 * * * *'),
    code('List Sentry projects', `
// One item per project for the issues call.
return $('config').first().json.sentry_projects.map(project => ({ json: { project } }));`),
    ifTrue('Sentry connected?', cfg('use_sentry')),
    http('Fetch unresolved Sentry issues', {
      url: `={{ 'https://sentry.io/api/0/projects/' + ${cfg('sentry_org')} + '/' + $json.project + '/issues/' }}`,
      auth: 'header', query: { query: 'is:unresolved', statsPeriod: '24h', sort: 'freq', limit: '50' },
    }),
    code('Load sample Sentry issues', `
// Used until USE_SENTRY is true. Sentry issue objects as the API returns them.
const ago = h => new Date(Date.now() - h * 36e5).toISOString();
const iss = (id, project, title, culprit, count, users, level = 'error', extra = {}) => ({ id, shortId: project.toUpperCase() + '-' + id.slice(-3), title, culprit,
  permalink: 'https://northwind.sentry.example/issues/' + id + '/', count: String(count), userCount: users, level, status: 'unresolved',
  firstSeen: ago(30), lastSeen: ago(0.2), project: { slug: project }, isUnhandled: true, metadata: { type: title.split(':')[0] }, ...extra });
return [
  iss('4410101', 'web-app', "TypeError: Cannot read properties of undefined (reading 'total')", 'CheckoutSummary in src/checkout/Summary.tsx', 1840, 212),
  iss('4410102', 'api', 'IntegrityError: duplicate key value violates unique constraint "orders_ref_key"', 'orders.create', 96, 31),
  iss('4410103', 'api', 'TimeoutError: upstream payment provider', 'payments.capture', 410, 3),
  iss('4410104', 'web-app', 'ChunkLoadError: Loading chunk 7 failed', 'app.bootstrap', 75, 40, 'error', { status: 'ignored' }),
  iss('4410105', 'api', 'OutOfMemoryError in invoice renderer', 'pdf.render', 4, 1, 'fatal'),
  iss('4410106', 'web-app', 'RangeError: Invalid time value', 'formatDate in src/utils/date.ts', 120, 18),
  iss('4410107', 'api', 'KeyError: customer_id', 'webhooks.stripe', 12, 2),
].map(json => ({ json }));`),
    merge('Combine Sentry sources'),
    code('Pick errors over the threshold', `
// Loud enough = MIN_EVENTS and MIN_USERS, or fatal with any user. Builds one Jira
// search for all candidates at once, using the sentry-<id> label as the link.
const cfg = $('config').first().json;
const cand = [], quiet = [];
for (const { json: i } of $input.all()) {
  if (!i.id) continue;
  const events = Number(i.count || 0), users = Number(i.userCount || 0);
  if (i.status && i.status !== 'unresolved') { quiet.push({ id: i.id, title: i.title, reason: 'status ' + i.status }); continue; }
  const loud = (events >= cfg.min_events && users >= cfg.min_users) || (i.level === 'fatal' && users >= 1);
  if (!loud) { quiet.push({ id: i.id, title: i.title, reason: events + ' events, ' + users + ' users: under threshold' }); continue; }
  cand.push({ id: i.id, short_id: i.shortId, title: i.title, culprit: i.culprit || '', url: i.permalink, events, users, level: i.level,
    project: i.project?.slug || '', first_seen: i.firstSeen, last_seen: i.lastSeen, label: 'sentry-' + i.id });
}
cand.sort((a, b) => b.users - a.users || b.events - a.events);
const jql = cand.length ? 'labels in (' + cand.map(c => '"' + c.label + '"').join(', ') + ')' : '';
return [{ json: { candidates: cand, quiet, search: { jql, fields: ['labels', 'status', 'summary'], maxResults: 100 } } }];`),
    ifTrue('Any candidates?', '$json.candidates.length > 0'),
    stop('STOP: no error over the threshold'),
    ifTrue('Jira connected?', cfg('jira_enabled')),
    http('Search Jira for linked issues', {
      method: 'POST', outward: false, auth: 'jiraSoftwareCloudApi',
      url: `={{ 'https://' + ${cfg('jira_site')} + '/rest/api/3/search/jql' }}`, jsonBody: 'JSON.stringify($json.search)',
    }),
    code('Assume nothing is linked', `
// Without Jira there is nothing to search, so every candidate counts as unlinked.
return [{ json: { issues: [] } }];`),
    merge('Combine linked issues'),
    code('Decide what to open', `
// Linked and open -> skip. Linked and Done -> report as a regression, do not duplicate.
// Unlinked -> open, up to MAX_PER_RUN, with a priority from PRIORITY_RULES.
const cfg = $('config').first().json;
const { candidates, quiet } = $('Pick errors over the threshold').first().json;
const linked = {};
for (const { json: page } of $input.all()) for (const iss of page.issues || []) for (const l of iss.fields?.labels || []) if (l.startsWith('sentry-')) linked[l] = iss;
const steps = cfg.priority_rules.map(r => r.priority);
const open = [], held = [];
for (const c of candidates) {
  const j = linked[c.label];
  if (j) {
    const done = /done|closed|resolved/i.test(j.fields?.status?.name || '');
    held.push({ id: c.id, title: c.title, reason: done ? 'linked ' + j.key + ' is ' + j.fields.status.name + ' but the error is still happening (regression)' : 'already linked to ' + j.key });
    continue;
  }
  const rule = cfg.priority_rules.find(r => c.users >= r.min_users) || cfg.priority_rules[cfg.priority_rules.length - 1];
  const idx = steps.indexOf(rule.priority);
  const priority = c.level === 'fatal' && idx > 0 ? steps[idx - 1] : rule.priority;
  open.push({ ...c, priority });
}
for (const c of open.slice(cfg.max_per_run)) held.push({ id: c.id, title: c.title, reason: 'over MAX_PER_RUN, next run' });
return [{ json: { open: open.slice(0, cfg.max_per_run), held, quiet } }];`),
    code('Shape Jira issues', `
// One Jira Bug per error, description in Atlassian Document Format.
const cfg = $('config').first().json;
const p = t => ({ type: 'paragraph', content: [{ type: 'text', text: t }] });
return $input.first().json.open.map(c => ({ json: { sentry_id: c.id, title: c.title, priority: c.priority, body: { fields: {
  project: { key: cfg.jira_project }, issuetype: { name: 'Bug' }, priority: { name: c.priority },
  summary: ('[' + c.project + '] ' + c.title).slice(0, 250), labels: ['sentry', c.label],
  description: { type: 'doc', version: 1, content: [
    p(c.events + ' events affecting ' + c.users + ' users in the last 24 hours (level: ' + c.level + ').'),
    p('Where: ' + (c.culprit || 'unknown')),
    p('First seen ' + c.first_seen.slice(0, 16).replace('T', ' ') + ' UTC, last seen ' + c.last_seen.slice(0, 16).replace('T', ' ') + ' UTC.'),
    { type: 'paragraph', content: [{ type: 'text', text: 'Open ' + c.short_id + ' in Sentry', marks: [{ type: 'link', attrs: { href: c.url } }] }] },
  ] },
} } } }));`),
    ifWhen('Create in Jira?', [[cfg('live'), 'true'], [cfg('jira_enabled'), 'true']]),
    stop('STOP: dry run - Jira untouched'),
    http('Create the Jira issue', { method: 'POST', auth: 'jiraSoftwareCloudApi', url: `={{ 'https://' + ${cfg('jira_site')} + '/rest/api/3/issue' }}`, jsonBody: 'JSON.stringify($json.body)' }),
    code('Report what was opened', `
// Jira keys next to the Sentry ids, for the execution log.
const shaped = $('Shape Jira issues').all();
return [{ json: { opened: $input.all().map((it, i) => ({ jira: it.json.key, sentry: shaped[i]?.json.sentry_id, priority: shaped[i]?.json.priority })) } }];`),
  ],
  edges: [
    ['Run manually', 'config'], ['Every hour', 'config'],
    ['config', 'List Sentry projects'], ['List Sentry projects', 'Sentry connected?'],
    ['Sentry connected?', 0, 'Fetch unresolved Sentry issues'], ['Sentry connected?', 1, 'Load sample Sentry issues'],
    ['Fetch unresolved Sentry issues', 'Combine Sentry sources'], ['Load sample Sentry issues', 0, 'Combine Sentry sources', 1],
    ['Combine Sentry sources', 'Pick errors over the threshold'],
    ['Pick errors over the threshold', 'Any candidates?'],
    ['Any candidates?', 0, 'Jira connected?'], ['Any candidates?', 1, 'STOP: no error over the threshold'],
    ['Jira connected?', 0, 'Search Jira for linked issues'], ['Jira connected?', 1, 'Assume nothing is linked'],
    ['Search Jira for linked issues', 'Combine linked issues'], ['Assume nothing is linked', 0, 'Combine linked issues', 1],
    ['Combine linked issues', 'Decide what to open'],
    ['Decide what to open', 'Shape Jira issues'],
    ['Shape Jira issues', 'Create in Jira?'],
    ['Create in Jira?', 0, 'Create the Jira issue'], ['Create in Jira?', 1, 'STOP: dry run - Jira untouched'],
    ['Create the Jira issue', 'Report what was opened'],
  ],
  groups: [
    { title: 'Start and settings', why: 'Runs at 20 past every hour. Thresholds, the priority ladder and the Jira project live in `config`; `List Sentry projects` makes one item per project.', nodes: ['Run manually', 'Every hour', 'config', 'List Sentry projects'] },
    { title: 'Read unresolved errors', why: 'Sentry is asked for unresolved issues from the last 24 hours, sorted by frequency. `Load sample Sentry issues` returns the same objects, including an ignored issue and a fatal one with a single user.', nodes: ['Sentry connected?', 'Fetch unresolved Sentry issues', 'Load sample Sentry issues', 'Combine Sentry sources'] },
    { title: 'Filter and check Jira once', why: 'The threshold runs before any Jira call, and all candidates go into one JQL search on their `sentry-<id>` labels, so the duplicate check costs one request however many errors qualify.', nodes: ['Pick errors over the threshold', 'Any candidates?', 'STOP: no error over the threshold', 'Jira connected?', 'Search Jira for linked issues', 'Assume nothing is linked', 'Combine linked issues'] },
    { title: 'Open the Jira bugs', why: 'A linked ticket marked Done while the error continues is reported as a regression rather than duplicated. `Create in Jira?` needs a live run and a Jira site, and `MAX_PER_RUN` is enforced in code.', nodes: ['Decide what to open', 'Shape Jira issues', 'Create in Jira?', 'STOP: dry run - Jira untouched', 'Create the Jira issue', 'Report what was opened'] },
  ],
  scenarios: [
    {
      name: 'shipped config (sample errors, dry run)', start: 'Run manually',
      expect: { reached: ['Load sample Sentry issues', 'Assume nothing is linked', 'STOP: dry run - Jira untouched'], notReached: ['Search Jira for linked issues'], outward: 'none' },
      check: out => {
        const d = out['Decide what to open'][0];
        const f: string[] = [];
        const got = d.open.map((o: any) => o.id + ':' + o.priority).join(',');
        if (got !== '4410101:Highest,4410102:High,4410106:Medium,4410105:High') f.push(`expected 101 Highest, 102 High, 106 Medium, fatal 105 raised to High; got ${got}`);
        const quiet = out['Pick errors over the threshold'][0].quiet.map((q: any) => q.id).sort().join();
        if (quiet !== '4410103,4410104,4410107') f.push(`103 (3 users), 104 (ignored) and 107 (quiet) should be left, got ${quiet}`);
        const s = out['Pick errors over the threshold'][0].search.jql;
        if (!s.startsWith('labels in ("sentry-4410101"')) f.push(`JQL should list every candidate label: ${s}`);
        if (out['Shape Jira issues'][0].body.fields.labels.join() !== 'sentry,sentry-4410101') f.push('label link missing');
        return f;
      },
    },
    {
      name: 'live with Sentry and Jira, one already linked', start: 'Every hour',
      overrides: { USE_SENTRY: true, DRY_RUN: false, JIRA_SITE: 'northwind.atlassian.example', SENTRY_PROJECTS: ['api'] },
      mocks: {
        'Fetch unresolved Sentry issues': [
          { id: '9001', shortId: 'API-1A', title: 'ValueError: bad currency', culprit: 'billing.convert', permalink: 'https://sentry.example/issues/9001/', count: '300', userCount: 60, level: 'error', status: 'unresolved', firstSeen: new Date(Date.now() - 864e5).toISOString(), lastSeen: new Date().toISOString(), project: { slug: 'api' } },
          { id: '9002', shortId: 'API-1B', title: 'KeyError: plan', culprit: 'billing.plans', permalink: 'https://sentry.example/issues/9002/', count: '80', userCount: 9, level: 'error', status: 'unresolved', firstSeen: new Date(Date.now() - 864e5).toISOString(), lastSeen: new Date().toISOString(), project: { slug: 'api' } },
          { id: '9003', shortId: 'API-1C', title: 'ConnectionError: redis', culprit: 'cache.get', permalink: 'https://sentry.example/issues/9003/', count: '500', userCount: 120, level: 'error', status: 'unresolved', firstSeen: new Date(Date.now() - 864e5).toISOString(), lastSeen: new Date().toISOString(), project: { slug: 'api' } },
        ],
        'Search Jira for linked issues': [{ issues: [
          { key: 'BUG-77', fields: { labels: ['sentry', 'sentry-9002'], status: { name: 'In Progress' } } },
          { key: 'BUG-41', fields: { labels: ['sentry', 'sentry-9003'], status: { name: 'Done' } } },
        ] }],
        'Create the Jira issue': [{ id: '10500', key: 'BUG-90', self: 'https://northwind.atlassian.example/rest/api/3/issue/10500' }],
      },
      expect: { reached: ['Search Jira for linked issues', 'Create the Jira issue', 'Report what was opened'], notReached: ['Load sample Sentry issues', 'Assume nothing is linked'], outward: 'some' },
      check: out => {
        const d = out['Decide what to open'][0];
        const f: string[] = [];
        if (d.open.length !== 1 || d.open[0].id !== '9001' || d.open[0].priority !== 'High') f.push('only 9001 should open, at High (60 users)');
        if (!d.held.some((h: any) => h.reason.includes('regression') && h.id === '9003')) f.push('9003 is linked to a Done ticket: regression');
        if (out['Report what was opened'][0].opened[0]?.jira !== 'BUG-90') f.push('report should carry the Jira key');
        return f;
      },
    },
  ],
});
