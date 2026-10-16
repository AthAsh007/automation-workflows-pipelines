import { defineSpec } from '../_kit/spec';
import { trigger, code, ifTrue, ifWhen, merge, stop, http, splitOut, discord } from '../_kit/n';

const cfg = (k: string) => `$('config').first().json.${k}`;

export default defineSpec({
  slug: 'reddit-mention-alerts',
  title: 'Send Reddit mentions of your keywords to Discord',
  summary: 'Searches Reddit for each keyword every hour through the public JSON search, keeps whole-word matches from allowed subreddits that are new, safe for work and not yours, and posts them to a Discord channel in messages under the 2,000 character limit.',
  category: 'Marketing and content',
  description: {
    who: 'Community managers and indie founders who want to answer Reddit threads about their product, or their category, while the thread is still active. The alerts land in the Discord channel your team already watches.',
    how: [
      'Every hour it searches Reddit for each keyword in `KEYWORDS`, newest first, or uses sample results until live search is on.',
      'Each post is checked for the keyword as a whole word in the title or body. Posts from denied subreddits, NSFW posts, your own accounts and posts older than 24 hours are dropped. An allow list can limit alerts to chosen subreddits.',
      'Posts already alerted and posts found by two keywords are sent once.',
      'Mentions are packed into Discord messages of at most 1,900 characters, with subreddit, score, comment count and link.',
    ],
    setup: [
      'Run it once as imported. It filters sample results and stops at `STOP: preview - nothing posted`.',
      'Set `KEYWORDS`, `OWN_REDDIT_USERS` and `USER_AGENT` (Reddit asks for a descriptive one with your username), then set `USE_LIVE_SEARCH = true`.',
      'Add a Discord bot credential to `Post to Discord` and set `DISCORD_CHANNEL_ID`.',
      'Set `TEST_EMAIL` to any address to post with a [TEST] prefix, then set `TEST_RUN = false` so posted ids are remembered.',
    ],
    requirements: ['A Discord server with a bot that can post in the channel', 'Nothing for Reddit: public search JSON, no login'],
    customize: [
      '`ALLOW_SUBREDDITS` limits alerts to listed subreddits; `DENY_SUBREDDITS` blocks noisy ones.',
      '`MAX_AGE_HOURS` and `MIN_SCORE` control how fresh and how popular a post must be.',
      '`EXCLUDE_TERMS` drops posts about something else with the same name.',
    ],
  },
  config: {
    intro: ['USE_LIVE_SEARCH false -> SAMPLE Reddit results.', 'DISCORD_CHANNEL_ID blank -> messages are built but not posted.'],
    consts: [
      { name: 'USE_LIVE_SEARCH', value: false, note: 'set true to query reddit.com/search.json (public, no login)' },
      { name: 'KEYWORDS', value: ['Tallyroom', 'tallyroom.example'], note: 'words to search for; each is re-checked as a whole word' },
      { name: 'USER_AGENT', value: 'n8n:mention-alerts:v1.0 (by /u/your_username)', note: 'Reddit rejects requests without a descriptive User-Agent' },
      { name: 'ALLOW_SUBREDDITS', value: [], note: 'if not empty, only these subreddits are alerted (lowercase, no r/)' },
      { name: 'DENY_SUBREDDITS', value: ['memes', 'freekarma4u'], note: 'subreddits never alerted (lowercase, no r/)' },
      { name: 'EXCLUDE_TERMS', value: ['tally room booking'], note: 'a post containing any of these is dropped' },
      { name: 'OWN_REDDIT_USERS', value: ['tallyroom_hq'], note: 'your own accounts; their posts are not alerts' },
      { name: 'MAX_AGE_HOURS', value: 24, note: 'posts older than this are skipped' },
      { name: 'MIN_SCORE', value: 0, note: 'posts below this score are skipped (downvoted spam)' },
      { name: 'DISCORD_CHANNEL_ID', value: '', note: 'Discord channel id for alerts; blank skips Discord' },
    ],
    flags: { discord_enabled: "DISCORD_CHANNEL_ID.trim() !== ''" },
    safety: 'test_run',
  },
  nodes: [
    trigger.manual(),
    trigger.schedule('Every hour', '5 * * * *'),
    ifWhen('Use sample results?', [[cfg('use_live_search'), 'false']]),
    code('Load sample results', `
// Used until USE_LIVE_SEARCH is true. Reddit search listing shape, one response
// per keyword, with a post for each filter to catch.
const t = h => Math.floor(Date.now() / 1000) - h * 3600;
const post = (id, sub, h, title, selftext, author, score, extra = {}) => ({ kind: 't3', data: { id, name: 't3_' + id, subreddit: sub, title, selftext, author, score,
  num_comments: Math.max(0, score - 2), created_utc: t(h), permalink: '/r/' + sub + '/comments/' + id + '/', over_18: false, ...extra } });
return [
  { json: { keyword: 'Tallyroom', data: { children: [
    post('1abc01', 'SaaS', 2, 'Anyone using Tallyroom for shared expense tracking?', 'Looking at Tallyroom vs a spreadsheet for a 6 person team.', 'budget_ben', 14),
    post('1abc02', 'smallbusiness', 5, 'What do you use for team expenses?', 'We tried Tallyroom and two others, happy to share notes.', 'shopkeeper_li', 6),
    post('1abc03', 'memes', 1, 'Tallyroom meme', '', 'randomposter', 40),
    post('1abc04', 'SaaS', 3, 'Tallyroom pricing update', 'Here is what changed in our plans this month.', 'tallyroom_hq', 9),
    post('1abc05', 'travel', 6, 'Tally room booking question', 'Is the tally room booking still open at the venue? Tallyroom?', 'trip_kat', 2),
    post('1abc06', 'startups', 50, 'Tallyroom alternatives', 'Old thread.', 'old_thread', 30),
    post('1abc07', 'Entrepreneur', 4, 'Tallyrooms in coworking spaces', 'Do tallyrooms still exist?', 'cowork_dan', 3),
    post('1abc08', 'SaaS', 2, 'Tallyroom review', 'NSFW review', 'edgy', 5, { over_18: true }),
  ] } } },
  { json: { keyword: 'tallyroom.example', data: { children: [
    post('1abc01', 'SaaS', 2, 'Anyone using Tallyroom for shared expense tracking?', 'Looking at tallyroom.example vs a spreadsheet.', 'budget_ben', 14),
  ] } } },
];`),
    code('List search keywords', `
// One item per keyword. Quotes make Reddit search for the phrase.
return $('config').first().json.keywords.map(k => ({ json: { keyword: k, q: '"' + k + '"' } }));`),
    http('Search Reddit', {
      url: 'https://www.reddit.com/search.json', auth: 'none',
      query: { q: '={{ $json.q }}', sort: 'new', t: 'week', limit: '50', raw_json: '1' },
      headers: { 'User-Agent': `={{ ${cfg('user_agent')} }}` },
    }),
    merge('Combine search sources'),
    code('Pick mentions to post', `
// Reddit search is loose, so the keyword is re-checked as a whole word. Then the
// subreddit lists, NSFW, own accounts, age, score, exclusions and dedupe.
const cfg = $('config').first().json;
const posted = new Set($getWorkflowStaticData('global').posted || []);
let kws = [];
try { kws = $('List search keywords').all().map(i => i.json.keyword); } catch (e) { kws = []; }
const esc = s => s.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&');
const allow = cfg.allow_subreddits.map(s => s.toLowerCase()), deny = new Set(cfg.deny_subreddits.map(s => s.toLowerCase()));
const own = new Set(cfg.own_reddit_users.map(s => s.toLowerCase()));
const now = Date.now() / 1000;
const mentions = [], dropped = [], ids = new Set();
$input.all().forEach(({ json: res }, i) => {
  const kw = res.keyword || kws[i] || '';
  const re = new RegExp('(^|[^a-z0-9])' + esc(kw.toLowerCase()) + '(?![a-z0-9])', 'i');
  for (const { data: p } of res.data?.children || []) {
    const text = (p.title || '') + ' ' + (p.selftext || '');
    const sub = String(p.subreddit || '').toLowerCase();
    const ageH = (now - p.created_utc) / 3600;
    const reason =
      ids.has(p.id) ? 'dup' : posted.has(p.id) ? 'already posted' :
      !re.test(text) ? 'no whole-word match' :
      deny.has(sub) ? 'denied subreddit' :
      allow.length && !allow.includes(sub) ? 'not on ALLOW_SUBREDDITS' :
      p.over_18 ? 'NSFW' :
      own.has(String(p.author).toLowerCase()) ? 'own account' :
      ageH > cfg.max_age_hours ? 'older than MAX_AGE_HOURS' :
      (p.score || 0) < cfg.min_score ? 'below MIN_SCORE' :
      cfg.exclude_terms.some(x => text.toLowerCase().includes(x.toLowerCase())) ? 'exclusion term' : '';
    if (reason) { if (reason !== 'dup') dropped.push({ id: p.id, sub: p.subreddit, reason }); continue; }
    ids.add(p.id);
    mentions.push({ id: p.id, keyword: kw, subreddit: p.subreddit, title: p.title, author: p.author, score: p.score || 0,
      comments: p.num_comments || 0, age_h: Math.round(ageH), link: 'https://www.reddit.com' + p.permalink });
  }
});
mentions.sort((a, b) => a.age_h - b.age_h);
return [{ json: { mentions, dropped } }];`),
    code('Pack Discord messages', `
// Discord rejects messages over 2,000 characters, so lines are packed into
// messages of at most 1,900. Links are wrapped in <> to stop 10 embeds per message.
const cfg = $('config').first().json;
const { mentions } = $input.first().json;
const head = (cfg.mode === 'test' ? '[TEST] ' : '') + '**Reddit: ' + mentions.length + ' new mention' + (mentions.length === 1 ? '' : 's') + '**';
const lines = mentions.map(m => '- r/' + m.subreddit + ' | ' + m.title.slice(0, 140) + ' (' + m.score + ' pts, ' + m.comments + ' comments, ' + m.age_h + 'h ago) <' + m.link + '>');
const messages = []; let cur = head;
for (const l of lines) { if ((cur + '\\n' + l).length > 1900) { messages.push(cur); cur = l; } else cur += '\\n' + l; }
if (mentions.length) messages.push(cur);
return [{ json: { messages: messages.map(content => ({ content })), count: mentions.length } }];`),
    ifWhen('Any new mentions?', [['$json.count', 'gt', 0]]),
    stop('STOP: no new mentions'),
    ifTrue('Posting switched on?', cfg('sends_enabled')),
    stop('STOP: preview - nothing posted'),
    ifTrue('Discord channel set?', cfg('discord_enabled')),
    stop('STOP: no Discord channel'),
    splitOut('One item per message', 'messages'),
    discord.send('Post to Discord', cfg('discord_channel_id'), '$json.content'),
    ifTrue('Live run?', cfg('live')),
    stop('STOP: test post - ids not remembered'),
    code('Remember posted ids', `
// Live only. Newest 2,000 ids kept so the store stays small.
const store = $getWorkflowStaticData('global');
const ids = $('Pick mentions to post').first().json.mentions.map(m => m.id);
store.posted = [...ids, ...(store.posted || []).filter(x => !ids.includes(x))].slice(0, 2000);
return [{ json: { remembered: ids.length, messages: $input.all().length } }];`),
  ],
  edges: [
    ['Run manually', 'config'], ['Every hour', 'config'],
    ['config', 'Use sample results?'],
    ['Use sample results?', 0, 'Load sample results'], ['Use sample results?', 1, 'List search keywords'],
    ['List search keywords', 'Search Reddit'],
    ['Load sample results', 'Combine search sources'], ['Search Reddit', 0, 'Combine search sources', 1],
    ['Combine search sources', 'Pick mentions to post'],
    ['Pick mentions to post', 'Pack Discord messages'],
    ['Pack Discord messages', 'Any new mentions?'],
    ['Any new mentions?', 0, 'Posting switched on?'], ['Any new mentions?', 1, 'STOP: no new mentions'],
    ['Posting switched on?', 0, 'Discord channel set?'], ['Posting switched on?', 1, 'STOP: preview - nothing posted'],
    ['Discord channel set?', 0, 'One item per message'], ['Discord channel set?', 1, 'STOP: no Discord channel'],
    ['One item per message', 'Post to Discord'],
    ['Post to Discord', 'Live run?'],
    ['Live run?', 0, 'Remember posted ids'], ['Live run?', 1, 'STOP: test post - ids not remembered'],
  ],
  groups: [
    { title: 'Start and settings', why: 'Runs at 5 past every hour or by hand. Keywords, subreddit lists and the User-Agent Reddit requires are constants in `config`.', nodes: ['Run manually', 'Every hour', 'config'] },
    { title: 'Search Reddit', why: 'The public search.json endpoint needs no login, only a descriptive User-Agent header. `Load sample results` returns the same listing shape so every filter can be watched offline.', nodes: ['Use sample results?', 'Load sample results', 'List search keywords', 'Search Reddit', 'Combine search sources'] },
    { title: 'Filter and pack', why: 'Reddit search matches loosely, so `Pick mentions to post` re-checks the whole word before the subreddit, NSFW, age and score rules. `Pack Discord messages` keeps every message under the 2,000 character limit.', nodes: ['Pick mentions to post', 'Pack Discord messages', 'Any new mentions?', 'STOP: no new mentions'] },
    { title: 'Post to Discord', why: 'Nothing is posted in preview, and a blank channel ends at `STOP: no Discord channel`. Ids are remembered only after a live post, so test runs never hide a mention from the real channel.', nodes: ['Posting switched on?', 'STOP: preview - nothing posted', 'Discord channel set?', 'STOP: no Discord channel', 'One item per message', 'Post to Discord', 'Live run?', 'STOP: test post - ids not remembered', 'Remember posted ids'] },
  ],
  scenarios: [
    {
      name: 'shipped config (preview)', start: 'Run manually',
      expect: { reached: ['Load sample results', 'STOP: preview - nothing posted'], notReached: ['Search Reddit'], outward: 'none' },
      check: out => {
        const f: string[] = [];
        const p = out['Pick mentions to post'][0];
        if (p.mentions.map((m: any) => m.id).join() !== '1abc01,1abc02') f.push(`expected 1abc01,1abc02, got ${p.mentions.map((m: any) => m.id)}`);
        const r = Object.fromEntries(p.dropped.map((d: any) => [d.id, d.reason]));
        const want: Record<string, string> = { '1abc03': 'denied subreddit', '1abc04': 'own account', '1abc05': 'exclusion term', '1abc06': 'older than MAX_AGE_HOURS', '1abc07': 'no whole-word match', '1abc08': 'NSFW' };
        for (const [id, reason] of Object.entries(want)) if (r[id] !== reason) f.push(`${id}: expected "${reason}", got "${r[id]}"`);
        return f;
      },
    },
    {
      name: 'live search, many mentions split across messages', start: 'Every hour',
      overrides: { USE_LIVE_SEARCH: true, TEST_RUN: false, DISCORD_CHANNEL_ID: '112233445566778899', KEYWORDS: ['Tallyroom'] },
      mocks: {
        'Search Reddit': [{ kind: 'Listing', data: { children: Array.from({ length: 20 }, (_, i) => ({ kind: 't3', data: { id: 'live' + i, subreddit: 'SaaS',
          title: 'Thread ' + i + ' about Tallyroom and how teams split software costs across departments without a finance tool', selftext: '', author: 'user' + i, score: 3,
          num_comments: 1, created_utc: Math.floor(Date.now() / 1000) - 600, permalink: '/r/SaaS/comments/live' + i + '/', over_18: false } })) } }],
        'Post to Discord': (items: any[]) => items.map((_, i) => ({ id: 'msg' + i })),
      },
      expect: { reached: ['Search Reddit', 'Post to Discord', 'Remember posted ids'], outward: 'some' },
      check: out => {
        const msgs = out['Pack Discord messages'][0].messages;
        const f: string[] = [];
        if (msgs.length < 2) f.push(`20 long mentions should need 2+ messages, got ${msgs.length}`);
        if (msgs.some((m: any) => m.content.length > 1900)) f.push('a message is over 1900 chars');
        if (out['Remember posted ids'][0].remembered !== 20) f.push('all 20 ids should be remembered');
        return f;
      },
    },
  ],
});
