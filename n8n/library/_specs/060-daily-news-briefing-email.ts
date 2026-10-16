import { defineSpec } from '../_kit/spec';
import { trigger, code, ifTrue, ifWhen, merge, stop, http, rss, aggregate, gmail } from '../_kit/n';

const cfg = (k: string) => `$('config').first().json.${k}`;

// A dead feed or a missing HN item should drop that one source, not your briefing.
const tolerant = <T extends { name: string }>(n: T) => ({ ...n, onError: 'continueRegularOutput' } as T);

export default defineSpec({
  slug: 'daily-news-briefing-email',
  title: 'Email a daily briefing from Hacker News and RSS on chosen topics',
  summary: 'Each morning pulls the Hacker News front page and your RSS feeds, scores every story against keyword topics, removes duplicates by URL and similar titles, keeps the top 5 per topic and emails one HTML briefing through Gmail.',
  category: 'Productivity and operations',
  description: {
    who: 'Founders, engineers and analysts who skim Hacker News and a handful of blogs every morning to keep up with a few topics. One email replaces a dozen open tabs.',
    how: [
      'Every weekday at 06:45 it reads the top 60 Hacker News stories and every feed in `FEEDS`, or a sample set until live reading is on.',
      'Stories older than 30 hours or matching an excluded word are dropped. The same link from two sources (tracking parameters ignored) or two titles sharing 60% of their words count once.',
      'Each story is scored per topic: 3 points for a keyword in the title, 1 in the summary, plus a bonus for HN points. It goes under its best topic only.',
      'The top 5 per topic are emailed as one HTML briefing with source, points and comment links.',
    ],
    setup: [
      'Run it once as imported. It builds a briefing from sample stories and stops at `STOP: preview - nothing sent`.',
      'Edit `TOPICS` and `FEEDS`, then set `USE_LIVE_SOURCES = true`. Neither Hacker News nor RSS needs a key.',
      'Connect Gmail to `Email your briefing` and set `BRIEFING_TO`.',
      'Put your address in `TEST_EMAIL` for a test copy, then set `TEST_RUN = false` for the daily send.',
    ],
    requirements: ['A Gmail account', 'At least one RSS feed you follow'],
    customize: [
      '`TOPICS` holds the keywords for each section of the email.',
      '`TOP_PER_TOPIC` and `MIN_SCORE` decide how much makes the cut.',
      '`EXCLUDE_KEYWORDS` drops stories you never want, whatever their score.',
    ],
  },
  config: {
    intro: ['USE_LIVE_SOURCES false -> SAMPLE stories from both sources.', 'Your briefing is emailed only when at least one story makes the cut.'],
    consts: [
      { name: 'USE_LIVE_SOURCES', value: false, note: 'set true to read Hacker News and FEEDS (both public)' },
      { name: 'HN_TOP_N', value: 60, note: 'front page stories read from Hacker News' },
      { name: 'FEEDS', value: ['https://blog.example.com/feed.xml', 'https://news.example.org/rss'], note: 'RSS or Atom feeds to include (at least one)' },
      { name: 'TOPICS', value: [
        { name: 'AI and LLMs', keywords: ['llm', 'gpt', 'openai', 'anthropic', 'claude', 'model', 'inference', 'agent', 'fine-tuning'] },
        { name: 'Developer tools', keywords: ['rust', 'postgres', 'sqlite', 'compiler', 'git', 'kubernetes', 'database', 'typescript', 'editor'] },
        { name: 'Startups and business', keywords: ['startup', 'funding', 'pricing', 'acquisition', 'revenue', 'founder', 'layoffs', 'ipo'] },
      ], note: 'sections of your briefing and the keywords that place a story in each' },
      { name: 'EXCLUDE_KEYWORDS', value: ['crypto', 'nft', 'sponsored'], note: 'stories mentioning these are dropped' },
      { name: 'TOP_PER_TOPIC', value: 5, note: 'stories per topic' },
      { name: 'MIN_SCORE', value: 3, note: 'a story needs at least this topic score to be included' },
      { name: 'MAX_AGE_HOURS', value: 30, note: 'stories older than this are dropped' },
      { name: 'BRIEFING_TO', value: 'you@yourcompany.example', note: 'who gets your briefing' },
    ],
    safety: 'test_run',
  },
  nodes: [
    trigger.manual(),
    trigger.schedule('Every weekday at 06:45', '45 6 * * 1-5'),
    ifWhen('Use sample stories?', [[cfg('use_live_sources'), 'false']]),
    code('Load sample stories', `
// Used until USE_LIVE_SOURCES is true. Already in the shape the scorer reads; it
// includes a cross-source duplicate, a near-duplicate title, an old story and an excluded one.
const h = n => new Date(Date.now() - n * 3600e3).toISOString();
const s = (source, title, url, hours, points, comments, summary = '', hn_id = '') => ({ source, title, url, published: h(hours), points, comments, summary, hn_id });
return [{ json: { stories: [
  s('hn', 'Running a 7B model on a laptop GPU: inference benchmarks', 'https://bench.example.net/7b-laptop', 5, 412, 188, '', '41100001'),
  s('hn', 'Postgres 18 adds asynchronous I/O', 'https://www.postgresql.example.org/about/news/pg18?utm_source=hn', 9, 655, 240, '', '41100002'),
  s('rss', 'Postgres 18 adds asynchronous I/O', 'https://postgresql.example.org/about/news/pg18/', 10, 0, 0, 'The release notes, with benchmarks for read-heavy workloads.'),
  s('hn', 'Show HN: A SQLite extension for vector search', 'https://github.example.com/acme/sqlite-vec-lite', 3, 120, 40, '', '41100003'),
  s('rss', 'How we cut our LLM inference bill by 60%', 'https://blog.example.com/llm-bill', 12, 0, 0, 'Batching, caching and a smaller model for 80% of requests.'),
  s('rss', 'How we cut our LLM inference costs by 60 percent', 'https://medium.example.com/llm-costs-60', 14, 0, 0, 'A repost of the same write-up.'),
  s('hn', 'Seed round pricing in 2026: what founders are seeing', 'https://news.example.org/seed-pricing', 7, 98, 77, '', '41100004'),
  s('hn', 'Crypto exchange launches new token', 'https://coins.example/token', 4, 300, 200, '', '41100005'),
  s('hn', 'A history of the typewriter', 'https://history.example/typewriter', 6, 250, 60, '', '41100006'),
  s('rss', 'Agent frameworks compared: five ways to call tools', 'https://blog.example.com/agents-compared', 20, 0, 0, 'We built the same agent five times.'),
  s('hn', 'Ask HN: What editor do you use for TypeScript in 2026?', '', 8, 140, 390, '', '41100007'),
  s('rss', 'The startup that sold for one dollar', 'https://news.example.org/one-dollar', 50, 0, 0, 'An acquisition story from last week.'),
] } }];`),
    http('Fetch Hacker News top stories', { url: 'https://hacker-news.firebaseio.com/v0/topstories.json', auth: 'none' }),
    code('Keep the first story ids', `
// topstories returns up to 500 ids, best first; keep HN_TOP_N.
const ids = $input.all().flatMap(i => Array.isArray(i.json) ? i.json : (i.json.data || Object.values(i.json)));
return ids.slice(0, $('config').first().json.hn_top_n).map(id => ({ json: { id } }));`),
    tolerant(http('Fetch each Hacker News story', { url: '={{ "https://hacker-news.firebaseio.com/v0/item/" + $json.id + ".json" }}', auth: 'none' })),
    aggregate('Collect Hacker News stories'),
    code('List RSS feeds', `
// One item per feed URL.
return $('config').first().json.feeds.map(url => ({ json: { url } }));`),
    tolerant(rss.read('Read each RSS feed', '$json.url')),
    code('Combine both sources', `
// HN items and RSS entries -> one list in the scorer's shape. Ask HN posts with
// no URL link to the discussion. Deleted, dead and non-story items are skipped.
const hn = ($('Collect Hacker News stories').first().json.data || []).filter(x => x && x.type === 'story' && !x.dead && !x.deleted && x.title)
  .map(x => ({ source: 'hn', title: x.title, url: x.url || '', published: new Date(x.time * 1000).toISOString(), points: x.score || 0, comments: x.descendants || 0, summary: '', hn_id: String(x.id) }));
const feed = $input.all().map(i => i.json).filter(x => x.title && x.link)
  .map(x => ({ source: 'rss', title: x.title, url: x.link, published: x.isoDate || x.pubDate || '', points: 0, comments: 0, summary: String(x.contentSnippet || '').slice(0, 280), hn_id: '' }));
return [{ json: { stories: [...hn, ...feed] } }];`),
    merge('Combine story sources'),
    code('Score and pick stories', `
// Drop old and excluded stories, dedupe by normalised URL and by title word
// overlap (Jaccard >= 0.6), score per topic, keep TOP_PER_TOPIC under each
// story's best topic. HN points add log2(points) as a tie breaker.
const cfg = $('config').first().json;
const stories = $input.first().json.stories;
const normUrl = u => { try { const x = new URL(u); [...x.searchParams.keys()].filter(k => /^(utm_|ref|fbclid|gclid)/.test(k)).forEach(k => x.searchParams.delete(k)); return (x.hostname.replace(/^www\\./, '') + x.pathname.replace(/\\/$/, '') + (x.search || '')).toLowerCase(); } catch (e) { return ''; } };
const words = t => new Set(t.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(' ').filter(w => w.length > 2));
const jacc = (a, b) => { const i = [...a].filter(w => b.has(w)).length; return i / (a.size + b.size - i || 1); };
const now = Date.now();
const kept = [], dropped = [];
for (const s of [...stories].sort((a, b) => b.points - a.points)) {
  const text = (s.title + ' ' + s.summary).toLowerCase();
  const age = (now - new Date(s.published).getTime()) / 3600e3;
  const u = normUrl(s.url), w = words(s.title);
  const reason = !s.published || age > cfg.max_age_hours ? 'too old' :
    cfg.exclude_keywords.some(k => text.includes(k)) ? 'excluded keyword' :
    (u && kept.some(k => k.nurl === u)) ? 'same link' :
    kept.some(k => jacc(k.words, w) >= 0.6) ? 'similar title' : '';
  if (reason) { dropped.push({ title: s.title, reason }); continue; }
  kept.push({ ...s, nurl: u, words: w });
}
const hit = (t, k) => new RegExp('(^|[^a-z0-9])' + k.replace(/[-]/g, '\\\\-') + '(s)?([^a-z0-9]|$)').test(t);
const sections = cfg.topics.map(t => ({ name: t.name, stories: [] }));
let unplaced = 0;
for (const s of kept) {
  const title = s.title.toLowerCase(), sum = s.summary.toLowerCase();
  const scores = cfg.topics.map(t => t.keywords.reduce((a, k) => a + (hit(title, k) ? 3 : 0) + (hit(sum, k) ? 1 : 0), 0));
  const best = scores.indexOf(Math.max(...scores));
  if (scores[best] < cfg.min_score) { unplaced++; continue; }
  const bonus = s.points > 0 ? Math.round(Math.log2(s.points) * 10) / 10 : 0;
  sections[best].stories.push({ title: s.title, url: s.url || 'https://news.ycombinator.com/item?id=' + s.hn_id, source: s.source === 'hn' ? 'Hacker News' : (s.url ? new URL(s.url).hostname.replace(/^www\\./, '') : 'RSS'),
    points: s.points, comments: s.comments, discussion: s.hn_id ? 'https://news.ycombinator.com/item?id=' + s.hn_id : '', summary: s.summary, score: scores[best] + bonus });
}
for (const sec of sections) sec.stories = sec.stories.sort((a, b) => b.score - a.score).slice(0, cfg.top_per_topic);
const total = sections.reduce((a, s) => a + s.stories.length, 0);
return [{ json: { sections: sections.filter(s => s.stories.length), total, dropped, unplaced, read: stories.length } }];`),
    code('Build your briefing email', `
// Plain HTML that renders in every mail client: one heading per topic, one line per story.
const cfg = $('config').first().json;
const b = $input.first().json;
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const day = new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const html = '<div style="font-family:Arial,sans-serif;max-width:640px">' + b.sections.map(sec => '<h2 style="font-size:16px;margin:20px 0 8px">' + esc(sec.name) + '</h2><ol style="padding-left:20px">' +
  sec.stories.map(s => '<li style="margin-bottom:8px"><a href="' + esc(s.url) + '">' + esc(s.title) + '</a><br><span style="color:#666;font-size:12px">' + esc(s.source) +
    (s.points ? ' | ' + s.points + ' points' : '') + (s.discussion ? ' | <a href="' + s.discussion + '">' + s.comments + ' comments</a>' : '') + '</span>' +
    (s.summary ? '<br><span style="font-size:13px">' + esc(s.summary) + '</span>' : '') + '</li>').join('') + '</ol>').join('') +
  '<p style="color:#888;font-size:12px">' + b.read + ' stories read, ' + b.dropped.length + ' dropped as old, excluded or duplicate, ' + b.unplaced + ' off-topic.</p></div>';
const subject = 'Briefing, ' + day + ': ' + b.total + ' stories across ' + b.sections.length + ' topics';
return [{ json: { subject, html, total: b.total, send_to: cfg.mode === 'test' ? cfg.test_email : cfg.briefing_to } }];`),
    ifWhen('Anything worth sending?', [['$json.total', 'gt', 0]]),
    stop('STOP: no stories made the cut'),
    ifTrue('Sending switched on?', cfg('sends_enabled')),
    stop('STOP: preview - nothing sent'),
    gmail.send('Email your briefing', { to: '$json.send_to', subject: "($('config').first().json.mode === 'test' ? '[TEST] ' : '') + $json.subject", message: '$json.html', html: true }),
  ],
  edges: [
    ['Run manually', 'config'], ['Every weekday at 06:45', 'config'],
    ['config', 'Use sample stories?'],
    ['Use sample stories?', 0, 'Load sample stories'], ['Use sample stories?', 1, 'Fetch Hacker News top stories'],
    ['Fetch Hacker News top stories', 'Keep the first story ids'], ['Keep the first story ids', 'Fetch each Hacker News story'],
    ['Fetch each Hacker News story', 'Collect Hacker News stories'], ['Collect Hacker News stories', 'List RSS feeds'],
    ['List RSS feeds', 'Read each RSS feed'], ['Read each RSS feed', 'Combine both sources'],
    ['Load sample stories', 'Combine story sources'], ['Combine both sources', 0, 'Combine story sources', 1],
    ['Combine story sources', 'Score and pick stories'],
    ['Score and pick stories', 'Build your briefing email'],
    ['Build your briefing email', 'Anything worth sending?'],
    ['Anything worth sending?', 0, 'Sending switched on?'], ['Anything worth sending?', 1, 'STOP: no stories made the cut'],
    ['Sending switched on?', 0, 'Email your briefing'], ['Sending switched on?', 1, 'STOP: preview - nothing sent'],
  ],
  groups: [
    { title: 'Start and settings', why: 'Runs every weekday at 06:45 so the email is waiting at breakfast. Topics, feeds, exclusions and the per-topic cap all sit in `config`.', nodes: ['Run manually', 'Every weekday at 06:45', 'config'] },
    { title: 'Read Hacker News and the feeds', why: 'Both sources are public, but they still wait for `USE_LIVE_SOURCES`. A missing HN item or a dead feed continues as an empty result, so one bad source never cancels your briefing. `Load sample stories` uses the merged shape directly.', nodes: ['Use sample stories?', 'Load sample stories', 'Fetch Hacker News top stories', 'Keep the first story ids', 'Fetch each Hacker News story', 'Collect Hacker News stories', 'List RSS feeds', 'Read each RSS feed', 'Combine both sources', 'Combine story sources'] },
    { title: 'Score, dedupe and pick', why: 'Stories are sorted by points before dedupe, so when HN and a feed carry the same link the HN copy with its discussion link wins. Each story lands under one topic only, its best match.', nodes: ['Score and pick stories', 'Build your briefing email', 'Anything worth sending?', 'STOP: no stories made the cut'] },
    { title: 'Send your briefing', why: 'Nothing is sent in preview. A test run sends one copy to `TEST_EMAIL`; a live run sends to `BRIEFING_TO`.', nodes: ['Sending switched on?', 'STOP: preview - nothing sent', 'Email your briefing'] },
  ],
  scenarios: [
    {
      name: 'shipped config (preview)', start: 'Run manually',
      expect: { reached: ['Load sample stories', 'STOP: preview - nothing sent'], notReached: ['Fetch Hacker News top stories'], outward: 'none' },
      check: out => {
        const f: string[] = [];
        const p = out['Score and pick stories'][0];
        const r = Object.fromEntries(p.dropped.map((d: any) => [d.title, d.reason]));
        if (r['Postgres 18 adds asynchronous I/O'] !== 'same link') f.push('RSS copy of the Postgres story not deduped by link');
        if (r['How we cut our LLM inference costs by 60 percent'] !== 'similar title') f.push('near-duplicate title not dropped');
        if (r['Crypto exchange launches new token'] !== 'excluded keyword') f.push('crypto story not excluded');
        if (r['The startup that sold for one dollar'] !== 'too old') f.push('50h-old story not dropped');
        const sec = Object.fromEntries(p.sections.map((s: any) => [s.name, s.stories.map((x: any) => x.title)]));
        if ((sec['AI and LLMs'] || []).length !== 3) f.push(`expected 3 AI stories, got ${JSON.stringify(sec['AI and LLMs'])}`);
        if (!(sec['Developer tools'] || []).includes('Ask HN: What editor do you use for TypeScript in 2026?')) f.push('Ask HN post missing from developer tools');
        if (p.unplaced !== 1) f.push(`typewriter story should be the only off-topic one, got ${p.unplaced}`);
        const pg = p.sections.flatMap((s: any) => s.stories).find((x: any) => x.title.startsWith('Postgres'));
        if (pg?.source !== 'Hacker News') f.push('dedupe should keep the HN copy');
        return f;
      },
    },
    {
      name: 'live sources and Gmail', start: 'Every weekday at 06:45',
      overrides: { USE_LIVE_SOURCES: true, TEST_RUN: false, FEEDS: ['https://blog.example.com/feed.xml'] },
      mocks: {
        'Fetch Hacker News top stories': [{ data: [9001, 9002, 9003] }],
        'Fetch each Hacker News story': (items: any[]) => items.map(i => i.id === 9003 ? { error: { message: 'Request failed with status code 404' } } : {
          id: i.id, type: 'story', by: 'pg_fan', time: Math.floor(Date.now() / 1000) - 3600, score: 200, descendants: 50,
          title: i.id === 9001 ? 'Rust compiler gets 20% faster builds' : 'New open model beats GPT on coding agent tasks', url: 'https://news.example.org/' + i.id }),
        'Read each RSS feed': [{ title: 'Pricing lessons from 40 startup founders', link: 'https://blog.example.com/pricing-lessons', isoDate: new Date(Date.now() - 7200e3).toISOString(), contentSnippet: 'What founders changed in their pricing this year.' }],
        'Email your briefing': [{ id: 'msg-1', labelIds: ['SENT'] }],
      },
      expect: { reached: ['Fetch each Hacker News story', 'Read each RSS feed', 'Email your briefing'], outward: 'some' },
      check: out => {
        const b = out['Build your briefing email'][0];
        return b.total === 3 && b.send_to === 'you@yourcompany.example' && b.subject.includes('3 stories across 3 topics') ? [] : [`live briefing wrong: ${b.subject} -> ${b.send_to}`];
      },
    },
  ],
});
