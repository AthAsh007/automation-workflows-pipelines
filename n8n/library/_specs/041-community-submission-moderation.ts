import { defineSpec } from '../_kit/spec';
import { trigger, code, ifTrue, merge, stop, sheets, discord, switchOn, aiAgent } from '../_kit/n';

const cfg = (k: string) => `$('config').first().json.${k}`;

export default defineSpec({
  slug: 'community-submission-moderation',
  title: 'Moderate community form posts with OpenAI before posting to Discord',
  summary: 'Checks each community form submission against house rules (banned words, link count, link shorteners, capitals, duplicates, length, posting rate), optionally asks OpenAI to judge it against your written community rules, posts approved ones to a Discord channel and puts held ones in a Google Sheets review queue.',
  category: 'Marketing and content',
  description: {
    who: 'Community managers who collect posts, tips or showcase entries through a form and publish them to Discord, and spend their mornings deleting spam and link drops by hand.',
    how: [
      'Each form submission (name, email, title, post, optional link) runs the house rules first. A manual run uses 7 sample submissions.',
      'Banned phrases, duplicates of a post from the last 7 days and posts under 20 characters are rejected. More than 2 links, shortened links, mostly capital letters or a 4th post in a day are held.',
      'With `USE_OPENAI` on, posts that pass the rules are checked by a model against `COMMUNITY_RULES`; the model can hold or reject, never approve something the rules stopped.',
      'Approved posts go to Discord with the author and title. Held posts go to the Review queue tab with the reason; rejected posts stop with theirs.',
    ],
    setup: [
      'Run it once as imported. It judges the sample posts and stops at `STOP: dry run - nothing posted`.',
      'Add a Discord bot credential to `Post to Discord` and set `DISCORD_CHANNEL_ID`.',
      'Create a Review queue tab and put the sheet id in `QUEUE_SHEET_ID`. Optionally add an OpenAI credential and set `USE_OPENAI = true`.',
      'Activate the workflow and share the form URL. Set `DRY_RUN = false` to start posting.',
    ],
    requirements: ['A Discord server with a bot that can post in the channel', 'A Google Sheet for the review queue', 'Optional: an OpenAI API key'],
    customize: [
      '`BANNED_PHRASES`, `SHORTENER_DOMAINS` and `MAX_LINKS` hold the hard rules.',
      '`COMMUNITY_RULES` is the plain-language rule text the model judges against.',
      '`CAPS_RATIO` and `DAILY_POSTS_PER_EMAIL` tune the softer holds.',
    ],
  },
  config: {
    intro: ['A manual run uses SAMPLE submissions. USE_OPENAI false -> house rules only.', 'DRY_RUN true -> verdicts are shown; nothing is posted, queued or remembered.'],
    consts: [
      { name: 'USE_OPENAI', value: false, note: 'set true after adding an OpenAI credential to the model under Judge against the community rules' },
      { name: 'COMMUNITY_RULES', value: 'Posts must be about home baking. No selling or affiliate links. Be kind; no insults or personal attacks. No medical or financial advice.', note: 'what the model checks posts against' },
      { name: 'BANNED_PHRASES', value: ['casino', 'crypto giveaway', 'free money', 'onlyfans', 'viagra', 'dm me for'], note: 'any of these rejects the post' },
      { name: 'SHORTENER_DOMAINS', value: ['bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'is.gd'], note: 'links through these are held, since the target is hidden' },
      { name: 'MAX_LINKS', value: 2, note: 'more links than this holds the post' },
      { name: 'MIN_CHARS', value: 20, note: 'shorter posts are rejected' },
      { name: 'CAPS_RATIO', value: 0.6, note: 'share of capital letters that holds a post (posts with 20+ letters)' },
      { name: 'DUPLICATE_DAYS', value: 7, note: 'the same text posted again inside this window is rejected' },
      { name: 'DAILY_POSTS_PER_EMAIL', value: 3, note: 'a 4th post from one email in a day is held' },
      { name: 'DISCORD_CHANNEL_ID', value: '', note: 'channel approved posts go to' },
      { name: 'QUEUE_SHEET_ID', value: '', note: 'Google Sheets id with a Review queue tab' },
    ],
    flags: { queue_enabled: "QUEUE_SHEET_ID.trim() !== ''", discord_enabled: "DISCORD_CHANNEL_ID.trim() !== ''" },
    safety: 'dry_run',
  },
  nodes: [
    trigger.manual(),
    trigger.form('Community post form', 'Share with the community', 'Your post is checked and then shared in our Discord. Most posts appear within a minute.', [
      { label: 'Display name', required: true },
      { label: 'Email', type: 'email', required: true },
      { label: 'Title', required: true },
      { label: 'Post', type: 'textarea', required: true },
      { label: 'Link' },
    ]),
    code('Read the submission', `
// Form fields arrive under their labels. A manual run has none, so it returns a
// marker and the sample submissions are used.
let subs = [];
try { if ($('Community post form').isExecuted) subs = $('Community post form').all().map(i => i.json); } catch (e) { subs = []; }
if (!subs.length) return [{ json: { source: 'none' } }];
return subs.map(s => ({ json: { source: 'form', name: String(s['Display name'] || '').trim(), email: String(s['Email'] || '').trim().toLowerCase(),
  title: String(s['Title'] || '').trim(), post: String(s['Post'] || '').trim(), link: String(s['Link'] || '').trim(), submitted_at: s.submittedAt || new Date().toISOString() } }));`),
    ifTrue('Form submitted?', "$json.source === 'form'"),
    code('Load sample submissions', `
// Used on a manual run. One clean post, three holds and three rejects.
const sub = (name, email, title, post, link = '') => ({ source: 'sample', name, email, title, post, link, submitted_at: new Date().toISOString() });
const loaf = 'My weekday sourdough schedule: feed the starter at 8am, mix at 4pm, shape at 9pm and bake straight from the fridge the next morning. Works with a full-time job.';
return [
  sub('Ana', 'ana@ryefield.example', 'Weekday sourdough schedule', loaf, 'https://ryefield.example/schedule'),
  sub('Promo Bot', 'win@cashflow.example', 'Huge win today', 'Join the crypto giveaway now, free money for the first 100 people!!!'),
  sub('Ben', 'ben@crumbs.example', 'Flour guide', 'Here are the flours I tested this year with notes: https://a.example/1 https://b.example/2 https://c.example/3', 'https://d.example/4'),
  sub('Cass', 'cass@ovenlight.example', 'Why does nobody answer', 'WHY DOES MY BREAD ALWAYS COLLAPSE IN THE OVEN I HAVE TRIED EVERYTHING'),
  sub('Dev', 'dev@flourworks.example', 'Copy of a schedule', loaf),
  sub('Eve', 'eve@sweetloaf.example', 'hi', 'hi'),
  sub('Finn', 'finn@proofbox.example', 'Banneton tip', 'Rice flour in the banneton stops sticking every time. Photos here:', 'https://bit.ly/3xYzSample'),
].map(json => ({ json }));`),
    merge('Combine submission sources'),
    code('Apply the house rules', `
// Hard rules reject, soft rules hold. Duplicates are matched on normalised text
// against this batch and the last DUPLICATE_DAYS (static memory, saved on live runs).
const cfg = $('config').first().json;
const memory = $getWorkflowStaticData('global');
const prints = memory.prints || {};
const perEmail = memory.per_email || {};
const today = new Date().toISOString().slice(0, 10);
const fp = s => { const t = s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); let h = 2166136261; for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16); };
const cutoff = Date.now() - cfg.duplicate_days * 864e5;
const batch = new Set(), counts = {};
const out = [];
for (const { json: s } of $input.all().filter(i => i.json.source !== 'none')) {
  const text = s.title + ' ' + s.post;
  const lower = text.toLowerCase();
  const links = [...(s.post + ' ' + s.link).matchAll(/https?:\\/\\/[^\\s]+/g)].map(m => m[0]);
  const hosts = links.map(l => { try { return new URL(l).hostname.replace(/^www\\./, ''); } catch (e) { return ''; } });
  const letters = text.replace(/[^A-Za-z]/g, '');
  const caps = letters.length >= 20 ? letters.replace(/[^A-Z]/g, '').length / letters.length : 0;
  const print = fp(s.post);
  const dupe = batch.has(print) || (prints[print] && new Date(prints[print]).getTime() > cutoff);
  const key = s.email + '|' + today;
  counts[key] = (counts[key] || perEmail[key] || 0) + 1;
  const banned = cfg.banned_phrases.find(p => lower.includes(p));
  const shortener = hosts.find(h => cfg.shortener_domains.includes(h));
  const [verdict, reason] =
    banned ? ['reject', 'banned phrase "' + banned + '"'] :
    dupe ? ['reject', 'duplicate of a recent post'] :
    s.post.length < cfg.min_chars ? ['reject', 'shorter than ' + cfg.min_chars + ' characters'] :
    links.length > cfg.max_links ? ['hold', links.length + ' links (max ' + cfg.max_links + ')'] :
    shortener ? ['hold', 'shortened link (' + shortener + ')'] :
    caps > cfg.caps_ratio ? ['hold', Math.round(caps * 100) + '% capital letters'] :
    counts[key] > cfg.daily_posts_per_email ? ['hold', 'post ' + counts[key] + ' today from this email'] :
    ['pass', ''];
  batch.add(print);
  out.push({ json: { ...s, links, print, rule_verdict: verdict, verdict: verdict === 'pass' ? 'approve' : verdict, reason, judged_by: 'rules' } });
}
if (cfg.live) {
  const now = new Date().toISOString();
  for (const o of out) prints[o.json.print] = now;
  for (const [k, n] of Object.entries(counts)) if (k.endsWith(today)) perEmail[k] = n;
  for (const [k, v] of Object.entries(prints)) if (new Date(v).getTime() < cutoff) delete prints[k];
  for (const k of Object.keys(perEmail)) if (!k.endsWith(today)) delete perEmail[k];
  memory.prints = prints; memory.per_email = perEmail;
}
return out;`),
    ifTrue('Rules decide alone?', `!${cfg('use_openai')} || $json.rule_verdict !== 'pass'`),
    code('Keep the rule verdict', `
// Rejected or held by a rule, or OpenAI is off: the rule verdict stands as final.
return $input.all().map(i => ({ json: { ...i.json, model_checked: false } }));`),
    code('Prepare the model check', `
// Exactly the posts that passed the rules, so model replies pair back by position.
return $input.all().map(i => ({ json: { title: i.json.title, post: i.json.post.slice(0, 3000), links: i.json.links.join(' ') || 'none' } }));`),
    aiAgent('Judge against the community rules', {
      prompt: "Community rules: {{ $('config').first().json.community_rules }}\n\nTitle: {{ $json.title }}\nPost: {{ $json.post }}\nLinks: {{ $json.links }}",
      system: 'You moderate posts for an online community. Decide: ok (fits the rules), hold (unclear, a person should look) or reject (clearly breaks a rule or is spam). Name the rule in under 15 words. When unsure, choose hold.',
      schemaExample: { decision: 'hold', reason: 'Links to a shop page, may be selling' },
    }),
    merge('Combine verdicts'),
    code('Settle the verdict', `
// Model replies carry only { output }; they pair, in order, with the posts that
// passed every rule (exactly what went to the model).
// The model can turn an approve into hold or reject, never the other way round.
const passed = $('Apply the house rules').all().map(i => i.json).filter(s => s.rule_verdict === 'pass');
let k = 0;
return $input.all().map(it => {
  if (!('output' in it.json)) return it;
  const s = passed[k++] || {};
  const o = it.json.output || {};
  const decision = ['ok', 'hold', 'reject'].includes(o.decision) ? o.decision : 'hold';
  return { json: { ...s, verdict: decision === 'ok' ? 'approve' : decision, reason: decision === 'ok' ? '' : 'model: ' + (o.reason || 'no reason given'), judged_by: 'rules + model' } };
});`),
    switchOn('Route by verdict', '$json.verdict', ['approve', 'hold', 'reject']),
    ifTrue('Post to Discord now?', `${cfg('live')} && ${cfg('discord_enabled')}`),
    stop('STOP: dry run - nothing posted'),
    discord.send('Post to Discord', cfg('discord_channel_id'),
      "('**' + $json.title + '**  ·  shared by ' + $json.name + '\\n\\n' + $json.post + ($json.link ? '\\n' + $json.link : '')).slice(0, 1990)"),
    code('Shape the review row', `
// What a moderator needs to decide in one row; status starts as open.
return $input.all().map(({ json: s }) => ({ json: { submitted_at: s.submitted_at, name: s.name, email: s.email, title: s.title,
  post: s.post, link: s.link, reason: s.reason, judged_by: s.judged_by, status: 'open' } }));`),
    ifTrue('Write to the queue?', `${cfg('live')} && ${cfg('queue_enabled')}`),
    stop('STOP: dry run - queue untouched'),
    sheets.append('Add to the review queue', cfg('queue_sheet_id'), 'Review queue'),
    stop('STOP: rejected'),
    stop('STOP: unknown verdict'),
  ],
  edges: [
    ['Run manually', 'config'], ['Community post form', 'config'],
    ['config', 'Read the submission'],
    ['Read the submission', 'Form submitted?'],
    ['Form submitted?', 0, 'Combine submission sources'], ['Form submitted?', 1, 'Load sample submissions'],
    ['Load sample submissions', 0, 'Combine submission sources', 1],
    ['Combine submission sources', 'Apply the house rules'],
    ['Apply the house rules', 'Rules decide alone?'],
    ['Rules decide alone?', 0, 'Keep the rule verdict'], ['Rules decide alone?', 1, 'Prepare the model check'],
    ['Prepare the model check', 'Judge against the community rules'],
    ['Judge against the community rules model', 'Judge against the community rules', 'ai_languageModel'],
    ['Judge against the community rules output format', 'Judge against the community rules', 'ai_outputParser'],
    ['Keep the rule verdict', 'Combine verdicts'], ['Judge against the community rules', 0, 'Combine verdicts', 1],
    ['Combine verdicts', 'Settle the verdict'],
    ['Settle the verdict', 'Route by verdict'],
    ['Route by verdict', 0, 'Post to Discord now?'], ['Route by verdict', 1, 'Shape the review row'], ['Route by verdict', 2, 'STOP: rejected'], ['Route by verdict', 3, 'STOP: unknown verdict'],
    ['Post to Discord now?', 0, 'Post to Discord'], ['Post to Discord now?', 1, 'STOP: dry run - nothing posted'],
    ['Shape the review row', 'Write to the queue?'],
    ['Write to the queue?', 0, 'Add to the review queue'], ['Write to the queue?', 1, 'STOP: dry run - queue untouched'],
  ],
  groups: [
    { title: 'Start and settings', why: 'The form is the way in; the manual trigger replays sample posts. Every rule, threshold and the community rule text live in `config`.', nodes: ['Run manually', 'Community post form', 'config'] },
    { title: 'Read and apply house rules', why: 'Rules are free and explainable, so they run first on every post. Rejections are reserved for certain spam; anything that might be fine is held for a person instead.', nodes: ['Read the submission', 'Form submitted?', 'Load sample submissions', 'Combine submission sources', 'Apply the house rules'] },
    { title: 'Ask the model', why: 'Only posts that passed every rule reach the model, so spam never costs a call. `Settle the verdict` lets the model add a hold or reject but never approve a post a rule stopped.', nodes: ['Rules decide alone?', 'Keep the rule verdict', 'Prepare the model check', 'Judge against the community rules', 'Combine verdicts', 'Settle the verdict'] },
    { title: 'Post, queue or reject', why: 'Each verdict has its own exit. Discord and the review queue are written only on a live run with their ids set, and the duplicate memory is saved only then, so a dry run can be repeated.', nodes: ['Route by verdict', 'Post to Discord now?', 'STOP: dry run - nothing posted', 'Post to Discord', 'Shape the review row', 'Write to the queue?', 'STOP: dry run - queue untouched', 'Add to the review queue', 'STOP: rejected', 'STOP: unknown verdict'] },
  ],
  scenarios: [
    {
      name: 'shipped config (dry run)', start: 'Run manually',
      expect: { reached: ['Load sample submissions', 'Keep the rule verdict', 'STOP: dry run - nothing posted', 'STOP: dry run - queue untouched', 'STOP: rejected'], notReached: ['Judge against the community rules'], outward: 'none' },
      check: out => {
        const f: string[] = [];
        const rows = out['Settle the verdict'];
        const v = (name: string) => rows.find((r: any) => r.name === name);
        const want: Record<string, [string, string]> = {
          Ana: ['approve', ''], 'Promo Bot': ['reject', 'banned phrase'], Ben: ['hold', '4 links'], Cass: ['hold', 'capital letters'],
          Dev: ['reject', 'duplicate'], Eve: ['reject', 'shorter than'], Finn: ['hold', 'shortened link (bit.ly)'],
        };
        for (const [n, [verdict, why]] of Object.entries(want)) if (v(n)?.verdict !== verdict || !String(v(n)?.reason).includes(why)) f.push(`${n} should be ${verdict} (${why}), got ${v(n)?.verdict} (${v(n)?.reason})`);
        if (out['Shape the review row'].length !== 3) f.push('3 posts should be shaped for the review queue');
        return f;
      },
    },
    {
      name: 'live form post with OpenAI, Discord and the queue', start: 'Community post form',
      input: [
        { 'Display name': 'Gia', Email: 'gia@levain.example', Title: 'Rye starter rescue', Post: 'My rye starter went grey after a week away. Two feeds at 1:5:5 brought it back. Has anyone tried a stiffer starter for travel?', Link: '', submittedAt: new Date().toISOString(), formMode: 'production' },
        { 'Display name': 'Hal', Email: 'hal@bakeshop.example', Title: 'Use my code', Post: 'Get 20% off my bread course with code HAL20, it changed my life and it can change yours too.', Link: 'https://bakeshop.example/course', submittedAt: new Date().toISOString(), formMode: 'production' },
      ],
      overrides: { USE_OPENAI: true, DRY_RUN: false, DISCORD_CHANNEL_ID: '555010199887766', QUEUE_SHEET_ID: '1QueueSheet' },
      mocks: {
        'Judge against the community rules': (items: any[]) => items.map(p => ({ output: p.title === 'Use my code' ? { decision: 'hold', reason: 'Selling a course with a discount code' } : { decision: 'ok', reason: '' } })),
        'Post to Discord': [{ id: '1290000000000000001', channel_id: '555010199887766' }],
        'Add to the review queue': (items: any[]) => items,
      },
      expect: { reached: ['Judge against the community rules', 'Post to Discord', 'Add to the review queue'], notReached: ['Load sample submissions'], outward: 'some' },
      check: out => {
        const f: string[] = [];
        const rows = out['Settle the verdict'];
        if (rows.find((r: any) => r.name === 'Gia')?.verdict !== 'approve') f.push('Gia should be approved by rules and model');
        const hal = rows.find((r: any) => r.name === 'Hal');
        if (hal?.verdict !== 'hold' || !hal.reason.startsWith('model:')) f.push(`Hal should be held by the model, got ${hal?.verdict} ${hal?.reason}`);
        if (out['Add to the review queue'][0]?.name !== 'Hal') f.push('Hal should land in the review queue');
        return f;
      },
    },
  ],
});
