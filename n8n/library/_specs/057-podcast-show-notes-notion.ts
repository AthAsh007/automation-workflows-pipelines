import { defineSpec } from '../_kit/spec';
import { trigger, code, ifTrue, ifWhen, merge, stop, http, respond, aiAgent } from '../_kit/n';

const cfg = (k: string) => `$('config').first().json.${k}`;

export default defineSpec({
  slug: 'podcast-show-notes-notion',
  title: 'Draft podcast show notes from transcripts with OpenAI in Notion',
  summary: 'Receives an episode transcript by webhook, finds chapter breaks from topic-change phrases and time gaps, pulls out every link (including spoken "example dot com"), writes a summary with OpenAI or by sentence scoring, and creates a draft show notes page in a Notion database.',
  category: 'Marketing and content',
  description: {
    who: 'Podcasters and small production teams who already get a timestamped transcript from their recording tool and spend an hour per episode writing chapters and show notes by hand.',
    how: [
      'Your transcription tool (or a form) posts the transcript and episode details to a webhook. Plain "[00:12:30] Name: text" lines and WebVTT files both work.',
      'Chapters start at phrases such as "let\'s talk about" or "moving on to", at least 3 minutes apart, with a forced break after 12 minutes without one. The first chapter is always 00:00, as YouTube and Spotify expect.',
      'URLs and spoken domains like "fieldnote dot io" are collected into a links list.',
      'A 3-sentence summary comes from OpenAI or from the highest scoring sentences, and a Notion page is created with status Draft, the summary, chapters and links.',
    ],
    setup: [
      'Run it once as imported from `Run manually`. It drafts notes for a sample transcript and stops at `STOP: dry run - Notion untouched`.',
      'Create a Notion database with Name (title), Episode (number), Guest (text) and Status (select), share it with your integration and set `NOTION_DATABASE_ID`.',
      'Add the Notion credential to `Create the Notion page`, optionally add OpenAI and set `USE_OPENAI = true`, and point your tool at the production webhook URL.',
      'Check one draft in the execution, then set `DRY_RUN = false`.',
    ],
    requirements: ['A timestamped transcript per episode', 'A Notion database for show notes', 'Optional: an OpenAI API key'],
    customize: [
      '`CHAPTER_PHRASES` lists the phrases that open a new chapter.',
      '`MIN_CHAPTER_MINUTES` and `MAX_CHAPTER_MINUTES` control chapter length.',
      '`ALWAYS_LINKS` adds your own links (subscribe, newsletter) to every episode.',
    ],
  },
  config: {
    intro: ['USE_OPENAI false -> the summary is built from the highest scoring transcript sentences.', 'DRY_RUN true -> notes are built and returned to the caller, Notion is not written.'],
    consts: [
      { name: 'NOTION_DATABASE_ID', value: '', note: 'Notion database for show notes; blank means nothing is written' },
      { name: 'USE_OPENAI', value: false, note: 'set true after adding an OpenAI credential to the model node' },
      { name: 'CHAPTER_PHRASES', value: ['lets talk about', 'lets get into', 'moving on to', 'switching gears to', 'i want to ask you about', 'talk to me about', 'tell me about'], note: 'phrases that start a new chapter (lowercase, apostrophes left out: lets, not let + apostrophe + s)' },
      { name: 'MIN_CHAPTER_MINUTES', value: 3, note: 'shortest chapter' },
      { name: 'MAX_CHAPTER_MINUTES', value: 12, note: 'a chapter longer than this is split at the next speaker change' },
      { name: 'SUMMARY_SENTENCES', value: 3, note: 'sentences in the summary' },
      { name: 'ALWAYS_LINKS', value: [{ label: 'Newsletter', url: 'https://www.yourpodcast.example/newsletter' }], note: 'links added to every episode' },
    ],
    flags: { notion_enabled: "NOTION_DATABASE_ID.trim() !== ''" },
    safety: 'dry_run',
  },
  nodes: [
    trigger.manual(),
    trigger.webhook('Transcript webhook', 'podcast-show-notes', { respond: 'node' }),
    code('Read the submission', `
// The webhook body when a tool called; nothing when the run was started by hand.
let body = null;
try { body = $('Transcript webhook').first().json.body || null; } catch (e) { body = null; }
return [{ json: { from_webhook: Boolean(body), episode: body || {} } }];`),
    ifTrue('Real submission?', '$json.from_webhook'),
    code('Load sample episode', `
// Used for manual runs: a 38-minute interview in "[hh:mm:ss] Speaker: text" form.
const L = [
  ['00:00:04', 'Host', 'Welcome to Small Ops, the show about running a company with fewer than twenty people. Today I am talking with Mira Kovac, who runs operations at Fieldnote.'],
  ['00:00:31', 'Mira', 'Thanks for having me. I have listened to every episode, so this is a bit surreal.'],
  ['00:01:10', 'Host', 'Before we start, everything we mention is linked in the show notes at yourpodcast.example.'],
  ['00:03:10', 'Host', "Let's talk about how you hired your first operations person."],
  ['00:03:35', 'Mira', 'We waited too long. By the time we hired, the founders were spending 15 hours a week on invoices and payroll.'],
  ['00:06:20', 'Mira', 'The job description we used is public, it is at fieldnote-hq dot example slash careers.'],
  ['00:08:45', 'Mira', 'The first ninety days were mostly writing down what the founders did from memory.'],
  ['00:11:30', 'Host', 'Moving on to tools. What is in your stack today?'],
  ['00:11:52', 'Mira', 'Fewer tools than you would think. We cut from 23 subscriptions to 11 last year and saved about 9,000 dollars.'],
  ['00:14:10', 'Mira', 'The audit spreadsheet we used is here: https://fieldnote.example/tool-audit and anyone can copy it.'],
  ['00:16:30', 'Mira', 'Most of the savings came from seats nobody used, not from cancelling whole tools.'],
  ['00:19:00', 'Host', 'That matches what other guests have said about seat creep.'],
  ['00:21:45', 'Mira', 'We also moved approvals out of email, which cut our month-end close from six days to two.'],
  ['00:24:30', 'Mira', 'The close checklist lives in our wiki and every step has an owner and a deadline.'],
  ['00:27:10', 'Host', 'Switching gears to remote work. How do you run a team across three time zones?'],
  ['00:27:40', 'Mira', 'We have a two hour overlap every day and we protect it. Everything else is written.'],
  ['00:31:15', 'Mira', 'A weekly written update replaced our Monday all hands, and attendance at the update is effectively one hundred percent.'],
  ['00:35:20', 'Host', 'Where can people find you?'],
  ['00:35:40', 'Mira', 'I write a monthly letter at mirakovac dot example and the company blog is fieldnote-hq dot example.'],
  ['00:37:55', 'Host', 'Thanks Mira. That is the episode.'],
];
return [{ json: { from_webhook: false, episode: { episode_number: 42, title: 'Hiring your first ops person, with Mira Kovac', guest: 'Mira Kovac', published_date: new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10),
  transcript: L.map(l => '[' + l[0] + '] ' + l[1] + ': ' + l[2]).join('\\n') } } }];`),
    merge('Combine episode sources'),
    code('Find chapters and links', `
// Parses "[hh:mm:ss] Speaker: text" lines or WebVTT cues into timed segments, then
// cuts chapters at CHAPTER_PHRASES (MIN_CHAPTER_MINUTES apart) and forces a cut after
// MAX_CHAPTER_MINUTES at the next speaker change. Links: URLs plus spoken "x dot io".
const cfg = $('config').first().json;
const ep = $input.first().json.episode;
const raw = String(ep.transcript || '');
const secs = t => t.split(':').map(Number).reduce((a, n) => a * 60 + n, 0);
const segs = [];
const vtt = /(\\d{1,2}:\\d{2}(?::\\d{2})?)(?:\\.\\d+)?\\s*-->\\s*[^\\n]+\\n([\\s\\S]*?)(?=\\n\\s*\\n|$)/g;
if (/-->/.test(raw)) { for (const m of raw.matchAll(vtt)) { const t = m[2].replace(/<v ([^>]+)>/, '$1: ').replace(/<[^>]+>/g, '').trim(); const sp = t.match(/^([^:]{1,40}):\\s*(.*)$/s); segs.push({ t: secs(m[1]), speaker: sp ? sp[1] : '', text: sp ? sp[2] : t }); } }
else for (const line of raw.split(/\\n+/)) { const m = line.match(/^\\[?(\\d{1,2}:\\d{2}(?::\\d{2})?)\\]?\\s*(?:([^:]{1,40}):)?\\s*(.*)$/); if (m) segs.push({ t: secs(m[1]), speaker: (m[2] || '').trim(), text: m[3].trim() }); }
if (!segs.length) return [{ json: { error: 'No timestamped lines found in the transcript.', episode: ep } }];
const fmt = s => { const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = String(s % 60).padStart(2, '0'); return h ? h + ':' + String(m).padStart(2, '0') + ':' + x : String(m).padStart(2, '0') + ':' + x; };
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const titleFrom = rest => cap(rest.replace(/[?.!,].*$/, '').replace(/^((how|what|why|the|your|you|we|i)\\s+)+/i, '').split(/\\s+/).slice(0, 7).join(' ').trim());
const chapters = [{ t: 0, title: 'Intro' }];
let last = 0;
for (let i = 0; i < segs.length; i++) {
  const s = segs[i], low = s.text.toLowerCase().replace(/['’]/g, '');
  const plain = s.text.replace(/['’]/g, '');
  const phrase = cfg.chapter_phrases.find(p => low.includes(p));
  const gap = s.t - last;
  if (phrase && gap >= cfg.min_chapter_minutes * 60) {
    const rest = plain.slice(low.indexOf(phrase) + phrase.length).trim();
    chapters.push({ t: s.t, title: titleFrom(rest) || 'Next topic' }); last = s.t;
  } else if (gap >= cfg.max_chapter_minutes * 60 && i > 0 && s.speaker && s.speaker !== segs[i - 1].speaker) {
    chapters.push({ t: s.t, title: titleFrom(s.text) }); last = s.t;
  }
}
const lastT = segs[segs.length - 1].t;
if (lastT - last > 60 && /\\b(where can people find|that is the episode|thanks for listening)/i.test(segs.slice(-3).map(s => s.text).join(' '))) {
  const out = segs.slice(-3).find(s => /where can people find|that is the episode|thanks for listening/i.test(s.text));
  if (out && out.t - last >= cfg.min_chapter_minutes * 60) chapters.push({ t: out.t, title: 'Where to find ' + (ep.guest || 'our guest') });
}
const links = new Map();
for (const s of segs) {
  for (const m of s.text.matchAll(/https?:\\/\\/[^\\s)>\\]]+/g)) links.set(m[0].replace(/[.,]$/, ''), { url: m[0].replace(/[.,]$/, ''), at: fmt(s.t) });
  for (const m of s.text.matchAll(/\\b([a-z0-9-]+) dot (com|io|org|co|dev|ai|fm|net|example)((?: slash [a-z0-9-]+)*)/gi)) {
    const url = 'https://' + m[1].toLowerCase() + '.' + m[2].toLowerCase() + m[3].toLowerCase().replace(/ slash /g, '/');
    links.set(url, { url, at: fmt(s.t) });
  }
}
return [{ json: { episode: ep, segments: segs, chapters: chapters.map(c => ({ ...c, stamp: fmt(c.t) })), links: [...links.values()], length: fmt(lastT) } }];`),
    ifWhen('Sentence summary only?', [[cfg('use_openai'), 'false']]),
    code('Summarise by sentence scoring', `
// Extractive: score each guest sentence by how many frequent content words it
// holds (stopwords removed), keep the top SUMMARY_SENTENCES in transcript order.
const cfg = $('config').first().json;
const d = $input.first().json;
const stop = new Set('a an and are as at be but by for from has have i in is it its of on or so that the their this to was we were what with you your our us they them about there not just very would could really think know like dont do did'.split(' '));
const host = (d.segments[0] || {}).speaker;
const sentences = d.segments.filter(s => s.speaker !== host).flatMap(s => s.text.split(/(?<=[.!?])\\s+/).map(x => ({ x, t: s.t }))).filter(o => o.x.split(' ').length >= 8 && !/https?:|dot (com|io|example)/i.test(o.x));
const freq = {};
for (const o of sentences) for (const w of o.x.toLowerCase().match(/[a-z]{3,}/g) || []) if (!stop.has(w)) freq[w] = (freq[w] || 0) + 1;
const score = o => (o.x.toLowerCase().match(/[a-z]{3,}/g) || []).filter(w => !stop.has(w)).reduce((a, w) => a + freq[w], 0) / Math.sqrt(o.x.split(' ').length) + (/\\d/.test(o.x) ? 2 : 0);
const top = [...sentences].sort((a, b) => score(b) - score(a)).slice(0, cfg.summary_sentences).sort((a, b) => a.t - b.t);
return [{ json: { ...d, summary: top.map(o => o.x).join(' '), summary_source: 'sentence scoring' } }];`),
    aiAgent('Summarise with OpenAI', {
      prompt: "{{ 'Episode: ' + $json.episode.title + '\\nGuest: ' + ($json.episode.guest || '') + '\\nTranscript:\\n' + $json.segments.map(s => s.speaker + ': ' + s.text).join('\\n').slice(0, 12000) }}",
      system: 'You write podcast show notes. Write a summary of exactly three sentences in plain language for someone deciding whether to listen. Use at least one concrete number or example from the transcript. No hype words, no emoji, do not start with "In this episode".',
      schemaExample: { summary: 'Three sentences.' },
    }),
    code('Read the OpenAI summary', `
// Agent output -> same shape as the scoring path; empty output falls back to the title.
const d = $('Find chapters and links').first().json;
const s = String($input.first().json.output?.summary || '').trim();
return [{ json: { ...d, summary: s || d.episode.title, summary_source: 'openai' } }];`),
    merge('Combine summaries'),
    code('Build the Notion page', `
// Notion caps a rich text item at 2,000 characters, so text is chunked. The page
// gets Name, Episode, Guest and Status=Draft, then Summary, Chapters and Links blocks.
const cfg = $('config').first().json;
const d = $input.first().json;
const ep = d.episode;
const rt = s => String(s).match(/[\\s\\S]{1,1900}/g)?.map(c => ({ type: 'text', text: { content: c } })) || [];
const h2 = t => ({ object: 'block', type: 'heading_2', heading_2: { rich_text: rt(t) } });
const para = t => ({ object: 'block', type: 'paragraph', paragraph: { rich_text: rt(t) } });
const bullet = (t, url) => ({ object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ type: 'text', text: { content: t, ...(url ? { link: { url } } : {}) } }] } });
const links = [...d.links, ...cfg.always_links.map(l => ({ url: l.url, label: l.label }))];
const chapterText = d.chapters.map(c => c.stamp + ' ' + c.title).join('\\n');
const children = [h2('Summary'), para(d.summary), h2('Chapters'), ...d.chapters.map(c => bullet(c.stamp + ' ' + c.title)),
  h2('Links'), ...links.map(l => bullet(l.label || l.url.replace(/^https?:\\/\\//, ''), l.url)), h2('Chapters for YouTube and Spotify'), para(chapterText)];
const page = { parent: { database_id: cfg.notion_database_id }, properties: {
  Name: { title: rt(ep.title || 'Untitled episode') }, Episode: { number: Number(ep.episode_number) || null },
  Guest: { rich_text: rt(ep.guest || '') }, Status: { select: { name: 'Draft' } } }, children: children.slice(0, 100) };
return [{ json: { title: ep.title, summary: d.summary, summary_source: d.summary_source, chapters: chapterText, links: links.map(l => l.url), length: d.length, page } }];`),
    respond('Reply with the draft', '({ ok: true, title: $json.title, chapters: $json.chapters, links: $json.links, summary: $json.summary })'),
    ifWhen('Live and database set?', [[cfg('live'), 'true'], [cfg('notion_enabled'), 'true']]),
    stop('STOP: dry run - Notion untouched'),
    http('Create the Notion page', { method: 'POST', url: 'https://api.notion.com/v1/pages', auth: 'notionApi', headers: { 'Notion-Version': '2022-06-28' }, jsonBody: 'JSON.stringify($json.page)' }),
  ],
  edges: [
    ['Run manually', 'config'], ['Transcript webhook', 'config'],
    ['config', 'Read the submission'],
    ['Read the submission', 'Real submission?'],
    ['Real submission?', 0, 'Combine episode sources'], ['Real submission?', 1, 'Load sample episode'],
    ['Load sample episode', 0, 'Combine episode sources', 1],
    ['Combine episode sources', 'Find chapters and links'],
    ['Find chapters and links', 'Sentence summary only?'],
    ['Sentence summary only?', 0, 'Summarise by sentence scoring'], ['Sentence summary only?', 1, 'Summarise with OpenAI'],
    ['Summarise with OpenAI model', 'Summarise with OpenAI', 'ai_languageModel'],
    ['Summarise with OpenAI output format', 'Summarise with OpenAI', 'ai_outputParser'],
    ['Summarise with OpenAI', 'Read the OpenAI summary'],
    ['Summarise by sentence scoring', 'Combine summaries'], ['Read the OpenAI summary', 0, 'Combine summaries', 1],
    ['Combine summaries', 'Build the Notion page'],
    ['Build the Notion page', 'Reply with the draft'],
    ['Reply with the draft', 'Live and database set?'],
    ['Live and database set?', 0, 'Create the Notion page'], ['Live and database set?', 1, 'STOP: dry run - Notion untouched'],
  ],
  groups: [
    { title: 'Receive the transcript', why: 'Your transcription tool posts to `Transcript webhook`, which waits for a respond node so the caller gets the draft back. A manual run feeds `Load sample episode` through the same path.', nodes: ['Run manually', 'Transcript webhook', 'config', 'Read the submission', 'Real submission?', 'Load sample episode', 'Combine episode sources'] },
    { title: 'Find chapters and links', why: 'Chapters come from what the host says, not fixed intervals, because "let\'s talk about" is where listeners expect a jump point. Spoken domains are rebuilt into URLs, since transcripts rarely contain the link itself.', nodes: ['Find chapters and links'] },
    { title: 'Write the summary', why: 'Sentence scoring is the default and needs no key: guest sentences with frequent topic words and numbers win. OpenAI is optional and both paths produce the same fields.', nodes: ['Sentence summary only?', 'Summarise by sentence scoring', 'Summarise with OpenAI', 'Read the OpenAI summary', 'Combine summaries'] },
    { title: 'Create the Notion draft', why: 'The caller gets chapters and links back before Notion is touched. The page is created with status Draft only when `DRY_RUN` is false, and long text is split under the 2,000 character Notion limit.', nodes: ['Build the Notion page', 'Reply with the draft', 'Live and database set?', 'STOP: dry run - Notion untouched', 'Create the Notion page'] },
  ],
  scenarios: [
    {
      name: 'shipped config (manual sample episode)', start: 'Run manually',
      expect: { reached: ['Load sample episode', 'Summarise by sentence scoring', 'Reply with the draft', 'STOP: dry run - Notion untouched'], notReached: ['Summarise with OpenAI', 'Create the Notion page'], outward: 'none' },
      check: out => {
        const f: string[] = [];
        const d = out['Find chapters and links'][0];
        const ch = d.chapters.map((c: any) => c.stamp + ' ' + c.title).join(' | ');
        if (ch !== '00:00 Intro | 03:10 Hired your first operations person | 11:30 Tools | 27:10 Remote work | 35:20 Where to find Mira Kovac') f.push(`chapters wrong: ${ch}`);
        const urls = d.links.map((l: any) => l.url).sort().join(' ');
        if (urls !== 'https://fieldnote-hq.example https://fieldnote-hq.example/careers https://fieldnote.example/tool-audit https://mirakovac.example') f.push(`links wrong: ${urls}`);
        const s = out['Summarise by sentence scoring'][0].summary;
        if (s.split(/(?<=[.!?])\s+/).length !== 3) f.push(`summary should be 3 sentences: ${s}`);
        const page = out['Build the Notion page'][0].page;
        if (page.properties.Status.select.name !== 'Draft' || page.properties.Episode.number !== 42) f.push('Notion properties wrong');
        return f;
      },
    },
    {
      name: 'live webhook with VTT and OpenAI', start: 'Transcript webhook',
      input: [{ headers: {}, params: {}, query: {}, body: { episode_number: 43, title: 'Pricing for services', guest: 'Lee Park',
        transcript: 'WEBVTT\n\n00:00:01.000 --> 00:00:05.000\n<v Host>Welcome back.\n\n00:04:00.000 --> 00:04:06.000\n<v Host>Let\'s talk about raising prices.\n\n00:09:00.000 --> 00:09:09.000\n<v Lee>We raised prices 20 percent, details at leepark dot example.\n' } }],
      overrides: { USE_OPENAI: true, NOTION_DATABASE_ID: 'db0123456789abcdef0123456789abcd', DRY_RUN: false },
      mocks: {
        'Summarise with OpenAI': [{ output: { summary: 'Lee Park explains how a 20 percent price rise kept every client. He walks through the email he sent. He shares the spreadsheet he used.' } }],
        'Create the Notion page': [{ object: 'page', id: 'p-1', url: 'https://www.notion.so/p1' }],
      },
      expect: { reached: ['Summarise with OpenAI', 'Reply with the draft', 'Create the Notion page'], notReached: ['Load sample episode'], outward: 'some' },
      check: out => {
        const b = out['Build the Notion page'][0];
        const f: string[] = [];
        if (b.chapters !== '00:00 Intro\n04:00 Raising prices') f.push(`VTT chapters wrong: ${JSON.stringify(b.chapters)}`);
        if (!b.links.includes('https://leepark.example')) f.push('spoken domain missed in VTT');
        if (b.summary_source !== 'openai') f.push('summary should come from OpenAI');
        return f;
      },
    },
  ],
});
