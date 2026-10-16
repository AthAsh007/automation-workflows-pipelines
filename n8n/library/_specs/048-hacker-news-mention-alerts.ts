import { defineSpec } from '../_kit/spec';
import { trigger, code, ifTrue, ifWhen, merge, stop, http, slack } from '../_kit/n';

const cfg = (k: string) => `$('config').first().json.${k}`;

export default defineSpec({
  slug: 'hacker-news-mention-alerts',
  title: 'Alert Slack on Hacker News mentions of your brand',
  summary: 'Searches Hacker News stories and comments through the public Algolia API every 30 minutes, keeps exact whole-word mentions of your keywords since the last check, drops exclusions, your own accounts and low-point stories, and posts each new mention to Slack with a snippet and links.',
  category: 'Marketing and content',
  description: {
    who: 'Founders, developer relations and support leads at products that get discussed on Hacker News. You hear about a thread while it is still on the front page instead of the next day.',
    how: [
      'Every 30 minutes it searches Hacker News stories and comments for each keyword in `KEYWORDS`, from the last check onward, through the free Algolia search API.',
      'Algolia matches prefixes, so each hit is checked again for the keyword as a whole word. Hits containing an exclusion term, posted by your own accounts, or stories under 3 points are dropped.',
      'A hit found by two keywords is posted once, and ids already alerted are skipped.',
      'One Slack message lists stories with points and comment counts, and comments with a 160-character snippet around the match.',
    ],
    setup: [
      'Run it once as imported. It filters sample search results and stops at `STOP: preview - nothing posted`.',
      'Set `KEYWORDS` to your brand and product names, `OWN_HN_USERS` to your team accounts, then set `USE_LIVE_SEARCH = true`.',
      'Connect Slack and set `SLACK_CHANNEL_ID`.',
      'Set `TEST_EMAIL` to any address to post with a [TEST] prefix, then set `TEST_RUN = false` so the checkpoint moves forward.',
    ],
    requirements: ['A Slack workspace', 'Nothing for Hacker News: the Algolia API is public'],
    customize: [
      '`EXCLUDE_TERMS` drops hits about something else with the same name.',
      '`MIN_STORY_POINTS` hides brand-new stories nobody has voted on; comments are always kept.',
      '`MAX_LOOKBACK_HOURS` limits how far back a run looks after a long pause.',
    ],
  },
  config: {
    intro: ['USE_LIVE_SEARCH false -> SAMPLE search results.', 'SLACK_CHANNEL_ID blank -> the alert is built but not posted.'],
    consts: [
      { name: 'USE_LIVE_SEARCH', value: false, note: 'set true to query hn.algolia.com (public, no key)' },
      { name: 'KEYWORDS', value: ['Fieldnote', 'fieldnote.example'], note: 'brand, product and domain names to watch' },
      { name: 'EXCLUDE_TERMS', value: ['notebook', 'moleskine'], note: 'a hit containing any of these is dropped (case-insensitive)' },
      { name: 'OWN_HN_USERS', value: ['fieldnote_team'], note: 'your own HN usernames; their posts are not alerts' },
      { name: 'MIN_STORY_POINTS', value: 3, note: 'stories below this score are skipped; comments are always kept' },
      { name: 'MAX_LOOKBACK_HOURS', value: 24, note: 'first run and long pauses look back at most this far' },
      { name: 'SLACK_CHANNEL_ID', value: '', note: 'channel for alerts; blank skips Slack' },
    ],
    flags: { slack_enabled: "SLACK_CHANNEL_ID.trim() !== ''" },
    safety: 'test_run',
  },
  nodes: [
    trigger.manual(),
    trigger.schedule('Every 30 minutes', '*/30 * * * *'),
    ifWhen('Use sample results?', [[cfg('use_live_search'), 'false']]),
    code('Load sample search results', `
// Used until USE_LIVE_SEARCH is true. The shape of Algolia search_by_date, one
// response per keyword, with a hit for every filter to act on.
const t = m => Math.floor(Date.now() / 1000) - m * 60;
const hit = (id, type, m, extra) => ({ objectID: String(id), created_at_i: t(m), created_at: new Date(t(m) * 1000).toISOString(), _tags: [type, 'author_' + extra.author], points: null, num_comments: null, ...extra });
return [
  { json: { query: 'Fieldnote', hits: [
    hit(41000101, 'story', 40, { title: 'Show HN: Fieldnote, a research log that writes itself', url: 'https://fieldnote.example', author: 'mira_k', points: 18, num_comments: 9 }),
    hit(41000102, 'comment', 25, { comment_text: 'We switched from a wiki to <i>Fieldnote</i> last quarter. Search is much better, but the export to Markdown still drops tables.', author: 'jdoe', story_id: 41000050, story_title: 'Ask HN: How do you keep research notes?' }),
    hit(41000103, 'comment', 20, { comment_text: 'I still prefer a paper Fieldnote notebook for this.', author: 'paperfan', story_id: 41000050, story_title: 'Ask HN: How do you keep research notes?' }),
    hit(41000104, 'comment', 15, { comment_text: 'Thanks for the feedback, the Fieldnote export fix ships next week.', author: 'fieldnote_team', story_id: 41000101, story_title: 'Show HN: Fieldnote, a research log that writes itself' }),
    hit(41000105, 'story', 10, { title: 'Fieldnote raises seed round', url: 'https://news.example/fieldnote-seed', author: 'newsbot', points: 1, num_comments: 0 }),
    hit(41000106, 'comment', 5, { comment_text: 'Fieldnotes are underrated for debugging.', author: 'ops_amy', story_id: 41000060, story_title: 'Debugging habits' }),
  ] } },
  { json: { query: 'fieldnote.example', hits: [
    hit(41000101, 'story', 40, { title: 'Show HN: Fieldnote, a research log that writes itself', url: 'https://fieldnote.example', author: 'mira_k', points: 18, num_comments: 9 }),
  ] } },
];`),
    code('List search keywords', `
// One item per keyword with the window start: the last checkpoint, but never
// further back than MAX_LOOKBACK_HOURS.
const cfg = $('config').first().json;
const last = Number($getWorkflowStaticData('global').last_ts || 0);
const floor = Math.floor(Date.now() / 1000) - cfg.max_lookback_hours * 3600;
const since = Math.max(last, floor);
return cfg.keywords.map(k => ({ json: { keyword: k, since } }));`),
    http('Search Hacker News', {
      url: 'https://hn.algolia.com/api/v1/search_by_date', auth: 'none',
      query: { query: '={{ $json.keyword }}', tags: '(story,comment)', numericFilters: '={{ "created_at_i>" + $json.since }}', hitsPerPage: '100' },
    }),
    merge('Combine search sources'),
    code('Pick mentions to alert', `
// Algolia matches prefixes and typos, so every hit is re-checked for the keyword
// as a whole word. Then exclusions, own accounts, story points and dedupe.
const cfg = $('config').first().json;
const alerted = new Set($getWorkflowStaticData('global').alerted || []);
const esc = s => s.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&');
const strip = h => String(h || '').replace(/<p>/g, ' ').replace(/<[^>]+>/g, '').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&').replace(/\\s+/g, ' ').trim();
const own = new Set(cfg.own_hn_users.map(u => u.toLowerCase()));
const mentions = [], dropped = [], ids = new Set();
let newest = 0;
for (const { json: res } of $input.all()) {
  const kw = res.query || '';
  const re = new RegExp('(^|[^a-z0-9])' + esc(kw.toLowerCase()) + '(?![a-z0-9])', 'i');
  for (const h of res.hits || []) {
    newest = Math.max(newest, h.created_at_i || 0);
    const isStory = (h._tags || []).includes('story');
    const text = isStory ? strip(h.title) + ' ' + (h.url || '') : strip(h.comment_text);
    const low = text.toLowerCase();
    const reason =
      ids.has(h.objectID) ? 'found by another keyword' :
      alerted.has(h.objectID) ? 'already alerted' :
      !re.test(text) ? 'no whole-word match' :
      cfg.exclude_terms.some(x => low.includes(x.toLowerCase())) ? 'exclusion term' :
      own.has(String(h.author).toLowerCase()) ? 'own account' :
      isStory && (h.points || 0) < cfg.min_story_points ? 'story under MIN_STORY_POINTS' : '';
    if (reason) { if (reason !== 'found by another keyword') dropped.push({ id: h.objectID, reason }); continue; }
    ids.add(h.objectID);
    let snippet = '';
    if (!isStory) {
      const at = low.search(re);
      const from = Math.max(0, at - 60);
      snippet = (from > 0 ? '...' : '') + text.slice(from, from + 160).trim() + (from + 160 < text.length ? '...' : '');
    }
    mentions.push({ id: h.objectID, type: isStory ? 'story' : 'comment', keyword: kw, author: h.author, created_at: h.created_at,
      title: isStory ? strip(h.title) : strip(h.story_title), url: h.url || '', points: h.points || 0, comments: h.num_comments || 0, snippet,
      hn_link: 'https://news.ycombinator.com/item?id=' + h.objectID, thread_link: 'https://news.ycombinator.com/item?id=' + (h.story_id || h.objectID) });
  }
}
mentions.sort((a, b) => (a.type === b.type ? 0 : a.type === 'story' ? -1 : 1) || b.points - a.points);
return [{ json: { mentions, dropped, newest } }];`),
    code('Format the Slack alert', `
// Stories first with score and comment count, then comments with their snippet.
const cfg = $('config').first().json;
const { mentions } = $input.first().json;
const lines = mentions.map(m => m.type === 'story'
  ? ':newspaper: *<' + m.hn_link + '|' + m.title + '>* (' + m.points + ' points, ' + m.comments + ' comments, by ' + m.author + ')'
  : ':speech_balloon: *' + m.author + '* on <' + m.thread_link + '|' + m.title + '>: "' + m.snippet + '" <' + m.hn_link + '|reply>');
const text = [(cfg.mode === 'test' ? '[TEST] ' : '') + '*Hacker News: ' + mentions.length + ' new mention' + (mentions.length === 1 ? '' : 's') + '*', ...lines].join('\\n');
return [{ json: { text, count: mentions.length } }];`),
    ifWhen('Any new mentions?', [['$json.count', 'gt', 0]]),
    stop('STOP: no new mentions'),
    ifTrue('Posting switched on?', cfg('sends_enabled')),
    stop('STOP: preview - nothing posted'),
    ifTrue('Slack channel set?', cfg('slack_enabled')),
    stop('STOP: no Slack channel'),
    slack.post('Post the mentions to Slack', cfg('slack_channel_id'), '$json.text'),
    ifTrue('Live run?', cfg('live')),
    stop('STOP: test post - checkpoint kept'),
    code('Move the checkpoint forward', `
// Live only: the next search starts at the newest hit seen, and alerted ids are
// kept (newest 1,000) so a hit edited later is not posted twice.
const store = $getWorkflowStaticData('global');
const picked = $('Pick mentions to alert').first().json;
store.last_ts = Math.max(Number(store.last_ts || 0), picked.newest);
store.alerted = [...picked.mentions.map(m => m.id), ...(store.alerted || [])].slice(0, 1000);
return [{ json: { last_ts: store.last_ts, alerted: picked.mentions.length } }];`),
  ],
  edges: [
    ['Run manually', 'config'], ['Every 30 minutes', 'config'],
    ['config', 'Use sample results?'],
    ['Use sample results?', 0, 'Load sample search results'], ['Use sample results?', 1, 'List search keywords'],
    ['List search keywords', 'Search Hacker News'],
    ['Load sample search results', 'Combine search sources'], ['Search Hacker News', 0, 'Combine search sources', 1],
    ['Combine search sources', 'Pick mentions to alert'],
    ['Pick mentions to alert', 'Format the Slack alert'],
    ['Format the Slack alert', 'Any new mentions?'],
    ['Any new mentions?', 0, 'Posting switched on?'], ['Any new mentions?', 1, 'STOP: no new mentions'],
    ['Posting switched on?', 0, 'Slack channel set?'], ['Posting switched on?', 1, 'STOP: preview - nothing posted'],
    ['Slack channel set?', 0, 'Post the mentions to Slack'], ['Slack channel set?', 1, 'STOP: no Slack channel'],
    ['Post the mentions to Slack', 'Live run?'],
    ['Live run?', 0, 'Move the checkpoint forward'], ['Live run?', 1, 'STOP: test post - checkpoint kept'],
  ],
  groups: [
    { title: 'Start and settings', why: 'Runs every 30 minutes or by hand. Keywords, exclusions, your own accounts and the points floor are constants in `config`.', nodes: ['Run manually', 'Every 30 minutes', 'config'] },
    { title: 'Search Hacker News', why: 'One Algolia query per keyword, filtered on created_at_i so only hits since the last checkpoint come back. `Load sample search results` returns the same shape, including the query field used to match hits to keywords.', nodes: ['Use sample results?', 'Load sample search results', 'List search keywords', 'Search Hacker News', 'Combine search sources'] },
    { title: 'Keep real mentions', why: 'Algolia prefix matching would alert on "Fieldnotes", so `Pick mentions to alert` re-checks each hit for the whole word before exclusions, own accounts and the story points floor.', nodes: ['Pick mentions to alert', 'Format the Slack alert', 'Any new mentions?', 'STOP: no new mentions'] },
    { title: 'Post and move the checkpoint', why: 'The checkpoint only moves after a live post. A preview or test run leaves it alone, so switching to live never skips the mentions you were testing with.', nodes: ['Posting switched on?', 'STOP: preview - nothing posted', 'Slack channel set?', 'STOP: no Slack channel', 'Post the mentions to Slack', 'Live run?', 'STOP: test post - checkpoint kept', 'Move the checkpoint forward'] },
  ],
  scenarios: [
    {
      name: 'shipped config (preview)', start: 'Run manually',
      expect: { reached: ['Load sample search results', 'STOP: preview - nothing posted'], notReached: ['Search Hacker News'], outward: 'none' },
      check: out => {
        const f: string[] = [];
        const p = out['Pick mentions to alert'][0];
        const ids = p.mentions.map((m: any) => m.id).join();
        if (ids !== '41000101,41000102') f.push(`expected story 41000101 then comment 41000102, got ${ids}`);
        const reasons = Object.fromEntries(p.dropped.map((d: any) => [d.id, d.reason]));
        if (reasons['41000103'] !== 'exclusion term') f.push('notebook comment not excluded');
        if (reasons['41000104'] !== 'own account') f.push('own account not dropped');
        if (reasons['41000105'] !== 'story under MIN_STORY_POINTS') f.push('1-point story not dropped');
        if (reasons['41000106'] !== 'no whole-word match') f.push('"Fieldnotes" should not match');
        const c = p.mentions.find((m: any) => m.id === '41000102');
        if (!c?.snippet.includes('Fieldnote last quarter')) f.push(`snippet missing match: ${c?.snippet}`);
        return f;
      },
    },
    {
      name: 'live search posts to Slack', start: 'Every 30 minutes',
      overrides: { USE_LIVE_SEARCH: true, TEST_RUN: false, SLACK_CHANNEL_ID: 'C0HNWATCH' },
      mocks: {
        'Search Hacker News': (items: any[]) => items.map(i => ({ query: i.keyword, hits: i.keyword === 'Fieldnote' ? [{ objectID: '42000001', _tags: ['comment'], created_at_i: Math.floor(Date.now() / 1000) - 300,
          comment_text: 'Has anyone tried Fieldnote for lab work? Curious about the API.', author: 'sci_dev', story_id: 42000000, story_title: 'Ask HN: Lab tools' }] : [] })),
        'Post the mentions to Slack': [{ ok: true }],
      },
      expect: { reached: ['Search Hacker News', 'Post the mentions to Slack', 'Move the checkpoint forward'], outward: 'some' },
      check: out => out['Format the Slack alert'][0].text.includes('*sci_dev* on <https://news.ycombinator.com/item?id=42000000|Ask HN: Lab tools>') ? [] : ['comment line not formatted with the thread link'],
    },
  ],
});
