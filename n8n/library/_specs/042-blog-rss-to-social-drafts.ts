import { defineSpec } from '../_kit/spec';
import { trigger, code, ifTrue, ifWhen, merge, stop, splitOut, sheets, rss, aiAgent } from '../_kit/n';

const cfg = (k: string) => `$('config').first().json.${k}`;

export default defineSpec({
  slug: 'blog-rss-to-social-drafts',
  title: 'Turn new blog RSS posts into social post drafts in Google Sheets with OpenAI',
  summary: 'Reads your blog feed, picks posts it has not drafted before, writes a LinkedIn, X and Threads draft for each (OpenAI or a built-in template) inside each platform limit, books each draft into the next free posting slot for its platform (your posting days and hours, a minimum gap, slots already taken by earlier drafts), and appends them to a Google Sheets review tab.',
  category: 'Marketing and content',
  description: {
    who: 'Content marketers and founders who publish on a blog and then rewrite every post by hand for LinkedIn, X and Threads. The drafts land in a sheet so a person still approves each one before it goes out.',
    how: [
      'Every 3 hours it reads your blog RSS feed, or 5 sample posts until the feed is switched on.',
      'Posts already drafted, older than 14 days or missing a link are skipped, and at most 3 new posts are taken per run.',
      'Each post gets one draft per platform from OpenAI, or from a template that uses the title, the first two sentences and the link.',
      'Every draft is trimmed at a word boundary to the platform limit (X counts links as 23 characters), hashtags come from the post categories, and rows are appended to the Drafts tab with status "needs review".',
      'Each draft is booked into the next free slot for its platform: a day and hour from `POST_WINDOWS` in your `TIMEZONE`, at least `MIN_GAP_HOURS` from any other booked post on that platform, including drafts booked by earlier runs. LinkedIn gets one post a day, X can take several.',
    ],
    setup: [
      'Run it once as imported. It drafts the sample posts and stops at `STOP: dry run - sheet untouched`.',
      'Put your feed address in `FEED_URL` and set `USE_LIVE_FEED = true`.',
      'Connect Google Sheets and set `DRAFTS_SHEET_ID` to a sheet with a Drafts tab. Optionally add an OpenAI credential and set `USE_OPENAI = true`.',
      'Check the drafts in `Fit drafts to platform limits`, then set `DRY_RUN = false` so rows are written and posts are remembered.',
    ],
    requirements: ['A blog with an RSS or Atom feed', 'A Google Sheet with a Drafts tab', 'Optional: an OpenAI API key'],
    customize: [
      '`PLATFORMS` holds the character limit and hashtag count for each network. Remove one to stop drafting for it.',
      '`MAX_POSTS_PER_RUN` and `MAX_AGE_DAYS` control how much backlog one run picks up.',
      '`BLOCKED_HASHTAGS` drops categories such as "Uncategorized" that make poor tags.',
      '`POST_WINDOWS`, `MIN_GAP_HOURS` and `TIMEZONE` decide when each platform posts; `LEAD_HOURS` keeps the first slot far enough out for someone to review it.',
    ],
  },
  config: {
    intro: ['USE_LIVE_FEED false -> SAMPLE posts. USE_OPENAI false -> drafts come from the built-in template.', 'DRY_RUN true -> drafts are shown, nothing is appended and no post is marked as drafted.'],
    consts: [
      { name: 'USE_LIVE_FEED', value: false, note: 'set true to read FEED_URL instead of the sample posts' },
      { name: 'FEED_URL', value: 'https://blog.yourcompany.example/feed', note: 'your blog RSS or Atom feed' },
      { name: 'USE_OPENAI', value: false, note: 'set true after adding an OpenAI credential to the model node' },
      { name: 'DRAFTS_SHEET_ID', value: '', note: 'Google Sheets id with a Drafts tab; blank means nothing is written' },
      { name: 'PLATFORMS', value: { linkedin: { limit: 3000, hashtags: 3 }, x: { limit: 280, hashtags: 2 }, threads: { limit: 500, hashtags: 1 } }, note: 'one draft per platform: character limit and how many hashtags to add' },
      { name: 'MAX_POSTS_PER_RUN', value: 3, note: 'newest posts drafted per run; the rest wait for the next run' },
      { name: 'MAX_AGE_DAYS', value: 14, note: 'posts older than this are never drafted' },
      { name: 'BLOCKED_HASHTAGS', value: ['uncategorized', 'news', 'blog'], note: 'categories that never become hashtags (lowercase)' },
      { name: 'TIMEZONE', value: 'Europe/London', note: 'IANA time zone the posting hours are in' },
      { name: 'POST_WINDOWS', value: { linkedin: { days: [2, 3, 4], hours: [8, 12] }, x: { days: [1, 2, 3, 4, 5], hours: [9, 13, 17] }, threads: { days: [1, 2, 3, 4, 5, 6], hours: [11, 19] } }, note: 'per platform: weekdays (1 = Monday) and local hours a post may go out' },
      { name: 'MIN_GAP_HOURS', value: { linkedin: 24, x: 4, threads: 8 }, note: 'least time between two booked posts on the same platform' },
      { name: 'LEAD_HOURS', value: 4, note: 'no slot is booked sooner than this, so there is time to review' },
      { name: 'BRAND_VOICE', value: 'plain, specific, no hype, first person plural', note: 'tone hint given to OpenAI' },
    ],
    flags: { sheet_enabled: "DRAFTS_SHEET_ID.trim() !== ''" },
    safety: 'dry_run',
  },
  nodes: [
    trigger.manual(),
    trigger.schedule('Every 3 hours', '0 */3 * * *'),
    ifTrue('Live feed switched on?', cfg('use_live_feed')),
    rss.read('Read the blog feed', cfg('feed_url')),
    code('Load sample posts', `
// Used until USE_LIVE_FEED is true. Same fields the RSS node returns.
// One post is too old, one has no link, so the filters have something to do.
const ago = d => new Date(Date.now() - d * 864e5).toISOString();
return [
  { guid: 'post-118', title: 'Why we stopped sending onboarding emails on day one', link: 'https://blog.yourcompany.example/onboarding-day-one', isoDate: ago(1),
    contentSnippet: 'We moved the first onboarding email from minute zero to hour 20. Activation went from 31% to 38% over six weeks. Here is the test, the numbers and what we would change.', categories: ['Onboarding', 'Email Marketing', 'Uncategorized'] },
  { guid: 'post-117', title: 'A pricing page teardown: 9 changes in 30 days', link: 'https://blog.yourcompany.example/pricing-teardown', isoDate: ago(3),
    contentSnippet: 'We rewrote our pricing page nine times in a month. Three changes moved trial starts, six did nothing. This post lists all nine with screenshots.', categories: ['Pricing', 'Conversion'] },
  { guid: 'post-116', title: 'How a 4-person team runs support across 3 time zones', link: 'https://blog.yourcompany.example/support-time-zones', isoDate: ago(6),
    contentSnippet: 'Four people, three time zones and a 2 hour first response target. The handover note template we use is at the end.', categories: ['Customer Support', 'Remote Work'] },
  { guid: 'post-115', title: 'Changelog: September', link: '', isoDate: ago(8), contentSnippet: 'Small fixes and two new exports.', categories: ['News'] },
  { guid: 'post-109', title: 'What we learned from our first webinar', link: 'https://blog.yourcompany.example/first-webinar', isoDate: ago(40),
    contentSnippet: '212 people signed up and 64 showed up. The replay did better than the live session.', categories: ['Webinars'] },
].map(json => ({ json }));`),
    merge('Combine post sources'),
    code('Pick new posts', `
// Keeps posts with a link, younger than MAX_AGE_DAYS and not drafted before.
// "Drafted before" is the guid list in workflow static data, written only after
// a live append, so preview runs can be repeated as often as you like.
const cfg = $('config').first().json;
const seen = new Set(($getWorkflowStaticData('global').drafted || []));
const now = Date.now();
const posts = [], skipped = [], links = new Set();
for (const { json: p } of $input.all()) {
  const id = String(p.guid || p.id || p.link || p.title || '');
  const link = String(p.link || '').trim();
  const published = new Date(p.isoDate || p.pubDate || 0).getTime();
  const ageDays = Math.floor((now - published) / 864e5);
  const reason =
    !link ? 'no link' :
    seen.has(id) ? 'already drafted' :
    links.has(link) ? 'duplicate link in feed' :
    !published || ageDays > cfg.max_age_days ? 'older than MAX_AGE_DAYS' : '';
  if (reason) { skipped.push({ title: p.title, reason }); continue; }
  links.add(link);
  const text = String(p.contentSnippet || p.content || '').replace(/<[^>]+>/g, ' ').replace(/\\s+/g, ' ').trim();
  posts.push({ id, title: String(p.title || '').trim(), link, published: new Date(published).toISOString().slice(0, 10),
    summary: text.split(/(?<=[.!?])\\s+/).slice(0, 2).join(' '), categories: (p.categories || []).map(c => typeof c === 'string' ? c : c._ || c.term || '').filter(Boolean) });
}
posts.sort((a, b) => b.published.localeCompare(a.published));
for (const p of posts.slice(cfg.max_posts_per_run)) skipped.push({ title: p.title, reason: 'over MAX_POSTS_PER_RUN, next run' });
return [{ json: { posts: posts.slice(0, cfg.max_posts_per_run), skipped } }];`),
    ifWhen('Anything new to draft?', [['$json.posts.length', 'gt', 0]]),
    stop('STOP: no new posts'),
    splitOut('One item per post', 'posts'),
    ifWhen('Template drafts only?', [[cfg('use_openai'), 'false']]),
    aiAgent('Write drafts with OpenAI', {
      prompt: "{{ 'Title: ' + $json.title + '\\nSummary: ' + $json.summary + '\\nLink: ' + $json.link + '\\nVoice: ' + $('config').first().json.brand_voice + '\\nLimits: ' + JSON.stringify($('config').first().json.platforms) }}",
      system: 'You write social posts that announce a new blog post. One draft per platform. Lead with the most concrete fact or number in the summary. No hashtags, no emoji, no links in the text (they are added later). Keep each draft at least 40 characters under its limit.',
      schemaExample: { linkedin: 'Three-paragraph post...', x: 'One sentence...', threads: 'Two sentences...' },
    }),
    code('Read OpenAI drafts', `
// Agent output -> the same shape the template writes. A missing platform falls
// back to the title so the row is never empty.
const posts = $('One item per post').all();
return $input.all().map((it, i) => {
  const p = posts[i].json; const o = it.json.output || {};
  const body = {};
  for (const k of Object.keys($('config').first().json.platforms)) body[k] = String(o[k] || p.title).trim();
  return { json: { ...p, body, source: 'openai' } };
});`),
    code('Write drafts from template', `
// Deterministic drafts: hook from the title, facts from the first two sentences.
// LinkedIn gets room to breathe, X and Threads get the short version.
return $input.all().map(({ json: p }) => {
  const first = p.summary.split(/(?<=[.!?])\\s+/)[0] || '';
  return { json: { ...p, source: 'template', body: {
    linkedin: p.title + '\\n\\n' + p.summary + '\\n\\nThe full write-up is on the blog.',
    x: p.title + '. ' + first,
    threads: p.title + '\\n\\n' + first,
  } } };
});`),
    merge('Combine drafts'),
    code('Fit drafts to platform limits', `
// One row per post per platform. Adds the link and hashtags, then trims the body
// at a word boundary so body + link + tags fits the limit. X counts any URL as 23.
const cfg = $('config').first().json;
const blocked = new Set(cfg.blocked_hashtags);
const tag = c => '#' + c.replace(/&/g, 'and').split(/[^A-Za-z0-9]+/).filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join('');
const rows = [];
for (const { json: p } of $input.all()) {
  const tags = p.categories.filter(c => !blocked.has(c.toLowerCase())).map(tag).filter(t => t.length > 2);
  for (const [platform, rule] of Object.entries(cfg.platforms)) {
    const useTags = tags.slice(0, rule.hashtags);
    const linkLen = platform === 'x' ? 23 : p.link.length;
    const tail = '\\n\\n' + p.link + (useTags.length ? '\\n' + useTags.join(' ') : '');
    const tailLen = tail.length - p.link.length + linkLen;
    let body = String(p.body[platform] || '').trim();
    let trimmed = false;
    if (body.length + tailLen > rule.limit) {
      const room = rule.limit - tailLen - 3;
      body = body.slice(0, room).replace(/\\s+\\S*$/, '') + '...';
      trimmed = true;
    }
    const draft = body + tail;
    rows.push({ post_id: p.id, post_title: p.title, post_link: p.link, post_published: p.published, platform, draft,
      chars: body.length + tailLen, limit: rule.limit, hashtags: useTags.join(' '), source: p.source,
      trimmed, status: 'needs review', created_at: new Date().toISOString().slice(0, 16).replace('T', ' ') });
  }
}
return rows.map(json => ({ json }));`),
    code('Book posting slots', `
// Books every draft into the first free slot for its platform. Candidate times step
// hour by hour from now + LEAD_HOURS; a slot is free when its local weekday and hour
// (in TIMEZONE, so daylight saving is handled) are in POST_WINDOWS and it is at least
// MIN_GAP_HOURS from every slot already booked on that platform, by this run or by
// earlier runs. Newest post books first.
const cfg = $('config').first().json;
const booked = $getWorkflowStaticData('global').slots || {};
const fmt = new Intl.DateTimeFormat('en-US', { timeZone: cfg.timezone, weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' });
const local = t => Object.fromEntries(fmt.formatToParts(new Date(t)).map(p => [p.type, p.value]));
const DAY = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
const now = Date.now();
const taken = {};
for (const [p, list] of Object.entries(booked)) taken[p] = list.map(x => new Date(x).getTime()).filter(t => t > now);
const start = Math.ceil((now + cfg.lead_hours * 36e5) / 36e5) * 36e5;
const order = $input.all().map(i => i.json).sort((a, b) => String(b.post_published || '').localeCompare(String(a.post_published || '')));
const out = [];
for (const r of order) {
  const win = cfg.post_windows[r.platform];
  const gap = (cfg.min_gap_hours[r.platform] || 0) * 36e5;
  const list = (taken[r.platform] ||= []);
  let slot = null;
  for (let t = start; win && t < start + 21 * 864e5; t += 36e5) {
    const l = local(t);
    if (!win.days.includes(DAY[l.weekday]) || !win.hours.includes(Number(l.hour))) continue;
    if (list.some(b => Math.abs(b - t) < gap)) continue;
    slot = { t, label: l.year + '-' + l.month + '-' + l.day + ' ' + l.hour + ':00' };
    break;
  }
  if (slot) list.push(slot.t);
  out.push({ ...r, suggested_slot: slot ? slot.label + ' ' + cfg.timezone : 'no free slot in 21 days', slot_utc: slot ? new Date(slot.t).toISOString() : '' });
}
return out.map(json => ({ json }));`),
    ifWhen('Live and sheet set?', [[cfg('live'), 'true'], [cfg('sheet_enabled'), 'true']]),
    stop('STOP: dry run - sheet untouched'),
    sheets.append('Append drafts to the sheet', cfg('drafts_sheet_id'), 'Drafts'),
    code('Remember drafted posts', `
// Only after a successful append: store the guids so the next run skips them.
// The list is capped at 500 so static data never grows without limit. The booked
// slots are stored too, past ones dropped, so the next run books around them.
const store = $getWorkflowStaticData('global');
const slots = store.slots || {};
for (const r of $('Book posting slots').all()) if (r.json.slot_utc) (slots[r.json.platform] ||= []).push(r.json.slot_utc);
const nowIso = new Date().toISOString();
for (const p of Object.keys(slots)) slots[p] = [...new Set(slots[p])].filter(x => x > nowIso).sort();
store.slots = slots;
const ids = [...new Set($('Fit drafts to platform limits').all().map(r => r.json.post_id))];
store.drafted = [...ids, ...(store.drafted || []).filter(x => !ids.includes(x))].slice(0, 500);
return [{ json: { remembered: ids.length, total_remembered: store.drafted.length, rows_written: $input.all().length } }];`),
  ],
  edges: [
    ['Run manually', 'config'], ['Every 3 hours', 'config'],
    ['config', 'Live feed switched on?'],
    ['Live feed switched on?', 0, 'Read the blog feed'], ['Live feed switched on?', 1, 'Load sample posts'],
    ['Read the blog feed', 'Combine post sources'], ['Load sample posts', 0, 'Combine post sources', 1],
    ['Combine post sources', 'Pick new posts'],
    ['Pick new posts', 'Anything new to draft?'],
    ['Anything new to draft?', 0, 'One item per post'], ['Anything new to draft?', 1, 'STOP: no new posts'],
    ['One item per post', 'Template drafts only?'],
    ['Template drafts only?', 0, 'Write drafts from template'], ['Template drafts only?', 1, 'Write drafts with OpenAI'],
    ['Write drafts with OpenAI model', 'Write drafts with OpenAI', 'ai_languageModel'],
    ['Write drafts with OpenAI output format', 'Write drafts with OpenAI', 'ai_outputParser'],
    ['Write drafts with OpenAI', 'Read OpenAI drafts'],
    ['Write drafts from template', 'Combine drafts'], ['Read OpenAI drafts', 0, 'Combine drafts', 1],
    ['Combine drafts', 'Fit drafts to platform limits'],
    ['Fit drafts to platform limits', 'Book posting slots'],
    ['Book posting slots', 'Live and sheet set?'],
    ['Live and sheet set?', 0, 'Append drafts to the sheet'], ['Live and sheet set?', 1, 'STOP: dry run - sheet untouched'],
    ['Append drafts to the sheet', 'Remember drafted posts'],
  ],
  groups: [
    { title: 'Start and settings', why: 'Runs every 3 hours or by hand. Feed address, platform limits and the hashtag block list all sit in `config`, so nothing downstream needs editing.', nodes: ['Run manually', 'Every 3 hours', 'config'] },
    { title: 'Read the feed', why: '`Live feed switched on?` reads the real feed only once `USE_LIVE_FEED` is true. `Load sample posts` returns the same fields the RSS node does, so the rest of the run behaves identically offline.', nodes: ['Live feed switched on?', 'Read the blog feed', 'Load sample posts', 'Combine post sources'] },
    { title: 'Pick posts worth drafting', why: '`Pick new posts` drops posts with no link, old posts and guids already drafted, then caps the batch before any model call is made. An empty batch ends at `STOP: no new posts` instead of calling OpenAI with nothing.', nodes: ['Pick new posts', 'Anything new to draft?', 'STOP: no new posts', 'One item per post'] },
    { title: 'Write and fit the drafts', why: 'OpenAI is optional; the template path writes from the title and first two sentences. Both feed `Fit drafts to platform limits`, which enforces the character limit in code because a model does not count reliably.', nodes: ['Template drafts only?', 'Write drafts from template', 'Write drafts with OpenAI', 'Read OpenAI drafts', 'Combine drafts', 'Fit drafts to platform limits'] },
    { title: 'Book a slot per platform', why: '`Book posting slots` walks forward hour by hour in `TIMEZONE` and takes the first posting hour that keeps `MIN_GAP_HOURS` from every booked post, so three new posts become a spread-out queue, not three posts at 09:00.', nodes: ['Book posting slots'] },
    { title: 'Save for human review', why: 'Rows are appended only when `DRY_RUN` is false and a sheet id is set. `Remember drafted posts` runs after the append and stores the post ids and booked slots, so a failed write books nothing.', nodes: ['Live and sheet set?', 'STOP: dry run - sheet untouched', 'Append drafts to the sheet', 'Remember drafted posts'] },
  ],
  scenarios: [
    {
      name: 'shipped config (dry run, template drafts)', start: 'Run manually',
      expect: { reached: ['Load sample posts', 'Write drafts from template', 'STOP: dry run - sheet untouched'], notReached: ['Write drafts with OpenAI', 'Append drafts to the sheet'], outward: 'none' },
      check: out => {
        const f: string[] = [];
        const p = out['Pick new posts'][0];
        if (p.posts.length !== 3) f.push(`expected 3 posts picked, got ${p.posts.length}`);
        if (!p.skipped.some((s: any) => s.reason === 'no link')) f.push('post without link not skipped');
        if (!p.skipped.some((s: any) => s.reason === 'older than MAX_AGE_DAYS')) f.push('old post not skipped');
        const rows = out['Fit drafts to platform limits'];
        if (rows.length !== 9) f.push(`expected 9 draft rows (3 posts x 3 platforms), got ${rows.length}`);
        const over = rows.filter((r: any) => r.chars > r.limit);
        if (over.length) f.push(`${over.length} drafts over their limit`);
        const li = rows.find((r: any) => r.post_id === 'post-118' && r.platform === 'linkedin');
        if (!li || li.hashtags !== '#Onboarding #EmailMarketing') f.push(`blocked tag not dropped: ${li?.hashtags}`);
        const x = rows.find((r: any) => r.post_id === 'post-118' && r.platform === 'x');
        if (!x || x.hashtags.split(' ').length !== 2) f.push('X draft should carry 2 hashtags');
        const booked = out['Book posting slots'];
        if (booked.some((r: any) => !r.slot_utc)) f.push('every draft should get a slot');
        for (const p of ['linkedin', 'x', 'threads']) {
          const gap = ({ linkedin: 24, x: 4, threads: 8 } as any)[p] * 36e5;
          const ts = booked.filter((r: any) => r.platform === p).map((r: any) => new Date(r.slot_utc).getTime()).sort((a: number, b: number) => a - b);
          for (let i = 1; i < ts.length; i++) if (ts[i] - ts[i - 1] < gap) f.push(p + ' slots closer than MIN_GAP_HOURS');
        }
        const fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/London', weekday: 'short', hour: '2-digit', hourCycle: 'h23' });
        for (const r of booked.filter((r: any) => r.platform === 'linkedin')) {
          const l = fmt.formatToParts(new Date(r.slot_utc));
          const wd = l.find(x => x.type === 'weekday')!.value, h = Number(l.find(x => x.type === 'hour')!.value);
          if (!['Tue', 'Wed', 'Thu'].includes(wd) || ![8, 12].includes(h)) f.push('LinkedIn slot outside its window: ' + r.suggested_slot);
        }
        if (booked.some((r: any) => new Date(r.slot_utc).getTime() < Date.now() + 4 * 36e5)) f.push('slot booked inside LEAD_HOURS');
        if (booked[0]?.post_id !== 'post-118') f.push('newest post should book first');
        return f;
      },
    },
    {
      name: 'live feed, OpenAI and sheet write', start: 'Every 3 hours',
      overrides: { USE_LIVE_FEED: true, USE_OPENAI: true, DRY_RUN: false, DRAFTS_SHEET_ID: '1AbCdEfGhIjKlMnOp' },
      mocks: {
        'Read the blog feed': [
          { guid: 'https://blog.yourcompany.example/?p=201', title: 'Five onboarding emails we deleted', link: 'https://blog.yourcompany.example/deleted-emails',
            isoDate: new Date(Date.now() - 2 * 3600e3).toISOString(), contentSnippet: 'We cut our onboarding sequence from 9 emails to 4. Unsubscribes fell by half.', categories: ['Email Marketing'] },
        ],
        'Write drafts with OpenAI': (items: any[]) => items.map(() => ({ output: {
          linkedin: 'We cut our onboarding sequence from 9 emails to 4 and unsubscribes fell by half. ' + 'Here is what each deleted email was supposed to do and why it did not. '.repeat(60),
          x: 'We deleted 5 of our 9 onboarding emails. Unsubscribes halved.', threads: 'Nine onboarding emails became four. Unsubscribes fell by half.' } })),
        'Append drafts to the sheet': (items: any[]) => items,
      },
      expect: { reached: ['Write drafts with OpenAI', 'Append drafts to the sheet', 'Remember drafted posts'], outward: 'some' },
      check: out => {
        const f: string[] = [];
        const rows = out['Fit drafts to platform limits'];
        const li = rows.find((r: any) => r.platform === 'linkedin');
        if (!li?.trimmed || li.chars > 3000) f.push('long LinkedIn draft was not trimmed to 3000');
        if (!rows.every((r: any) => r.source === 'openai')) f.push('rows should be marked openai');
        if (out['Remember drafted posts'][0]?.remembered !== 1) f.push('post not remembered after append');
        if (!out['Append drafts to the sheet'].every((r: any) => r.suggested_slot && r.slot_utc)) f.push('rows written without a slot');
        return f;
      },
    },
  ],
});
