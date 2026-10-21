import { defineSpec } from '../_kit/spec';
import { trigger, code, ifWhen, merge, stop, http, splitOut, sheets, aiAgent } from '../_kit/n';

const cfg = (k: string) => `$('config').first().json.${k}`;

const feedXml = `
// Used until USE_LIVE_FEED is true. The same Atom XML YouTube serves at
// /feeds/videos.xml, with one Short and one old upload for the filters.
const ago = d => new Date(Date.now() - d * 864e5).toISOString();
const entry = (id, title, days, desc, views) => '<entry><id>yt:video:' + id + '</id><yt:videoId>' + id + '</yt:videoId><yt:channelId>UCsample000000000000000</yt:channelId>' +
  '<title>' + title + '</title><link rel="alternate" href="https://www.youtube.com/watch?v=' + id + '"/><author><name>Fieldnote Studio</name></author>' +
  '<published>' + ago(days) + '</published><media:group><media:title>' + title + '</media:title><media:thumbnail url="https://i.ytimg.example/vi/' + id + '/hqdefault.jpg" width="480" height="360"/>' +
  '<media:description>' + desc + '</media:description><media:community><media:statistics views="' + views + '"/></media:community></media:group></entry>';
const xml = '<?xml version="1.0" encoding="UTF-8"?><feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/" xmlns="http://www.w3.org/2005/Atom"><title>Fieldnote Studio</title>' +
  entry('vSample0001', 'We rebuilt our onboarding in 30 days &amp; here is what changed', 1,
    'Our trial-to-paid rate went from 9% to 14% after we cut the setup checklist from 12 steps to 5. In this video we walk through each step we removed and why.\\n\\n00:00 Intro\\n02:15 The old checklist\\nThis video is sponsored by Example Hosting, use code FIELD10\\nhttps://fieldnote.example/checklist', 1840) +
  entry('vSample0002', 'Pricing page teardown: 3 SaaS examples', 3,
    'Three pricing pages, three different jobs. We look at anchor plans, annual toggles and what the free tier is really for.\\nSubscribe for weekly teardowns!', 920) +
  entry('vSample0005', 'Three onboarding emails we deleted', 1,
    'We cut three of our nine onboarding emails and unsubscribes fell by a third. Here is what each one was meant to do.', 310) +
  entry('vSample0003', 'One tip for faster support replies #shorts', 2, 'Save replies as snippets. #shorts', 15400) +
  entry('vSample0004', 'How we plan a quarter on one page', 21, 'Our one page quarterly plan, line by line.', 3100) +
  '</feed>';
return [{ json: { data: xml, channel_id: 'UCsample000000000000000' } }];`;

