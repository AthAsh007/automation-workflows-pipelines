import { defineSpec } from '../_kit/spec';
import { trigger, code, ifTrue, ifWhen, merge, stop, http, aiAgent } from '../_kit/n';

const cfg = (k: string) => `$('config').first().json.${k}`;

export default defineSpec({
  slug: 'github-issue-triage-labels',
  title: 'Label new GitHub issues by keywords with an optional OpenAI pass',
  summary: 'Every 30 minutes it reads issues opened since the last run, labels each as bug, feature, question or docs from weighted keywords, adds area labels from file paths mentioned, flags bugs without repro steps, and asks OpenAI only about the issues the rules could not decide.',
  category: 'DevOps and engineering',
  description: {
    who: 'Maintainers of open source projects and small product teams who get 10 to 100 issues a week and triage them by hand. New issues arrive labelled, and the ones missing repro steps already have a comment asking for them.',
    how: [
      'Every 30 minutes it lists open issues in each repository in `REPOS` updated since the last run, or sample issues until GitHub is connected. Pull requests and issues that already have labels are skipped.',
      'Keywords in `TYPE_RULES` score each type, title words counting double. Paths and words in `AREA_RULES` add area labels. A bug with no steps or no version gets `needs-repro`.',
      'When the top two types tie or nothing matched, and `USE_OPENAI` is true, the model picks the type. Otherwise the issue gets `needs-triage`.',
      'Labels are added through the GitHub API, and needs-repro issues get one comment asking for steps and versions.',
    ],
    setup: [
      'Run it once as imported. It labels the sample issues and stops at `STOP: dry run - GitHub untouched`.',
      'Add a GitHub credential to the three GitHub nodes, list your repositories in `REPOS` and set `USE_GITHUB = true`. Create the labels in each repository first.',
      'Optional: add an OpenAI credential to `Classify unclear issues model` and set `USE_OPENAI = true`.',
      'Read the labels on `Pick the final labels`, then set `DRY_RUN = false`.',
    ],
    requirements: ['A GitHub token with issues write access', 'Optional: an OpenAI API key'],
    customize: [
      '`TYPE_RULES` and `AREA_RULES` hold every keyword and the label it maps to.',
      '`REPRO_COMMENT` is the text posted on bugs without steps; blank turns comments off.',
      '`MAX_PER_RUN` caps how many issues one run labels.',
    ],
  },
  config: {
    intro: ['USE_GITHUB false -> SAMPLE issues. USE_OPENAI false -> unclear issues get needs-triage.', 'DRY_RUN true -> labels are computed and shown, GitHub is not changed.'],
    consts: [
      { name: 'USE_GITHUB', value: false, note: 'set true after adding the GitHub credential' },
      { name: 'REPOS', value: ['northwind/api', 'northwind/web'], note: 'owner/name of each repository to triage' },
      { name: 'TYPE_RULES', value: {
        bug: ['error', 'crash', 'exception', 'broken', 'regression', 'fails', 'stack trace', '500'],
        feature: ['feature request', 'add support', 'would be nice', 'proposal', 'allow', 'option to'],
        question: ['how do i', 'how to', 'is it possible', 'question', 'help'],
        docs: ['docs', 'documentation', 'readme', 'typo', 'example in'],
      }, note: 'type label -> keywords; title matches count double' },
      { name: 'AREA_RULES', value: {
        'area: api': ['src/api/', 'endpoint', '/v1/', 'rest api'],
        'area: ui': ['src/components/', '.tsx', 'button', 'css', 'dark mode'],
        'area: cli': ['bin/', 'cli', 'command line', '--'],
        'area: auth': ['login', 'oauth', 'token', 'sso'],
      }, note: 'area label -> paths or words that suggest it' },
      { name: 'REPRO_COMMENT', value: 'Thanks for the report. Could you add the exact steps to reproduce it and the version you are on? We will pick it up as soon as we can reproduce it.', note: 'posted on bugs with no steps or version; blank posts nothing' },
      { name: 'USE_OPENAI', value: false, note: 'true asks the model about issues the keyword rules could not decide' },
      { name: 'LOOKBACK_HOURS', value: 24, note: 'first run: how far back to look' },
      { name: 'MAX_PER_RUN', value: 30, note: 'hard ceiling on issues labelled per run' },
    ],
    safety: 'dry_run',
  },
  nodes: [
    trigger.manual(),
    trigger.schedule('Every 30 minutes', '*/30 * * * *'),
    code('List repositories', `
// One item per repository, with the "since" cut-off from the last labelled run.
const cfg = $('config').first().json;
const store = $getWorkflowStaticData('global');
const since = store.last_run || new Date(Date.now() - cfg.lookback_hours * 36e5).toISOString();
return cfg.repos.map(repo => ({ json: { repo, since } }));`),
    ifTrue('GitHub connected?', cfg('use_github')),
    http('Fetch open issues', { url: "={{ 'https://api.github.com/repos/' + $json.repo + '/issues' }}", auth: 'githubApi', headers: { Accept: 'application/vnd.github+json' }, query: { state: 'open', since: '={{ $json.since }}', sort: 'created', direction: 'desc', per_page: '100' } }),
    code('Load sample issues', `
// Used until USE_GITHUB is true. GitHub issue objects, created in the last few hours.
const ago = h => new Date(Date.now() - h * 36e5).toISOString();
const iss = (repo, number, title, body, extra = {}) => ({ number, title, body, labels: [], state: 'open', created_at: ago(number % 7 + 1),
  repository_url: 'https://api.github.com/repos/' + repo, html_url: 'https://github.com/' + repo + '/issues/' + number, user: { login: 'user' + number }, ...extra });
return [
  iss('northwind/api', 412, 'Crash when exporting invoices', 'Exporting more than 500 invoices throws an exception in src/api/export.ts. Stack trace below.\\n\\nSteps to reproduce:\\n1. Create 600 invoices\\n2. Click export\\n\\nVersion: v2.14.1'),
  iss('northwind/api', 413, 'Login broken after update', 'Since this morning OAuth login fails with a 500 error.'),
  iss('northwind/web', 88, 'Add support for dark mode in the dashboard', 'It would be nice to have an option to switch src/components/Theme.tsx to dark mode.'),
  iss('northwind/web', 89, 'How do I change the date format?', 'Is it possible to show dates as DD/MM/YYYY? I could not find it in the docs.'),
  iss('northwind/web', 90, 'Typo in README example', 'The example in the README uses --port but the flag is --listen.'),
  iss('northwind/web', 91, 'Billing page', 'The billing page feels slow and confusing to me.'),
  iss('northwind/web', 92, 'Use the new chart library', 'Swaps the charts.', { pull_request: { url: 'https://api.github.com/repos/northwind/web/pulls/92' } }),
  iss('northwind/api', 414, 'Rate limit headers', 'Rate limit headers are missing on /v1/orders.', { labels: [{ name: 'bug' }] }),
].map(json => ({ json }));`),
    merge('Combine issue sources'),
    code('Label with keyword rules', `
// Weighted keyword score per type (title x2). A tie between the top two types, or no
// match at all, marks the issue unsure. Areas and needs-repro come from the text too.
const cfg = $('config').first().json;
const store = $getWorkflowStaticData('global');
const since = store.last_run || new Date(Date.now() - cfg.lookback_hours * 36e5).toISOString();
const has = (t, w) => w === '--' ? /(^|\\s)--[a-z]/.test(t) : /^[a-z0-9 ]+$/.test(w) ? new RegExp('\\\\b' + w + '\\\\b').test(t) : t.includes(w);
const out = [];
for (const { json: i } of $input.all()) {
  if (!i.number || i.pull_request || (i.labels || []).length || i.created_at < since) continue;
  const title = (i.title || '').toLowerCase(), body = (i.body || '').toLowerCase();
  const scores = Object.entries(cfg.type_rules).map(([label, words]) => [label, words.reduce((n, w) => n + (has(title, w) ? 2 : 0) + (has(body, w) ? 1 : 0), 0)])
    .sort((a, b) => b[1] - a[1]);
  const [top, second] = scores;
  const unsure = top[1] === 0 || top[1] === second[1];
  const areas = Object.entries(cfg.area_rules).filter(([, words]) => words.some(w => has(title + ' ' + body, w))).map(([l]) => l);
  const type = unsure ? '' : top[0];
  const noSteps = !/steps to reproduce|to reproduce|repro|\\n\\s*1[.)]/.test(body);
  const noVersion = !/version|v\\d+\\.\\d+|\\d+\\.\\d+\\.\\d+/.test(body);
  out.push({ repo: i.repository_url.split('/repos/')[1], number: i.number, title: i.title, body: (i.body || '').slice(0, 1500), url: i.html_url,
    type, unsure, scores: Object.fromEntries(scores), areas, needs_repro: type === 'bug' && (noSteps || noVersion), created_at: i.created_at });
}
out.sort((a, b) => a.created_at.localeCompare(b.created_at));
return out.slice(0, cfg.max_per_run).map(json => ({ json }));`),
    ifWhen('Rules decided it?', [[cfg('use_openai'), 'false'], ['$json.unsure', 'false']], 'or'),
    aiAgent('Classify unclear issues', {
      prompt: "Repository: {{ $json.repo }}\nTitle: {{ $json.title }}\n\n{{ $json.body }}",
      system: 'You triage GitHub issues. Pick exactly one type: bug (something worked and now does not, or errors), feature (a request for new behaviour), question (asking how to do something), docs (documentation is wrong or missing). Set confidence between 0 and 1. Set needs_repro true only for a bug that has no steps or no version.',
      schemaExample: { type: 'bug', confidence: 0.8, needs_repro: false },
    }),
    code('Use the model answer', `
// The model only decides the type, and only when confident; areas stay rule-based.
const allowed = Object.keys($('config').first().json.type_rules);
const rules = $('Label with keyword rules').all();
const unsure = rules.filter(r => r.json.unsure);
return $input.all().map((it, i) => {
  const base = unsure[i]?.json || {};
  const o = it.json.output || {};
  const ok = allowed.includes(o.type) && Number(o.confidence) >= 0.6;
  return { json: { ...base, type: ok ? o.type : '', unsure: !ok, needs_repro: ok && o.type === 'bug' ? Boolean(o.needs_repro) : base.needs_repro, decided_by: ok ? 'model' : 'nobody' } };
});`),
    merge('Combine label sources'),
    code('Pick the final labels', `
// Type + areas + needs-repro, or needs-triage when nothing could decide the type.
return $input.all().map(({ json: i }) => {
  const labels = [i.type || 'needs-triage', ...i.areas, ...(i.needs_repro ? ['needs-repro'] : [])];
  return { json: { ...i, labels, decided_by: i.decided_by || (i.type ? 'rules' : 'nobody') } };
});`),
    ifTrue('Write to GitHub?', cfg('live')),
    stop('STOP: dry run - GitHub untouched'),
    http('Add labels on GitHub', { method: 'POST', url: "={{ 'https://api.github.com/repos/' + $json.repo + '/issues/' + $json.number + '/labels' }}", auth: 'githubApi', headers: { Accept: 'application/vnd.github+json' }, jsonBody: 'JSON.stringify({ labels: $json.labels })' }),
    ifWhen('Ask for repro steps?', [["$('Pick the final labels').item.json.needs_repro", 'true'], [`${cfg('repro_comment')}.length > 0`, 'true']]),
    stop('STOP: no comment needed'),
    http('Comment asking for repro steps', { method: 'POST', url: "={{ 'https://api.github.com/repos/' + $('Pick the final labels').item.json.repo + '/issues/' + $('Pick the final labels').item.json.number + '/comments' }}", auth: 'githubApi', headers: { Accept: 'application/vnd.github+json' }, jsonBody: `JSON.stringify({ body: ${cfg('repro_comment')} })` }),
    code('Record the run time', `
// Next run only looks at issues newer than this labelled run.
const store = $getWorkflowStaticData('global');
store.last_run = $('config').first().json.run_started_at;
return [{ json: { last_run: store.last_run, labelled: $input.all().length } }];`),
  ],
  edges: [
    ['Run manually', 'config'], ['Every 30 minutes', 'config'],
    ['config', 'List repositories'], ['List repositories', 'GitHub connected?'],
    ['GitHub connected?', 0, 'Fetch open issues'], ['GitHub connected?', 1, 'Load sample issues'],
    ['Fetch open issues', 'Combine issue sources'], ['Load sample issues', 0, 'Combine issue sources', 1],
    ['Combine issue sources', 'Label with keyword rules'],
    ['Label with keyword rules', 'Rules decided it?'],
    ['Rules decided it?', 0, 'Combine label sources'], ['Rules decided it?', 1, 'Classify unclear issues'],
    ['Classify unclear issues model', 'Classify unclear issues', 'ai_languageModel'],
    ['Classify unclear issues output format', 'Classify unclear issues', 'ai_outputParser'],
    ['Classify unclear issues', 'Use the model answer'],
    ['Use the model answer', 0, 'Combine label sources', 1],
    ['Combine label sources', 'Pick the final labels'],
    ['Pick the final labels', 'Write to GitHub?'],
    ['Write to GitHub?', 0, 'Add labels on GitHub'], ['Write to GitHub?', 1, 'STOP: dry run - GitHub untouched'],
    ['Add labels on GitHub', 'Ask for repro steps?'],
    ['Add labels on GitHub', 'Record the run time'],
    ['Ask for repro steps?', 0, 'Comment asking for repro steps'], ['Ask for repro steps?', 1, 'STOP: no comment needed'],
  ],
  groups: [
    { title: 'Start and settings', why: 'Runs every 30 minutes. `List repositories` attaches the time of the last labelled run to each repository, so a run only reads issues it has not seen.', nodes: ['Run manually', 'Every 30 minutes', 'config', 'List repositories'] },
    { title: 'Read new issues', why: 'The issues endpoint also returns pull requests, and `Load sample issues` includes one plus an already-labelled issue, so the filters that skip them are exercised offline.', nodes: ['GitHub connected?', 'Fetch open issues', 'Load sample issues', 'Combine issue sources'] },
    { title: 'Rules first, model only when unsure', why: 'Keyword rules decide most issues for free. `Rules decided it?` sends only ties and no-match issues to OpenAI, and `Use the model answer` ignores answers under 0.6 confidence, so a vague issue gets needs-triage rather than a guess.', nodes: ['Label with keyword rules', 'Rules decided it?', 'Classify unclear issues', 'Use the model answer', 'Combine label sources', 'Pick the final labels'] },
    { title: 'Label, comment and record', why: 'Nothing is written in a dry run. A live run adds the labels, comments once on bugs without steps or a version, and records the run time only after GitHub accepted the labels.', nodes: ['Write to GitHub?', 'STOP: dry run - GitHub untouched', 'Add labels on GitHub', 'Ask for repro steps?', 'Record the run time', 'STOP: no comment needed', 'Comment asking for repro steps'] },
  ],
  scenarios: [
    {
      name: 'shipped config (sample issues, dry run)', start: 'Run manually',
      expect: { reached: ['Load sample issues', 'Pick the final labels', 'STOP: dry run - GitHub untouched'], notReached: ['Classify unclear issues'], outward: 'none' },
      check: out => {
        const p = out['Pick the final labels'];
        const by = (n: number) => p.find((x: any) => x.number === n)?.labels.join(',');
        const f: string[] = [];
        if (p.length !== 6) f.push(`6 new unlabelled issues expected (PR and labelled issue skipped), got ${p.length}`);
        const want: Record<number, string> = {
          412: 'bug,area: api', 413: 'bug,area: auth,needs-repro', 88: 'feature,area: ui', 89: 'question',
          90: 'docs,area: cli', 91: 'needs-triage',
        };
        for (const [n, l] of Object.entries(want)) if (by(Number(n)) !== l) f.push(`#${n} should be ${l}, got ${by(Number(n))}`);
        return f;
      },
    },
    {
      name: 'live with GitHub and OpenAI', start: 'Every 30 minutes',
      overrides: { USE_GITHUB: true, USE_OPENAI: true, DRY_RUN: false, REPOS: ['northwind/api'] },
      mocks: {
        'Fetch open issues': [
          { number: 501, title: 'Webhook retries', body: 'We see webhooks for orders arriving twice at /v1/hooks.', labels: [], created_at: new Date(Date.now() - 36e5).toISOString(), repository_url: 'https://api.github.com/repos/northwind/api', html_url: 'https://github.com/northwind/api/issues/501' },
          { number: 502, title: 'Export fails with error 500', body: 'Export button fails.', labels: [], created_at: new Date(Date.now() - 2 * 36e5).toISOString(), repository_url: 'https://api.github.com/repos/northwind/api', html_url: 'https://github.com/northwind/api/issues/502' },
        ],
        'Classify unclear issues': [{ output: { type: 'bug', confidence: 0.82, needs_repro: true } }],
        'Add labels on GitHub': (items: any[]) => items.map(i => i.labels.map((name: string) => ({ name }))).map(l => ({ labels: l })),
        'Comment asking for repro steps': [{ id: 1, body: 'Thanks for the report.' }, { id: 2, body: 'Thanks for the report.' }],
      },
      expect: { reached: ['Classify unclear issues', 'Add labels on GitHub', 'Comment asking for repro steps', 'Record the run time'], notReached: ['Load sample issues'], outward: 'some' },
      check: out => {
        const p = out['Pick the final labels'];
        const f: string[] = [];
        const hook = p.find((x: any) => x.number === 501);
        if (hook?.decided_by !== 'model' || hook?.labels.join() !== 'bug,area: api,needs-repro') f.push(`#501 should be decided by the model as a bug, got ${hook?.decided_by} ${hook?.labels}`);
        const exp = p.find((x: any) => x.number === 502);
        if (exp?.decided_by !== 'rules' || !exp?.labels.includes('needs-repro')) f.push('#502 is a rules bug without steps');
        return f;
      },
    },
  ],
});
