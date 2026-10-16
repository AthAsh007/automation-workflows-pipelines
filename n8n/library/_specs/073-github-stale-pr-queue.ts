import { defineSpec } from '../_kit/spec';
import { trigger, code, ifTrue, ifWhen, merge, stop, http, slack } from '../_kit/n';

const cfg = (k: string) => `$('config').first().json.${k}`;

export default defineSpec({
  slug: 'github-stale-pr-queue',
  title: 'Post a weekly stale pull request queue from GitHub to Slack',
  summary: 'Reads open pull requests across several repositories with one GraphQL query each, works out whether each one waits on the author or a reviewer from its review state and latest commit, sizes it by lines changed, and posts the stale ones to Slack as a sorted queue.',
  category: 'DevOps and engineering',
  description: {
    who: 'Engineering leads of teams with 4 to 30 developers where pull requests sit for days because nobody knows whose turn it is. Monday morning starts with a list that says who has to act on what.',
    how: [
      'Every Monday at 09:30 it queries open pull requests in each repository in `REPOS` through the GitHub GraphQL API, or uses sample data until GitHub is connected.',
      'Drafts are skipped. A pull request waits on the author when changes were requested and no commit came after, or when it is approved but not merged. Otherwise it waits on the requested reviewers.',
      'Anything not updated for `STALE_DAYS` is stale. Size comes from lines added plus deleted, XS to XL.',
      'One Slack message lists reviewer waits first, oldest first, then author waits, with GitHub logins turned into Slack mentions through `SLACK_USERS`.',
    ],
    setup: [
      'Run it once as imported. It builds the queue from sample pull requests and stops at `STOP: dry run - nothing posted`.',
      'Add a GitHub credential to `Query open pull requests`, list your repositories in `REPOS` and set `USE_GITHUB = true`.',
      'Connect Slack, set `SLACK_CHANNEL_ID` and map GitHub logins to Slack member ids in `SLACK_USERS`.',
      'Set `DRY_RUN = false` once the queue looks right.',
    ],
    requirements: ['A GitHub token with read access to the repositories', 'A Slack workspace'],
    customize: [
      '`STALE_DAYS` sets how long without an update counts as stale.',
      '`SIZE_STEPS` sets the line counts for XS, S, M and L; anything above is XL.',
      '`MAX_LINES` caps the message length; the rest is summarised as a count.',
    ],
  },
  config: {
    intro: ['USE_GITHUB false -> SAMPLE pull requests. SLACK_CHANNEL_ID blank -> nothing is posted.', 'DRY_RUN true -> the queue is built and shown, not posted.'],
    consts: [
      { name: 'USE_GITHUB', value: false, note: 'set true after adding the GitHub credential' },
      { name: 'REPOS', value: ['northwind/api', 'northwind/web'], note: 'owner/name of each repository' },
      { name: 'STALE_DAYS', value: 3, note: 'days without an update before a pull request is listed' },
      { name: 'SIZE_STEPS', value: { XS: 10, S: 100, M: 400, L: 1000 }, note: 'upper bound of lines changed for each size; above L is XL' },
      { name: 'SLACK_USERS', value: { lucyg: 'U01LUCY', ravis: 'U01RAVI', mayat: 'U01MAYA', tomr: 'U01TOM' }, note: 'GitHub login -> Slack member id for mentions' },
      { name: 'MAX_LINES', value: 20, note: 'most pull requests listed in one message' },
      { name: 'SLACK_CHANNEL_ID', value: '', note: 'channel for the weekly queue; blank skips Slack' },
    ],
    flags: { slack_enabled: "SLACK_CHANNEL_ID.trim() !== ''" },
    safety: 'dry_run',
  },
  nodes: [
    trigger.manual(),
    trigger.schedule('Every Monday at 09:30', '30 9 * * 1'),
    code('List repositories', `
// One GraphQL request per repository: everything needed to decide whose turn it is.
const query = [
  'query($owner: String!, $name: String!) { repository(owner: $owner, name: $name) { nameWithOwner',
  '  pullRequests(states: OPEN, first: 50, orderBy: { field: UPDATED_AT, direction: ASC }) { nodes {',
  '    number title url isDraft createdAt updatedAt additions deletions author { login } reviewDecision',
  '    reviewRequests(first: 10) { nodes { requestedReviewer { ... on User { login } ... on Team { name } } } }',
  '    latestReviews(first: 10) { nodes { author { login } state submittedAt } }',
  '    commits(last: 1) { nodes { commit { committedDate } } } } } } }',
].join('\\n');
return $('config').first().json.repos.map(repo => {
  const [owner, name] = repo.split('/');
  return { json: { repo, body: { query, variables: { owner, name } } } };
});`),
    ifTrue('GitHub connected?', cfg('use_github')),
    http('Query open pull requests', { method: 'POST', outward: false, url: 'https://api.github.com/graphql', auth: 'githubApi', jsonBody: 'JSON.stringify($json.body)' }),
    code('Load sample pull requests', `
// Used until USE_GITHUB is true. GraphQL responses for two repositories, dates relative to now.
const ago = d => new Date(Date.now() - d * 864e5).toISOString();
const pr = (number, title, o) => ({ number, title, url: 'https://github.com/' + o.repo + '/pull/' + number, isDraft: !!o.draft, createdAt: ago(o.age + 2),
  updatedAt: ago(o.age), additions: o.add, deletions: o.del, author: { login: o.author }, reviewDecision: o.decision || null,
  reviewRequests: { nodes: (o.requested || []).map(login => ({ requestedReviewer: { login } })) },
  latestReviews: { nodes: (o.reviews || []).map(([login, state, d]) => ({ author: { login }, state, submittedAt: ago(d) })) },
  commits: { nodes: [{ commit: { committedDate: ago(o.commit ?? o.age) } }] } });
const repo = (name, nodes) => ({ data: { repository: { nameWithOwner: name, pullRequests: { nodes } } } });
return [
  repo('northwind/api', [
    pr(311, 'Add retries to the webhook sender', { repo: 'northwind/api', age: 6, add: 120, del: 30, author: 'mayat', requested: ['lucyg'] }),
    pr(305, 'Move invoice PDFs to background jobs', { repo: 'northwind/api', age: 5, add: 340, del: 210, author: 'tomr', decision: 'CHANGES_REQUESTED', reviews: [['ravis', 'CHANGES_REQUESTED', 5]], commit: 7 }),
    pr(309, 'Paginate the orders endpoint', { repo: 'northwind/api', age: 2, add: 60, del: 12, author: 'mayat', decision: 'CHANGES_REQUESTED', reviews: [['ravis', 'CHANGES_REQUESTED', 4]], commit: 2 }),
  ]),
  repo('northwind/web', [
    pr(77, 'Fix date format on the billing page', { repo: 'northwind/web', age: 4, add: 4, del: 3, author: 'lucyg', decision: 'APPROVED', reviews: [['mayat', 'APPROVED', 4]] }),
    pr(80, 'WIP: new onboarding flow', { repo: 'northwind/web', age: 12, add: 900, del: 40, author: 'tomr', draft: true }),
    pr(81, 'Upgrade the design system to v3', { repo: 'northwind/web', age: 10, add: 1300, del: 420, author: 'ravis' }),
  ]),
].map(json => ({ json }));`),
    merge('Combine pull request sources'),
    code('Sort the stale queue', `
// Whose turn: changes requested with no newer commit, or approved and unmerged -> author.
// A commit after the change request, pending review requests, or no review -> reviewer.
const cfg = $('config').first().json;
const days = iso => Math.floor((Date.now() - new Date(iso)) / 864e5);
const size = n => Object.entries(cfg.size_steps).find(([, max]) => n < max)?.[0] || 'XL';
const queue = [], skipped = { drafts: 0, fresh: 0 };
for (const { json: page } of $input.all()) {
  const repo = page.data?.repository;
  if (!repo) continue;
  for (const p of repo.pullRequests.nodes || []) {
    if (p.isDraft) { skipped.drafts++; continue; }
    const idle = days(p.updatedAt);
    if (idle < cfg.stale_days) { skipped.fresh++; continue; }
    const lastCommit = p.commits?.nodes?.[0]?.commit?.committedDate || p.createdAt;
    const changeReq = (p.latestReviews?.nodes || []).filter(r => r.state === 'CHANGES_REQUESTED').sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))[0];
    const requested = (p.reviewRequests?.nodes || []).map(r => r.requestedReviewer?.login || r.requestedReviewer?.name).filter(Boolean);
    let waiting, who, why;
    if (p.reviewDecision === 'APPROVED') { waiting = 'author'; who = [p.author.login]; why = 'approved, not merged'; }
    else if (changeReq && lastCommit <= changeReq.submittedAt) { waiting = 'author'; who = [p.author.login]; why = 'changes requested by ' + changeReq.author.login; }
    else if (changeReq) { waiting = 'reviewer'; who = [changeReq.author.login]; why = 'new commits since changes were requested'; }
    else if (requested.length) { waiting = 'reviewer'; who = requested; why = 'review requested'; }
    else { waiting = 'reviewer'; who = []; why = 'no reviewer assigned'; }
    queue.push({ repo: repo.nameWithOwner, number: p.number, title: p.title, url: p.url, author: p.author.login, idle_days: idle,
      size: size((p.additions || 0) + (p.deletions || 0)), lines: (p.additions || 0) + (p.deletions || 0), waiting, who, why });
  }
}
queue.sort((a, b) => (a.waiting === b.waiting ? b.idle_days - a.idle_days : a.waiting === 'reviewer' ? -1 : 1));
return [{ json: { queue, skipped } }];`),
    ifTrue('Anything stale?', '$json.queue.length > 0'),
    stop('STOP: no stale pull requests'),
    code('Write the queue message', `
// Two blocks, reviewer waits first. Logins become Slack mentions where known.
const cfg = $('config').first().json;
const { queue, skipped } = $input.first().json;
const tag = l => cfg.slack_users[l] ? '<@' + cfg.slack_users[l] + '>' : '@' + l;
const line = p => '- <' + p.url + '|' + p.repo.split('/')[1] + '#' + p.number + '> ' + p.title + ' [' + p.size + '] ' + p.idle_days + 'd idle: ' +
  (p.who.length ? p.who.map(tag).join(', ') : '*needs a reviewer*') + ' (' + p.why + ')';
const shown = queue.slice(0, cfg.max_lines);
const rev = shown.filter(p => p.waiting === 'reviewer'), auth = shown.filter(p => p.waiting === 'author');
const text = [
  '*Stale pull requests* (' + queue.length + ' idle ' + cfg.stale_days + '+ days; ' + skipped.drafts + ' drafts skipped)',
  ...(rev.length ? ['', '*Waiting on review*', ...rev.map(line)] : []),
  ...(auth.length ? ['', '*Waiting on the author*', ...auth.map(line)] : []),
  ...(queue.length > shown.length ? ['', '...and ' + (queue.length - shown.length) + ' more.'] : []),
].join('\\n');
return [{ json: { text, listed: shown.length } }];`),
    ifWhen('Post to Slack?', [[cfg('live'), 'true'], [cfg('slack_enabled'), 'true']]),
    stop('STOP: dry run - nothing posted'),
    slack.post('Post the queue to Slack', cfg('slack_channel_id'), '$json.text'),
  ],
  edges: [
    ['Run manually', 'config'], ['Every Monday at 09:30', 'config'],
    ['config', 'List repositories'], ['List repositories', 'GitHub connected?'],
    ['GitHub connected?', 0, 'Query open pull requests'], ['GitHub connected?', 1, 'Load sample pull requests'],
    ['Query open pull requests', 'Combine pull request sources'], ['Load sample pull requests', 0, 'Combine pull request sources', 1],
    ['Combine pull request sources', 'Sort the stale queue'],
    ['Sort the stale queue', 'Anything stale?'],
    ['Anything stale?', 0, 'Write the queue message'], ['Anything stale?', 1, 'STOP: no stale pull requests'],
    ['Write the queue message', 'Post to Slack?'],
    ['Post to Slack?', 0, 'Post the queue to Slack'], ['Post to Slack?', 1, 'STOP: dry run - nothing posted'],
  ],
  groups: [
    { title: 'Start and settings', why: 'Runs every Monday at 09:30. `List repositories` builds one GraphQL request per repository, which returns reviews, review requests and the last commit in a single call instead of one REST call per pull request.', nodes: ['Run manually', 'Every Monday at 09:30', 'config', 'List repositories'] },
    { title: 'Read open pull requests', why: 'The GraphQL call is a POST that only reads, so it is not treated as a write. `Load sample pull requests` returns the same response shape, including a draft and a re-review case.', nodes: ['GitHub connected?', 'Query open pull requests', 'Load sample pull requests', 'Combine pull request sources'] },
    { title: 'Decide whose turn it is', why: 'Comparing the last commit with the latest change request is what separates "author has not fixed it" from "author fixed it, reviewer has not looked". Drafts and recently updated pull requests are counted, not listed.', nodes: ['Sort the stale queue', 'Anything stale?', 'STOP: no stale pull requests'] },
    { title: 'Post the queue', why: 'Reviewer waits come first because they block someone else. `MAX_LINES` keeps the message readable, and `Post to Slack?` needs a live run and a channel.', nodes: ['Write the queue message', 'Post to Slack?', 'STOP: dry run - nothing posted', 'Post the queue to Slack'] },
  ],
  scenarios: [
    {
      name: 'shipped config (sample pull requests, dry run)', start: 'Run manually',
      expect: { reached: ['Load sample pull requests', 'Write the queue message', 'STOP: dry run - nothing posted'], notReached: ['Query open pull requests'], outward: 'none' },
      check: out => {
        const s = out['Sort the stale queue'][0];
        const f: string[] = [];
        const order = s.queue.map((p: any) => p.number).join(',');
        if (order !== '81,311,305,77') f.push(`expected 81,311 (reviewer, oldest first) then 305,77 (author), got ${order}`);
        const by = (n: number) => s.queue.find((p: any) => p.number === n);
        if (by(305)?.who.join() !== 'tomr' || !by(305)?.why.includes('ravis')) f.push('#305 waits on its author after changes requested');
        if (by(77)?.why !== 'approved, not merged') f.push('#77 is approved and waits on the author');
        if (by(81)?.size !== 'XL' || by(311)?.size !== 'M' || by(77)?.size !== 'XS') f.push('sizes should be XL, M and XS');
        if (s.skipped.drafts !== 1 || s.skipped.fresh !== 1) f.push('1 draft and 1 fresh pull request should be skipped');
        if (!out['Write the queue message'][0].text.includes('<@U01LUCY>')) f.push('Lucy should be mentioned on #311');
        return f;
      },
    },
    {
      name: 'live with GitHub and Slack', start: 'Every Monday at 09:30',
      overrides: { USE_GITHUB: true, DRY_RUN: false, SLACK_CHANNEL_ID: 'C0ENG', REPOS: ['northwind/mobile'] },
      mocks: {
        'Query open pull requests': [{ data: { repository: { nameWithOwner: 'northwind/mobile', pullRequests: { nodes: [
          { number: 14, title: 'Offline mode', url: 'https://github.com/northwind/mobile/pull/14', isDraft: false, createdAt: new Date(Date.now() - 9 * 864e5).toISOString(), updatedAt: new Date(Date.now() - 4 * 864e5).toISOString(), additions: 520, deletions: 80, author: { login: 'newdev' }, reviewDecision: 'REVIEW_REQUIRED',
            reviewRequests: { nodes: [{ requestedReviewer: { name: 'mobile-team' } }] }, latestReviews: { nodes: [] }, commits: { nodes: [{ commit: { committedDate: new Date(Date.now() - 4 * 864e5).toISOString() } }] } },
        ] } } } }],
        'Post the queue to Slack': [{ ok: true, ts: '1700000000.0006' }],
      },
      expect: { reached: ['Post the queue to Slack'], notReached: ['Load sample pull requests'], outward: 'some' },
      check: out => {
        const p = out['Sort the stale queue'][0].queue[0];
        const f: string[] = [];
        if (p?.who.join() !== 'mobile-team' || p?.size !== 'L') f.push('team review request should be named, 600 lines is L');
        if (!out['Write the queue message'][0].text.includes('@mobile-team')) f.push('unknown logins fall back to @name');
        return f;
      },
    },
  ],
});