export default defineSpec({
  slug: 'youtube-uploads-to-newsletter',
  title: 'Turn new YouTube uploads into newsletter blurbs in Google Sheets with OpenAI',
  summary: 'Reads the public YouTube feed of one or more channels, skips Shorts and old uploads, writes a newsletter blurb (OpenAI or from the description) only for videos not used before, ranks each week\'s videos by views per hour into lead, feature and also slots, re-ranks them daily, and upserts them into a Google Sheets tab. A dead channel feed is reported, and the run fails if every feed fails.',
  category: 'Marketing and content',
  description: {
    who: 'Creators and small media teams who send a weekly newsletter and copy their latest YouTube videos into it by hand. The blurbs are ready in a sheet by the time you sit down to write.',
    how: [
      'Every morning it reads the YouTube feed for each channel in `CHANNEL_IDS` (no API key needed), or a sample feed until it is switched on.',
      'A channel whose feed fails is listed in `failed_channels`; if every feed fails the run stops with an error instead of finishing quietly with nothing.',
      'Shorts and videos older than 7 days are skipped. Videos not used before get a blurb of up to 280 characters from OpenAI, or from the first two sentences of the description with timestamps, links and sponsor lines removed.',
      'Every eligible video, new or already in the sheet, is ranked inside its newsletter week (Monday date) by views per hour since publishing, so a 2-day-old video is not beaten by age alone. Rank 1 is the lead, up to `ISSUE_SIZE` are features, the rest are "also".',
      'Rows are upserted on video_id: new videos get the full row, known ones only get fresh views, rank and slot, so the order is current on the day you write the issue.',
    ],
    setup: [
      'Run it once as imported. It writes blurbs for the sample feed and stops at `STOP: dry run - sheet untouched`.',
      'Put your channel id (starts with UC, found on the channel page) in `CHANNEL_IDS` and set `USE_LIVE_FEED = true`.',
      'Connect Google Sheets and set `NEWSLETTER_SHEET_ID` to a sheet whose Newsletter tab has a video_id column. Optionally add an OpenAI credential and set `USE_OPENAI = true`.',
      'Read the blurbs and slots in `Rank by views per hour`, then set `DRY_RUN = false`.',
    ],
    requirements: ['A YouTube channel', 'A Google Sheet with a Newsletter tab', 'Optional: an OpenAI API key'],
    customize: [
      '`ISSUE_SIZE` sets how many videos per week are lead or feature; `MIN_RANK_HOURS` stops a video posted an hour ago from topping the list on a lucky start.',
      '`BLURB_MAX_CHARS` sets the blurb length; `MAX_AGE_DAYS` how far back a video can be.',
      '`DROP_LINE_WORDS` lists words that remove a description line from the template blurb.',
      '`SKIP_SHORTS` set to false keeps Shorts in.',
    ],
  },
  config: {
    intro: ['USE_LIVE_FEED false -> SAMPLE feed. USE_OPENAI false -> blurbs come from the video description.', 'DRY_RUN true -> blurbs are shown, nothing is appended, no video is marked as used.'],
    consts: [
      { name: 'USE_LIVE_FEED', value: false, note: 'set true to read the public YouTube feeds for CHANNEL_IDS' },
      { name: 'CHANNEL_IDS', value: ['UCxxxxxxxxxxxxxxxxxxxxxx'], note: 'YouTube channel ids (start with UC)' },
      { name: 'USE_OPENAI', value: false, note: 'set true after adding an OpenAI credential to the model node' },
      { name: 'NEWSLETTER_SHEET_ID', value: '', note: 'Google Sheets id with a Newsletter tab; blank means nothing is written' },
      { name: 'MAX_AGE_DAYS', value: 7, note: 'only videos published in this many days are used' },
      { name: 'SKIP_SHORTS', value: true, note: 'drop videos tagged #shorts' },
      { name: 'BLURB_MAX_CHARS', value: 280, note: 'longest blurb, cut at a word boundary' },
      { name: 'ISSUE_SIZE', value: 4, note: 'videos per week marked lead (rank 1) or feature; the rest are marked also' },
      { name: 'MIN_RANK_HOURS', value: 12, note: 'views per hour are divided by at least this many hours' },
      { name: 'DROP_LINE_WORDS', value: ['sponsor', 'use code', 'affiliate', 'subscribe', 'patreon', 'merch', 'http'], note: 'description lines containing these are left out of template blurbs' },
    ],
    flags: { sheet_enabled: "NEWSLETTER_SHEET_ID.trim() !== ''" },
    safety: 'dry_run',
  },
  nodes: [
    trigger.manual(),
    trigger.schedule('Every day at 06:30', '30 6 * * *'),
    ifWhen('Use the sample feed?', [[cfg('use_live_feed'), 'false']]),
    code('Load sample feed', feedXml),
    code('List channel feeds', `
// One item per channel so the HTTP node fetches each feed.
return $('config').first().json.channel_ids.map(id => ({ json: { channel_id: id } }));`),
    http('Fetch the channel feed', { url: 'https://www.youtube.com/feeds/videos.xml', auth: 'none', query: { channel_id: '={{ $json.channel_id }}' }, continueOnError: true }),
    merge('Combine feed sources'),
    code('Pick new videos', `
// Parses the Atom XML (YouTube puts the description in media:description, which
// generic RSS readers drop), then filters Shorts and old videos. Used ids are not
// dropped: they flow on with needs_blurb false and are re-ranked with today's
// view count, they just do not get a second blurb. A feed that failed is reported; all failed = error.
const cfg = $('config').first().json;
const used = new Set($getWorkflowStaticData('global').used || []);
let listed = [];
try { listed = $('List channel feeds').all().map(i => i.json.channel_id); } catch (e) { listed = []; }
const failed_channels = [];
const items = $input.all();
items.forEach(({ json }, i) => { if (typeof json.data !== 'string' || !json.data.includes('<entry')) failed_channels.push({ channel_id: json.channel_id || listed[i] || 'unknown', error: json.error ? String(json.error.message || json.error).slice(0, 120) : 'no entries in feed' }); });
if (items.length && failed_channels.length === items.length) throw new Error('Every channel feed failed: ' + failed_channels.map(f => f.channel_id + ' (' + f.error + ')').join(', '));
const dec = s => String(s || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const tag = (x, t) => { const m = x.match(new RegExp('<' + t + '[^>]*>([\\\\s\\\\S]*?)</' + t + '>')); return m ? dec(m[1]).trim() : ''; };
const attr = (x, t, a) => { const m = x.match(new RegExp('<' + t + '[^>]*' + a + '="([^"]*)"')); return m ? m[1] : ''; };
const videos = [], skipped = [], seenNow = new Set();
for (const { json } of $input.all()) {
  const xml = typeof json.data === 'string' ? json.data : '';
  const channel = tag(xml.split('<entry>')[0], 'title');
  for (const e of xml.split('<entry>').slice(1)) {
    const id = tag(e, 'yt:videoId'), title = tag(e, 'title'), description = tag(e, 'media:description');
    const published = tag(e, 'published');
    const age = (Date.now() - new Date(published).getTime()) / 864e5;
    const reason = seenNow.has(id) ? 'duplicate in feeds' :
      cfg.skip_shorts && /#shorts?\\b/i.test(title + ' ' + description) ? 'Short' :
      age > cfg.max_age_days ? 'older than MAX_AGE_DAYS' : '';
    if (reason) { skipped.push({ title, reason }); continue; }
    seenNow.add(id);
    const views = Number(attr(e, 'media:statistics', 'views') || 0);
    const needs_blurb = !used.has(id);
    if (!needs_blurb) skipped.push({ title, reason: 'already used, re-ranked only' });
    videos.push({ video_id: id, title, channel, url: 'https://www.youtube.com/watch?v=' + id, published: published.slice(0, 10), published_at: published,
      thumbnail: attr(e, 'media:thumbnail', 'url'), views, description, needs_blurb });
  }
}
videos.sort((a, b) => b.published.localeCompare(a.published));
return [{ json: { videos, new_videos: videos.filter(v => v.needs_blurb).length, skipped, failed_channels } }];`),
    ifWhen('Anything to add or re-rank?', [['$json.videos.length', 'gt', 0]]),
    stop('STOP: nothing to add or re-rank'),
    splitOut('One item per video', 'videos'),
    ifWhen('Template blurbs only?', [[cfg('use_openai'), 'false'], ['$json.needs_blurb', 'false']], 'or'),
    code('Write blurbs from the description', `
// Keeps the description lines a reader cares about: no timestamps, links, hashtags
// or sponsor reads. Two sentences, then cut to BLURB_MAX_CHARS at a word boundary.
const cfg = $('config').first().json;
const drop = cfg.drop_line_words;
// Videos already in the sheet (needs_blurb false) pass straight through, so
// OpenAI is never called for them.
return $input.all().map(({ json: v }) => {
  if (!v.needs_blurb) return { json: v };
  const lines = v.description.split(/\\n+/).map(l => l.trim()).filter(l => l &&
    !/^\\d{1,2}:\\d{2}/.test(l) && !l.startsWith('#') && !drop.some(w => l.toLowerCase().includes(w)));
  const sentences = lines.join(' ').split(/(?<=[.!?])\\s+/).slice(0, 2).join(' ');
  return { json: { ...v, blurb_raw: sentences || 'New video: ' + v.title + '.', source: 'template' } };
});`),
    aiAgent('Write blurbs with OpenAI', {
      prompt: "{{ 'Video title: ' + $json.title + '\\nDescription:\\n' + $json.description.slice(0, 2000) + '\\nMax characters: ' + $('config').first().json.blurb_max_chars }}",
      system: 'You write one newsletter blurb for a YouTube video. Say what the viewer learns, using a number or concrete detail from the description when there is one. Ignore sponsor reads, timestamps and calls to subscribe. No emoji, no hashtags, no "in this video". Stay under the character limit.',
      schemaExample: { blurb: 'Two sentences about what the viewer learns.' },
    }),
    code('Read OpenAI blurbs', `
// Agent output -> same shape as the template path. An empty answer falls back to the title.
// The items sent to OpenAI are the false branch of the IF, in the same order.
const videos = $('Template blurbs only?').all(1);
return $input.all().map((it, i) => ({ json: { ...videos[i].json, blurb_raw: String(it.json.output?.blurb || 'New video: ' + videos[i].json.title + '.').trim(), source: 'openai' } }));`),
    merge('Combine blurbs'),
    code('Collect the week\'s blurbs', `
// Cuts every blurb to BLURB_MAX_CHARS and tags it with the newsletter week (the
// Monday of the publish week), so a week's rows group together in the sheet.
const cfg = $('config').first().json;
const monday = iso => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); };
const cut = s => s.length <= cfg.blurb_max_chars ? s : s.slice(0, cfg.blurb_max_chars - 3).replace(/\\s+\\S*$/, '') + '...';
// Videos already in the sheet keep only the fields the ranking needs.
return $input.all().map(({ json: v }) => ({ json: v.needs_blurb ? {
  week: monday(v.published), video_id: v.video_id, title: v.title, url: v.url, thumbnail: v.thumbnail, published: v.published, published_at: v.published_at,
  views: v.views, blurb: cut(v.blurb_raw), source: v.source, added_at: new Date().toISOString().slice(0, 10), needs_blurb: true,
} : { week: monday(v.published), video_id: v.video_id, published_at: v.published_at, views: v.views, needs_blurb: false } }));`),
    code('Rank by views per hour', `
// Ranks every eligible video inside its newsletter week by views per hour since
// publishing (hours floored at MIN_RANK_HOURS), because raw views always favour
// the oldest upload. Rank 1 = lead, up to ISSUE_SIZE = feature, the rest = also.
// New videos carry their full row; videos already in the sheet only carry the
// columns that change, so the upsert leaves their blurb alone.
const cfg = $('config').first().json;
const now = Date.now();
const scored = $input.all().map(({ json: v }) => {
  const hours = Math.max(cfg.min_rank_hours, (now - new Date(v.published_at).getTime()) / 36e5);
  return { ...v, views_per_hour: Math.round(v.views / hours * 10) / 10 };
});
const byWeek = {};
for (const v of scored) (byWeek[v.week] ||= []).push(v);
const ranked_at = new Date().toISOString().slice(0, 16).replace('T', ' ');
const rows = [];
for (const list of Object.values(byWeek)) {
  list.sort((a, b) => b.views_per_hour - a.views_per_hour || b.views - a.views);
  list.forEach((v, i) => {
    const rank = i + 1, slot = rank === 1 ? 'lead' : rank <= cfg.issue_size ? 'feature' : 'also';
    const { needs_blurb, published_at, ...row } = v;
    rows.push({ ...row, rank, slot, ranked_at, is_new: needs_blurb });
  });
}
rows.sort((a, b) => b.week.localeCompare(a.week) || a.rank - b.rank);
return rows.map(json => ({ json }));`),
    ifWhen('Live and sheet set?', [[cfg('live'), 'true'], [cfg('sheet_enabled'), 'true']]),
    stop('STOP: dry run - sheet untouched'),
    sheets.upsert('Upsert rows in the newsletter sheet', cfg('newsletter_sheet_id'), 'Newsletter', 'video_id'),
    code('Remember used videos', `
// After a successful upsert only, so a failed write is retried tomorrow. Only
// videos that got a blurb are marked used. Newest 500 kept.
const store = $getWorkflowStaticData('global');
const ranked = $('Rank by views per hour').all().map(r => r.json);
const ids = ranked.filter(r => r.is_new).map(r => r.video_id);
store.used = [...ids, ...(store.used || []).filter(x => !ids.includes(x))].slice(0, 500);
return [{ json: { remembered: ids.length, reranked: ranked.length - ids.length, failed_channels: $('Pick new videos').first().json.failed_channels } }];`),
  ],
  edges: [
    ['Run manually', 'config'], ['Every day at 06:30', 'config'],
    ['config', 'Use the sample feed?'],
    ['Use the sample feed?', 0, 'Load sample feed'], ['Use the sample feed?', 1, 'List channel feeds'],
    ['List channel feeds', 'Fetch the channel feed'],
    ['Load sample feed', 'Combine feed sources'], ['Fetch the channel feed', 0, 'Combine feed sources', 1],
    ['Combine feed sources', 'Pick new videos'],
    ['Pick new videos', 'Anything to add or re-rank?'],
    ['Anything to add or re-rank?', 0, 'One item per video'], ['Anything to add or re-rank?', 1, 'STOP: nothing to add or re-rank'],
    ['One item per video', 'Template blurbs only?'],
    ['Template blurbs only?', 0, 'Write blurbs from the description'], ['Template blurbs only?', 1, 'Write blurbs with OpenAI'],
    ['Write blurbs with OpenAI model', 'Write blurbs with OpenAI', 'ai_languageModel'],
    ['Write blurbs with OpenAI output format', 'Write blurbs with OpenAI', 'ai_outputParser'],
    ['Write blurbs with OpenAI', 'Read OpenAI blurbs'],
    ['Write blurbs from the description', 'Combine blurbs'], ['Read OpenAI blurbs', 0, 'Combine blurbs', 1],
    ['Combine blurbs', 'Collect the week\'s blurbs'],
    ['Collect the week\'s blurbs', 'Rank by views per hour'],
    ['Rank by views per hour', 'Live and sheet set?'],
    ['Live and sheet set?', 0, 'Upsert rows in the newsletter sheet'], ['Live and sheet set?', 1, 'STOP: dry run - sheet untouched'],
    ['Upsert rows in the newsletter sheet', 'Remember used videos'],
  ],
  groups: [
    { title: 'Start and settings', why: 'Runs every morning at 06:30 or by hand. Channels, age limit, blurb length and the sponsor-line words are constants in `config`.', nodes: ['Run manually', 'Every day at 06:30', 'config'] },
    { title: 'Read the channel feeds', why: 'YouTube serves a public Atom feed per channel, so no API key or quota is involved. A failed feed continues as an error item so one dead channel cannot hide the others. `Load sample feed` returns the same XML.', nodes: ['Use the sample feed?', 'Load sample feed', 'List channel feeds', 'Fetch the channel feed', 'Combine feed sources'] },
    { title: 'Pick videos for the newsletter', why: '`Pick new videos` parses the XML itself because generic feed readers drop the description, and throws when every feed failed. Used videos stay in the batch with needs_blurb false, so a quiet day still refreshes the ranking.', nodes: ['Pick new videos', 'Anything to add or re-rank?', 'STOP: nothing to add or re-rank', 'One item per video'] },
    { title: 'Write the blurbs', why: 'The template path is the default and removes timestamps, links and sponsor reads line by line; videos already in the sheet pass through it untouched. OpenAI is optional, and both paths are cut to `BLURB_MAX_CHARS` in code afterwards.', nodes: ['Template blurbs only?', 'Write blurbs from the description', 'Write blurbs with OpenAI', 'Read OpenAI blurbs', 'Combine blurbs', 'Collect the week\'s blurbs'] },
    { title: 'Rank and update the sheet', why: '`Rank by views per hour` orders each week by views per hour, so the lead is the video that is pulling, not the oldest. Rows are upserted on video_id, and videos are remembered only after the write succeeds.', nodes: ['Rank by views per hour', 'Live and sheet set?', 'STOP: dry run - sheet untouched', 'Upsert rows in the newsletter sheet', 'Remember used videos'] },
  ],
  scenarios: [
    {
      name: 'shipped config (dry run, template blurbs)', start: 'Run manually',
      expect: { reached: ['Load sample feed', 'Write blurbs from the description', 'STOP: dry run - sheet untouched'], notReached: ['Fetch the channel feed', 'Write blurbs with OpenAI'], outward: 'none' },
      check: out => {
        const f: string[] = [];
        const p = out['Pick new videos'][0];
        if (p.videos.length !== 3) f.push(`expected 3 videos, got ${p.videos.length}`);
        const ranked = out['Rank by views per hour'];
        const r1 = ranked.find((r: any) => r.video_id === 'vSample0001'), r5 = ranked.find((r: any) => r.video_id === 'vSample0005');
        if (r1?.rank !== 1 || r1.slot !== 'lead') f.push(`vSample0001 should lead its week, got rank ${r1?.rank} ${r1?.slot}`);
        if (r5?.rank !== 2 || r5.slot !== 'feature') f.push(`vSample0005 should be the 2nd feature, got rank ${r5?.rank} ${r5?.slot}`);
        if (!ranked.every((r: any) => r.is_new && r.blurb)) f.push('every sample row should be new with a blurb');
        if (!p.skipped.some((s: any) => s.reason === 'Short')) f.push('Short not skipped');
        if (!p.skipped.some((s: any) => s.reason === 'older than MAX_AGE_DAYS')) f.push('old video not skipped');
        const rows = out["Collect the week's blurbs"];
        const first = rows.find((r: any) => r.video_id === 'vSample0001');
        if (!first || /sponsor|00:00|http/i.test(first.blurb)) f.push(`sponsor/timestamp/link leaked into blurb: ${first?.blurb}`);
        if (!first?.title.includes('&')) f.push('entity not decoded in title');
        if (rows.some((r: any) => r.blurb.length > 280)) f.push('blurb over 280 chars');
        const second = rows.find((r: any) => r.video_id === 'vSample0002');
        if (second && /subscribe/i.test(second.blurb)) f.push('subscribe line leaked');
        if (rows.some((r: any) => new Date(r.week + 'T00:00:00Z').getUTCDay() !== 1)) f.push('week is not a Monday');
        return f;
      },
    },
    {
      name: 'live feeds (one dead), OpenAI and sheet upsert', start: 'Every day at 06:30',
      overrides: { USE_LIVE_FEED: true, USE_OPENAI: true, DRY_RUN: false, NEWSLETTER_SHEET_ID: '1SheetSampleId', CHANNEL_IDS: ['UCaaaaaaaaaaaaaaaaaaaaaa', 'UCdeadchannel0000000000'] },
      mocks: {
        'Fetch the channel feed': [
          { data: '<feed><title>Sample Channel</title><entry><yt:videoId>live001</yt:videoId><title>Live upload</title><published>' + new Date(Date.now() - 864e5).toISOString() + '</published><media:group><media:description>A short description.</media:description></media:group></entry></feed>' },
          { error: { message: 'Request failed with status code 404' } },
        ],
        'Write blurbs with OpenAI': [{ output: { blurb: 'You learn the three questions we ask before every product launch, and the one we dropped. '.repeat(5) } }],
        'Upsert rows in the newsletter sheet': (items: any[]) => items,
      },
      expect: { reached: ['Write blurbs with OpenAI', 'Upsert rows in the newsletter sheet', 'Remember used videos'], outward: 'some' },
      check: out => {
        const f: string[] = [];
        const r = out["Collect the week's blurbs"][0];
        if (!(r?.source === 'openai' && r.blurb.length <= 280 && r.blurb.endsWith('...'))) f.push(`OpenAI blurb not trimmed: ${r?.blurb?.length}`);
        const failed = out['Pick new videos'][0].failed_channels;
        if (failed.length !== 1 || failed[0].channel_id !== 'UCdeadchannel0000000000' || !failed[0].error.includes('404')) f.push(`dead feed not reported: ${JSON.stringify(failed)}`);
        if (out['Remember used videos'][0]?.remembered !== 1) f.push('new video not remembered after upsert');
        return f;
      },
    },
  ],
});
