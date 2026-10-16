import { defineSpec } from '../_kit/spec';
import { trigger, code, ifTrue, ifWhen, merge, stop, http, discord } from '../_kit/n';

const cfg = (k: string) => `$('config').first().json.${k}`;

export default defineSpec({
  slug: 'github-release-watch-discord',
  title: 'Announce new GitHub releases of watched repositories in Discord',
  summary: 'Checks the releases of a list of GitHub repositories every hour, keeps only releases published since the last one announced, labels each as a major, minor or patch bump against the previous stable tag, flags breaking-change wording and posts one Discord message per release.',
  category: 'DevOps and engineering',
  description: {
    who: 'Developer communities and small teams that depend on 5 to 50 open source projects and want upgrades announced where they already talk. Major versions and breaking changes stand out from routine patches.',
    how: [
      'Every hour it reads the latest releases of each repository in `WATCH`, or sample releases until `USE_GITHUB` is true. Public repositories need no token.',
      'Drafts are dropped, and prereleases too unless `INCLUDE_PRERELEASES` is true. A release is new when it was published after the last one announced for that repository; a repository seen for the first time looks back `FIRST_RUN_DAYS`.',
      'Each tag is parsed as a version and compared with the previous stable release to call it major, minor or patch. Release notes containing `BREAKING_WORDS` get a warning line.',
      'One Discord message per release, oldest first, capped at `MAX_POSTS` per run.',
    ],
    setup: [
      'Run it once as imported. It reads sample releases and stops at `STOP: dry run - nothing posted`.',
      'Fill `WATCH` with owner/name pairs and set `USE_GITHUB = true`.',
      'Add a Discord bot credential to `Post the release to Discord` and set `DISCORD_CHANNEL_ID`.',
      'Set `DRY_RUN = false` and activate the workflow. The last announced release per repository is kept in workflow static data.',
    ],
    requirements: ['A Discord server with a bot that can post in the channel', 'Public GitHub repositories (or a token for private ones)'],
    customize: [
      '`ONLY_BUMPS` limits posts to, for example, `["major", "minor"]`.',
      '`BREAKING_WORDS` lists the phrases that mark a breaking change.',
      '`NOTES_CHARS` sets how much of the release notes is quoted.',
    ],
  },
  config: {
    intro: ['USE_GITHUB false -> SAMPLE releases, so the run works offline.', 'DISCORD_CHANNEL_ID blank -> nothing is posted.'],
    consts: [
      { name: 'USE_GITHUB', value: false, note: 'true reads the public releases API for each repository' },
      { name: 'WATCH', value: ['acme-labs/widget-kit', 'northwind/cli'], note: 'owner/name of each repository to watch' },
      { name: 'INCLUDE_PRERELEASES', value: false, note: 'true also announces release candidates and betas' },
      { name: 'ONLY_BUMPS', value: ['major', 'minor', 'patch', 'other'], note: 'which kinds of release to announce' },
      { name: 'BREAKING_WORDS', value: ['breaking change', 'breaking:', 'removed support', 'no longer supported', 'migration guide'], note: 'phrases in the notes that flag a breaking change' },
      { name: 'FIRST_RUN_DAYS', value: 7, note: 'a repository seen for the first time announces releases from this many days back' },
      { name: 'NOTES_CHARS', value: 300, note: 'characters of release notes quoted in the message' },
      { name: 'MAX_POSTS', value: 10, note: 'hard ceiling on Discord posts per run' },
      { name: 'DISCORD_CHANNEL_ID', value: '', note: 'channel for announcements; blank skips Discord' },
    ],
    flags: { discord_enabled: "DISCORD_CHANNEL_ID.trim() !== ''" },
    safety: 'dry_run',
  },
  nodes: [
    trigger.manual(),
    trigger.schedule('Every hour', '12 * * * *'),
    code('List watched repositories', `
// One item per repository for the releases call.
return $('config').first().json.watch.map(repo => ({ json: { repo } }));`),
    ifTrue('GitHub lookups on?', cfg('use_github')),
    http('Fetch recent releases', { url: "={{ 'https://api.github.com/repos/' + $json.repo + '/releases' }}", auth: 'none', headers: { Accept: 'application/vnd.github+json' }, query: { per_page: '10' } }),
    code('Load sample releases', `
// Used until USE_GITHUB is true. GitHub release objects, dates relative to now.
const ago = d => new Date(Date.now() - d * 864e5).toISOString();
const rel = (repo, tag, d, body, extra = {}) => ({ tag_name: tag, name: tag, draft: false, prerelease: false, published_at: ago(d), body,
  html_url: 'https://github.com/' + repo + '/releases/tag/' + tag, author: { login: 'release-bot' }, ...extra });
return [
  rel('acme-labs/widget-kit', 'v3.0.0', 1, '## Highlights\\n- New theming engine\\n\\nBREAKING CHANGE: Node 16 is no longer supported. See the migration guide.'),
  rel('acme-labs/widget-kit', 'v3.0.0-rc.2', 3, 'Release candidate.', { prerelease: true }),
  rel('acme-labs/widget-kit', 'v2.4.1', 20, 'Fix tooltip position.'),
  rel('northwind/cli', 'v1.9.0', 0.2, 'Draft notes', { draft: true, published_at: null }),
  rel('northwind/cli', 'v1.8.0', 2, '- Add --json output to every command\\n- Faster startup'),
  rel('northwind/cli', 'v1.7.3', 5, '- Fix crash when HOME is unset'),
  rel('northwind/cli', 'v1.7.2', 30, '- Fix typo in help text'),
].map(json => ({ json }));`),
    merge('Combine release sources'),
    code('Find new releases', `
// Per repository: drop drafts (and prereleases), keep releases newer than the last one
// announced, and compare each tag with the previous stable one to name the bump.
const cfg = $('config').first().json;
const store = $getWorkflowStaticData('global');
const last = store.last_seen || {};
const parse = t => { const m = String(t).match(/(\\d+)\\.(\\d+)(?:\\.(\\d+))?(?:-([0-9a-z.-]+))?/i); return m ? [Number(m[1]), Number(m[2]), Number(m[3] || 0), m[4] || ''] : null; };
const bump = (a, b) => !a || !b ? 'other' : a[0] !== b[0] ? 'major' : a[1] !== b[1] ? 'minor' : a[2] !== b[2] ? 'patch' : 'other';
const byRepo = {};
for (const { json: r } of $input.all()) {
  const repo = (String(r.html_url || '').match(/github\\.com\\/([^/]+\\/[^/]+)\\/releases/) || [])[1];
  if (!repo || r.draft || !r.published_at) continue;
  (byRepo[repo] ||= []).push(r);
}
const out = [], skipped = [];
for (const [repo, list] of Object.entries(byRepo)) {
  list.sort((a, b) => b.published_at.localeCompare(a.published_at));
  const since = last[repo] || new Date(Date.now() - cfg.first_run_days * 864e5).toISOString();
  const stable = list.filter(r => !r.prerelease);
  for (const r of list.filter(x => x.published_at > since)) {
    if (r.prerelease && !cfg.include_prereleases) { skipped.push(repo + ' ' + r.tag_name + ' (prerelease)'); continue; }
    const prev = stable.find(s => s.published_at < r.published_at);
    const kind = bump(parse(r.tag_name), prev && parse(prev.tag_name));
    if (!cfg.only_bumps.includes(kind)) { skipped.push(repo + ' ' + r.tag_name + ' (' + kind + ')'); continue; }
    const notes = String(r.body || '');
    const breaking = cfg.breaking_words.filter(w => notes.toLowerCase().includes(w.toLowerCase()));
    out.push({ repo, tag: r.tag_name, previous: prev?.tag_name || '', kind, breaking, prerelease: r.prerelease,
      published_at: r.published_at, url: r.html_url, notes: notes.replace(/\\r/g, '').slice(0, cfg.notes_chars) });
  }
}
out.sort((a, b) => a.published_at.localeCompare(b.published_at));
const posts = out.slice(0, cfg.max_posts);
for (const r of out.slice(cfg.max_posts)) skipped.push(r.repo + ' ' + r.tag + ' (over MAX_POSTS, next run)');
return [{ json: { releases: posts, skipped } }];`),
    ifTrue('Anything new?', '$json.releases.length > 0'),
    stop('STOP: no new releases'),
    code('Write the announcements', `
// One message per release, under Discord's 2000-character limit.
return $input.first().json.releases.map(r => {
  const head = '**' + r.repo + ' ' + r.tag + '** (' + r.kind + (r.previous ? ' from ' + r.previous : '') + (r.prerelease ? ', prerelease' : '') + ')';
  const warn = r.breaking.length ? '> Breaking change flagged in the notes: ' + r.breaking.join(', ') : '';
  const content = [head, warn, r.notes ? '\`\`\`\\n' + r.notes.replace(/\`\`\`/g, "'''") + '\\n\`\`\`' : '', r.url].filter(Boolean).join('\\n').slice(0, 1990);
  return { json: { ...r, content } };
});`),
    ifWhen('Post to Discord?', [[cfg('live'), 'true'], [cfg('discord_enabled'), 'true']]),
    stop('STOP: dry run - nothing posted'),
    discord.send('Post the release to Discord', cfg('discord_channel_id'), '$json.content'),
    code('Remember the last release', `
// Newest announced publish time per repository; the next run starts after it.
const store = $getWorkflowStaticData('global');
const last = store.last_seen || {};
for (const r of $('Write the announcements').all()) if (!last[r.json.repo] || r.json.published_at > last[r.json.repo]) last[r.json.repo] = r.json.published_at;
store.last_seen = last;
return [{ json: { repos: Object.keys(last).length } }];`),
  ],
  edges: [
    ['Run manually', 'config'], ['Every hour', 'config'],
    ['config', 'List watched repositories'], ['List watched repositories', 'GitHub lookups on?'],
    ['GitHub lookups on?', 0, 'Fetch recent releases'], ['GitHub lookups on?', 1, 'Load sample releases'],
    ['Fetch recent releases', 'Combine release sources'], ['Load sample releases', 0, 'Combine release sources', 1],
    ['Combine release sources', 'Find new releases'],
    ['Find new releases', 'Anything new?'],
    ['Anything new?', 0, 'Write the announcements'], ['Anything new?', 1, 'STOP: no new releases'],
    ['Write the announcements', 'Post to Discord?'],
    ['Post to Discord?', 0, 'Post the release to Discord'], ['Post to Discord?', 1, 'STOP: dry run - nothing posted'],
    ['Post the release to Discord', 'Remember the last release'],
  ],
  groups: [
    { title: 'Start and settings', why: 'Runs at 12 past every hour. The watch list, prerelease rule and breaking-change phrases live in `config`; `List watched repositories` makes one item per repository.', nodes: ['Run manually', 'Every hour', 'config', 'List watched repositories'] },
    { title: 'Read releases', why: 'The public releases endpoint needs no credential for public repositories. `Load sample releases` includes a draft, a release candidate and an old release, so every filter is exercised offline.', nodes: ['GitHub lookups on?', 'Fetch recent releases', 'Load sample releases', 'Combine release sources'] },
    { title: 'Find and classify new releases', why: 'Releases are grouped by the repository in their URL, so the order of the API responses does not matter. The bump is measured against the previous stable release, which keeps a release candidate from turning 3.0.0 into a patch.', nodes: ['Find new releases', 'Anything new?', 'STOP: no new releases'] },
    { title: 'Post and remember', why: 'A dry run posts nothing and records nothing. `Remember the last release` runs only after Discord accepted the posts, so a failed post is retried on the next hour.', nodes: ['Write the announcements', 'Post to Discord?', 'STOP: dry run - nothing posted', 'Post the release to Discord', 'Remember the last release'] },
  ],
  scenarios: [
    {
      name: 'shipped config (sample releases, dry run)', start: 'Run manually',
      expect: { reached: ['Load sample releases', 'Write the announcements', 'STOP: dry run - nothing posted'], notReached: ['Fetch recent releases'], outward: 'none' },
      check: out => {
        const n = out['Find new releases'][0];
        const f: string[] = [];
        const got = n.releases.map((r: any) => r.tag + ':' + r.kind).join(',');
        if (got !== 'v1.7.3:patch,v1.8.0:minor,v3.0.0:major') f.push(`expected v1.7.3 patch, v1.8.0 minor, v3.0.0 major in date order, got ${got}`);
        const major = n.releases.find((r: any) => r.tag === 'v3.0.0');
        if (major?.previous !== 'v2.4.1') f.push('v3.0.0 should compare with v2.4.1, not the release candidate');
        if (major?.breaking.length !== 3) f.push(`breaking change, no longer supported and migration guide should be flagged, got ${major?.breaking}`);
        if (!n.skipped.some((s: string) => s.includes('rc.2 (prerelease)'))) f.push('release candidate should be skipped');
        if (!out['Write the announcements'][2].content.startsWith('**acme-labs/widget-kit v3.0.0** (major from v2.4.1)')) f.push('headline format');
        return f;
      },
    },
    {
      name: 'live with prereleases and Discord', start: 'Every hour',
      overrides: { USE_GITHUB: true, DRY_RUN: false, DISCORD_CHANNEL_ID: '112233445566778899', INCLUDE_PRERELEASES: true, WATCH: ['acme-labs/widget-kit'], ONLY_BUMPS: ['major', 'minor'] },
      mocks: {
        'Fetch recent releases': [
          { tag_name: 'v4.0.0-beta.1', draft: false, prerelease: true, published_at: new Date(Date.now() - 864e5).toISOString(), body: 'Beta.', html_url: 'https://github.com/acme-labs/widget-kit/releases/tag/v4.0.0-beta.1' },
          { tag_name: 'v3.0.1', draft: false, prerelease: false, published_at: new Date(Date.now() - 2 * 864e5).toISOString(), body: 'Fixes.', html_url: 'https://github.com/acme-labs/widget-kit/releases/tag/v3.0.1' },
          { tag_name: 'v3.0.0', draft: false, prerelease: false, published_at: new Date(Date.now() - 30 * 864e5).toISOString(), body: '', html_url: 'https://github.com/acme-labs/widget-kit/releases/tag/v3.0.0' },
        ],
        'Post the release to Discord': [{ id: '1200000000000000001', channel_id: '112233445566778899', content: '' }],
      },
      expect: { reached: ['Post the release to Discord', 'Remember the last release'], notReached: ['Load sample releases'], outward: 'some' },
      check: out => {
        const n = out['Find new releases'][0];
        const f: string[] = [];
        if (n.releases.length !== 1 || n.releases[0].tag !== 'v4.0.0-beta.1' || n.releases[0].kind !== 'major') f.push('only the v4 beta (major vs v3.0.1) should be posted');
        if (!n.skipped.some((s: string) => s.includes('v3.0.1 (patch)'))) f.push('patch should be skipped by ONLY_BUMPS');
        return f;
      },
    },
  ],
});
