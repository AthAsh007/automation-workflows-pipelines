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
  entry('vSample0003', 'One tip for faster support replies #shorts', 2, 'Save replies as snippets. #shorts', 15400) +
  entry('vSample0004', 'How we plan a quarter on one page', 21, 'Our one page quarterly plan, line by line.', 3100) +
  '</feed>';
return [{ json: { data: xml, channel_id: 'UCsample000000000000000' } }];`;

export default defineSpec({
  slug: 'youtube-uploads-to-newsletter',
  title: 'Turn new YouTube uploads into newsletter blurbs in Google Sheets with OpenAI',
  summary: 'Reads the public YouTube feed of one or more channels, skips Shorts, old and already-used videos, writes a short newsletter blurb per video with OpenAI or from the description, and appends them to a Google Sheets tab grouped by newsletter week.',
  category: 'Marketing and content',
  description: {
    who: 'Creators and small media teams who send a weekly newsletter and copy their latest YouTube videos into it by hand. The blurbs are ready in a sheet by the time you sit down to write.',
    how: [
      'Every morning it reads the YouTube feed for each channel in `CHANNEL_IDS` (no API key needed), or a sample feed until it is switched on.',
      'Shorts, videos older than 7 days and videos already used are skipped.',
      'Each video gets a blurb of up to 280 characters from OpenAI, or from the first two sentences of its description with timestamps, links and sponsor lines removed.',
      'One row per video is appended to the Newsletter tab with the week it belongs to (Monday date), so a week\'s blurbs are one filter away.',
    ],
    setup: [
      'Run it once as imported. It writes blurbs for the sample feed and stops at `STOP: dry run - sheet untouched`.',
      'Put your channel id (starts with UC, found on the channel page) in `CHANNEL_IDS` and set `USE_LIVE_FEED = true`.',
      'Connect Google Sheets and set `NEWSLETTER_SHEET_ID`. Optionally add an OpenAI credential and set `USE_OPENAI = true`.',
      'Read the blurbs in `Collect the week\'s blurbs`, then set `DRY_RUN = false`.',
    ],
    requirements: ['A YouTube channel', 'A Google Sheet with a Newsletter tab', 'Optional: an OpenAI API key'],
    customize: [
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
    http('Fetch the channel feed', { url: 'https://www.youtube.com/feeds/videos.xml', auth: 'none', query: { channel_id: '={{ $json.channel_id }}' } }),
    merge('Combine feed sources'),
    code('Pick new videos', `
// Parses the Atom XML (YouTube puts the description in media:description, which
// generic RSS readers drop), then filters Shorts, old videos and used ids.
const cfg = $('config').first().json;
const used = new Set($getWorkflowStaticData('global').used || []);
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
    const reason = used.has(id) || seenNow.has(id) ? 'already used' :
      cfg.skip_shorts && /#shorts?\\b/i.test(title + ' ' + description) ? 'Short' :
      age > cfg.max_age_days ? 'older than MAX_AGE_DAYS' : '';
    if (reason) { skipped.push({ title, reason }); continue; }
    seenNow.add(id);
    videos.push({ video_id: id, title, channel, url: 'https://www.youtube.com/watch?v=' + id, published: published.slice(0, 10),
      thumbnail: attr(e, 'media:thumbnail', 'url'), views: Number(attr(e, 'media:statistics', 'views') || 0), description });
  }
}
videos.sort((a, b) => b.published.localeCompare(a.published));
return [{ json: { videos, skipped } }];`),
    ifWhen('Any new videos?', [['$json.videos.length', 'gt', 0]]),
    stop('STOP: no new videos'),
    splitOut('One item per video', 'videos'),
    ifWhen('Template blurbs only?', [[cfg('use_openai'), 'false']]),
    code('Write blurbs from the description', `
// Keeps the description lines a reader cares about: no timestamps, links, hashtags
// or sponsor reads. Two sentences, then cut to BLURB_MAX_CHARS at a word boundary.
const cfg = $('config').first().json;
const drop = cfg.drop_line_words;
return $input.all().map(({ json: v }) => {
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
const videos = $('One item per video').all();
return $input.all().map((it, i) => ({ json: { ...videos[i].json, blurb_raw: String(it.json.output?.blurb || 'New video: ' + videos[i].json.title + '.').trim(), source: 'openai' } }));`),
    merge('Combine blurbs'),
    code('Collect the week\'s blurbs', `
// Cuts every blurb to BLURB_MAX_CHARS and tags it with the newsletter week (the
// Monday of the publish week), so a week's rows group together in the sheet.
const cfg = $('config').first().json;
const monday = iso => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); };
const cut = s => s.length <= cfg.blurb_max_chars ? s : s.slice(0, cfg.blurb_max_chars - 3).replace(/\\s+\\S*$/, '') + '...';
return $input.all().map(({ json: v }) => ({ json: {
  week: monday(v.published), video_id: v.video_id, title: v.title, url: v.url, thumbnail: v.thumbnail, published: v.published,
  views: v.views, blurb: cut(v.blurb_raw), source: v.source, added_at: new Date().toISOString().slice(0, 10),
} }));`),
    ifWhen('Live and sheet set?', [[cfg('live'), 'true'], [cfg('sheet_enabled'), 'true']]),
    stop('STOP: dry run - sheet untouched'),
    sheets.append('Append blurbs to the newsletter sheet', cfg('newsletter_sheet_id'), 'Newsletter'),
    code('Remember used videos', `
// After a successful append only, so a failed write is retried tomorrow. Newest 500 kept.
const store = $getWorkflowStaticData('global');
const ids = $('Collect the week\\'s blurbs').all().map(r => r.json.video_id);
store.used = [...ids, ...(store.used || []).filter(x => !ids.includes(x))].slice(0, 500);
return [{ json: { remembered: ids.length } }];`),
  ],
  edges: [
    ['Run manually', 'config'], ['Every day at 06:30', 'config'],
    ['config', 'Use the sample feed?'],
    ['Use the sample feed?', 0, 'Load sample feed'], ['Use the sample feed?', 1, 'List channel feeds'],
    ['List channel feeds', 'Fetch the channel feed'],
    ['Load sample feed', 'Combine feed sources'], ['Fetch the channel feed', 0, 'Combine feed sources', 1],
    ['Combine feed sources', 'Pick new videos'],
    ['Pick new videos', 'Any new videos?'],
    ['Any new videos?', 0, 'One item per video'], ['Any new videos?', 1, 'STOP: no new videos'],
    ['One item per video', 'Template blurbs only?'],
    ['Template blurbs only?', 0, 'Write blurbs from the description'], ['Template blurbs only?', 1, 'Write blurbs with OpenAI'],
    ['Write blurbs with OpenAI model', 'Write blurbs with OpenAI', 'ai_languageModel'],
    ['Write blurbs with OpenAI output format', 'Write blurbs with OpenAI', 'ai_outputParser'],
    ['Write blurbs with OpenAI', 'Read OpenAI blurbs'],
    ['Write blurbs from the description', 'Combine blurbs'], ['Read OpenAI blurbs', 0, 'Combine blurbs', 1],
    ['Combine blurbs', 'Collect the week\'s blurbs'],
    ['Collect the week\'s blurbs', 'Live and sheet set?'],
    ['Live and sheet set?', 0, 'Append blurbs to the newsletter sheet'], ['Live and sheet set?', 1, 'STOP: dry run - sheet untouched'],
    ['Append blurbs to the newsletter sheet', 'Remember used videos'],
  ],
  groups: [
    { title: 'Start and settings', why: 'Runs every morning at 06:30 or by hand. Channels, age limit, blurb length and the sponsor-line words are constants in `config`.', nodes: ['Run manually', 'Every day at 06:30', 'config'] },
    { title: 'Read the channel feeds', why: 'YouTube serves a public Atom feed per channel, so no API key or quota is involved. `Load sample feed` returns the same XML, including the media:description field the blurbs are built from.', nodes: ['Use the sample feed?', 'Load sample feed', 'List channel feeds', 'Fetch the channel feed', 'Combine feed sources'] },
    { title: 'Pick videos for the newsletter', why: '`Pick new videos` parses the XML itself because generic feed readers drop the description. Shorts, old uploads and used ids are removed before any model call, and an empty week ends at `STOP: no new videos`.', nodes: ['Pick new videos', 'Any new videos?', 'STOP: no new videos', 'One item per video'] },
    { title: 'Write the blurbs', why: 'The template path is the default and removes timestamps, links and sponsor reads line by line. OpenAI is optional, and both paths are cut to `BLURB_MAX_CHARS` in code afterwards.', nodes: ['Template blurbs only?', 'Write blurbs from the description', 'Write blurbs with OpenAI', 'Read OpenAI blurbs', 'Combine blurbs', 'Collect the week\'s blurbs'] },
    { title: 'Add to the newsletter sheet', why: 'Rows are appended only with `DRY_RUN` off and a sheet id set. Videos are remembered after the append, so a failed write is picked up again the next morning.', nodes: ['Live and sheet set?', 'STOP: dry run - sheet untouched', 'Append blurbs to the newsletter sheet', 'Remember used videos'] },
  ],
  scenarios: [
    {
      name: 'shipped config (dry run, template blurbs)', start: 'Run manually',
      expect: { reached: ['Load sample feed', 'Write blurbs from the description', 'STOP: dry run - sheet untouched'], notReached: ['Fetch the channel feed', 'Write blurbs with OpenAI'], outward: 'none' },
      check: out => {
        const f: string[] = [];
        const p = out['Pick new videos'][0];
        if (p.videos.length !== 2) f.push(`expected 2 videos, got ${p.videos.length}`);
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
      name: 'live feed, OpenAI and sheet append', start: 'Every day at 06:30',
      overrides: { USE_LIVE_FEED: true, USE_OPENAI: true, DRY_RUN: false, NEWSLETTER_SHEET_ID: '1SheetSampleId', CHANNEL_IDS: ['UCaaaaaaaaaaaaaaaaaaaaaa'] },
      mocks: {
        'Fetch the channel feed': [{ data: '<feed><title>Sample Channel</title><entry><yt:videoId>live001</yt:videoId><title>Live upload</title><published>' + new Date(Date.now() - 864e5).toISOString() + '</published><media:group><media:description>A short description.</media:description></media:group></entry></feed>' }],
        'Write blurbs with OpenAI': [{ output: { blurb: 'You learn the three questions we ask before every product launch, and the one we dropped. '.repeat(5) } }],
        'Append blurbs to the newsletter sheet': (items: any[]) => items,
      },
      expect: { reached: ['Write blurbs with OpenAI', 'Append blurbs to the newsletter sheet', 'Remember used videos'], outward: 'some' },
      check: out => {
        const r = out["Collect the week's blurbs"][0];
        return r?.source === 'openai' && r.blurb.length <= 280 && r.blurb.endsWith('...') ? [] : [`OpenAI blurb not trimmed: ${r?.blurb?.length}`];
      },
    },
  ],
});
