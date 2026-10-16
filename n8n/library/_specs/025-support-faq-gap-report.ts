import { defineSpec } from '../_kit/spec';
import { trigger, code, ifTrue, merge, stop, http, gmail, slack, splitOut } from '../_kit/n';

const cfg = (k: string) => `$('config').first().json.${k}`;

export default defineSpec({
  slug: 'support-faq-gap-report',
  title: 'Find repeated support questions in Gmail and report help center gaps weekly',
  summary: 'Reads the last 7 days of support email threads from Gmail, groups similar questions by shared keywords, checks each group against your help article list, and emails or posts a ranked list of topics with no article plus topics people still ask about despite one.',
  category: 'Customer support',
  description: {
    who: 'Support teams of one to five people who answer from a shared Gmail inbox and keep a small help center. It shows which article to write next, from what customers actually asked last week.',
    how: [
      'Every Monday at 08:00 it lists last week\'s threads sent to your support address, one question per thread, or uses 16 sample emails until Gmail is connected.',
      'Subjects and the first lines are lower-cased, stripped of reply prefixes and ticket numbers, and reduced to keywords.',
      'Questions that share at least a quarter of their keywords are grouped. Groups of 2 or more are compared with `HELP_ARTICLES`.',
      'A group with no article sharing 2 keywords is a gap. A group whose article exists is listed as "still asked", which usually means the article is hard to find or unclear.',
    ],
    setup: [
      'Run it once as imported. It groups the sample emails and stops at `STOP: dry run - report not sent`.',
      'Add a Gmail credential to `List last week support emails` and `Fetch subject and snippet`, set `SUPPORT_ADDRESS`, and set `USE_GMAIL = true`.',
      'List your current help articles with a few keywords each in `HELP_ARTICLES`.',
      'Fill in `REPORT_TO` and, optionally, `SLACK_CHANNEL_ID`, then set `DRY_RUN = false`.',
    ],
    requirements: ['A Gmail or Google Workspace inbox that receives support email', 'A list of your help articles', 'Optional: a Slack workspace'],
    customize: [
      '`MIN_GROUP_SIZE` and `SIMILARITY` decide how alike questions must be to count as one topic.',
      '`EXTRA_STOPWORDS` removes words that appear in every email, such as your product name.',
      '`TOP_GAPS` sets how many gaps the report lists.',
    ],
  },
  config: {
    intro: ['USE_GMAIL false -> SAMPLE emails.', 'DRY_RUN true -> the report is built and shown, nothing is sent. REPORT_TO and SLACK_CHANNEL_ID are each optional.'],
    consts: [
      { name: 'USE_GMAIL', value: false, note: 'set true after adding the Gmail credential to the two Gmail API nodes' },
      { name: 'SUPPORT_ADDRESS', value: 'support@yourcompany.example', note: 'address customers write to' },
      { name: 'LOOKBACK_DAYS', value: 7, note: 'how far back to read' },
      { name: 'MAX_THREADS', value: 200, note: 'most threads read per run' },
      { name: 'HELP_ARTICLES', value: [
        { title: 'Reset your password', url: 'https://help.yourcompany.example/reset-password', keywords: ['password', 'reset', 'login', 'locked'] },
        { title: 'Cancel or pause your plan', url: 'https://help.yourcompany.example/cancel', keywords: ['cancel', 'subscription', 'pause', 'plan'] },
        { title: 'Connect Slack', url: 'https://help.yourcompany.example/slack', keywords: ['slack', 'integration', 'connect', 'notification'] },
      ], note: 'your current help articles; keywords are what a question about that article would say' },
      { name: 'EXTRA_STOPWORDS', value: ['acme', 'app'], note: 'words to ignore on top of the built-in list, such as your product name' },
      { name: 'SIMILARITY', value: 0.25, note: 'share of keywords two questions must have in common to group (0 to 1)' },
      { name: 'MIN_GROUP_SIZE', value: 2, note: 'a topic needs at least this many threads to be reported' },
      { name: 'ARTICLE_MATCH_MIN', value: 2, note: 'shared keywords needed for an article to cover a topic' },
      { name: 'TOP_GAPS', value: 5, note: 'how many gaps the report lists' },
      { name: 'REPORT_TO', value: '', note: 'email for the report; blank skips email' },
      { name: 'SLACK_CHANNEL_ID', value: '', note: 'channel for the report; blank skips Slack' },
    ],
    flags: { email_enabled: "REPORT_TO.trim() !== ''", slack_enabled: "SLACK_CHANNEL_ID.trim() !== ''" },
    safety: 'dry_run',
  },
  nodes: [
    trigger.manual(),
    trigger.schedule('Every Monday at 08:00', '0 8 * * 1'),
    ifTrue('Sample mode?', `!${cfg('use_gmail')}`),
    http('List last week support emails', {
      url: 'https://gmail.googleapis.com/gmail/v1/users/me/messages', auth: 'gmailOAuth2',
      query: { q: `={{ 'to:' + ${cfg('support_address')} + ' newer_than:' + ${cfg('lookback_days')} + 'd -from:me -category:promotions' }}`, maxResults: `={{ ${cfg('max_threads')} }}` },
    }),
    splitOut('Split into message ids', 'messages'),
    http('Fetch subject and snippet', {
      url: "={{ 'https://gmail.googleapis.com/gmail/v1/users/me/messages/' + $json.id }}", auth: 'gmailOAuth2',
      query: { format: 'metadata', metadataHeaders: 'Subject' },
    }),
    code('Read Gmail messages', `
// Message metadata -> subject, snippet and thread. Only the first message seen per
// thread counts, so a long back-and-forth is one question, not ten.
const seen = new Set(), out = [];
for (const { json: m } of $input.all()) {
  if (!m.threadId || seen.has(m.threadId)) continue;
  seen.add(m.threadId);
  const subject = (m.payload?.headers || []).find(h => h.name.toLowerCase() === 'subject')?.value || '';
  out.push({ json: { thread_id: m.threadId, subject, snippet: m.snippet || '' } });
}
return out;`),
    code('Load sample support emails', `
// Used until USE_GMAIL is true. Sixteen messages in 15 threads across seven topics; two topics have articles.
const rows = [
  ['t01', 'Password reset link expired', 'The reset link in your email says expired every time I click it'],
  ['t02', 'Re: cannot reset password', 'I requested a password reset twice and nothing arrived'],
  ['t03', 'Locked out after password reset', 'Did a password reset yesterday and now login says locked'],
  ['t04', 'Fwd: password reset not working', 'Reset password email never shows up, checked spam'],
  ['t05', 'How do I export to CSV?', 'I need to export my contacts to a CSV file for our CRM'],
  ['t06', 'CSV export missing columns', 'The export CSV does not include the phone column'],
  ['t07', 'Export all data as CSV', 'Is there a way to export everything to CSV at once'],
  ['t08', 'VAT number on invoice', 'Our invoice is missing the VAT number, we need it for accounting'],
  ['t09', 'Re: [#4471] Invoice VAT', 'Can you reissue the invoice with our VAT number please'],
  ['t10', 'Add VAT ID to invoices', 'Where do I add a VAT ID so invoices show it'],
  ['t11', 'Cancel my subscription', 'Please cancel my subscription at the end of this month'],
  ['t12', 'How to pause over summer', 'Can I pause my subscription instead of cancel for 2 months'],
  ['t13', 'Zapier integration trigger', 'Does the Zapier integration have a trigger for new orders'],
  ['t14', 'Zapier zap not firing', 'My Zapier zap stopped firing for new orders since Friday'],
  ['t15', 'Dark mode?', 'Any plans for a dark mode in the dashboard'],
  ['t02', 'Re: Re: Re: cannot reset password', 'Thanks it worked after all'],
];
// Same shape as the Gmail metadata response; the last row is a reply on thread t02.
return rows.map(([threadId, subject, snippet], i) => ({ json: { id: 'sample-' + (i + 1), threadId, snippet, payload: { headers: [{ name: 'Subject', value: subject }] } } }));`),
    merge('Combine email sources'),
    code('Reduce each question to keywords', `
// Lower-case, drop Re:/Fwd: prefixes and [#1234] ticket tags, remove stopwords and
// short words, and strip common endings so "exports" and "exporting" match "export".
const cfg = $('config').first().json;
const STOP = new Set(('a an and are as at be been but by can cannot could did do does for from get got had has have how i if in into is it its just me my need no not now of on or our out please so some still than thanks that the their them then there this to too up us use was way we what when where which why will with would yes yesterday you your hi hello team help issue problem question any every everything all again since after before instead time month months day days new set nothing never says said').split(' ').concat(cfg.extra_stopwords));
const stem = w => w.length > 6 && w.endsWith('ing') ? w.slice(0, -3) : w.length > 5 && w.endsWith('ed') ? w.slice(0, -2) : w.length > 4 && /(ss|x|ch|sh)es$/.test(w) ? w.slice(0, -2) : w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w;
const out = [];
for (const { json: e } of $input.all()) {
  const subject = e.subject.replace(/^((re|fw|fwd)\\s*:\\s*)+/i, '').replace(/\\[#?\\d+\\]/g, '').trim();
  const text = (subject + ' ' + e.snippet.slice(0, 200)).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ');
  const raw = text.split(/\\s+/).filter(w => w.length > 2 && !/^\\d+$/.test(w) && !STOP.has(w));
  const forms = {};
  for (const w of raw) forms[stem(w)] ||= w;
  out.push({ json: { thread_id: e.thread_id, subject, words: Object.keys(forms), forms } });
}
return out;`),
    code('Group similar questions', `
// Greedy grouping: each question joins the group whose core keywords (in at least
// half its members) it overlaps most, if it shares 2+ words and the overlap
// (shared / smaller set) reaches SIMILARITY. Labels use the words as written.
const cfg = $('config').first().json;
const qs = $input.all().map(i => i.json).filter(q => q.words.length).sort((a, b) => b.words.length - a.words.length);
const forms = Object.assign({}, ...qs.map(q => q.forms));
const jac = (a, b) => { const B = new Set(b); const inter = a.filter(w => B.has(w)).length; return inter < 2 ? 0 : inter / (Math.min(a.length, b.length) || 1); };
const groups = [];
for (const q of qs) {
  let best = null, bestScore = 0;
  for (const g of groups) {
    const core = Object.entries(g.counts).filter(([, n]) => n >= Math.max(1, g.items.length / 2)).map(([w]) => w);
    const s = jac(q.words, core);
    if (s > bestScore) { best = g; bestScore = s; }
  }
  if (best && bestScore >= cfg.similarity) { best.items.push(q); for (const w of q.words) best.counts[w] = (best.counts[w] || 0) + 1; }
  else groups.push({ items: [q], counts: Object.fromEntries(q.words.map(w => [w, 1])) });
}
const topics = groups.map(g => {
  const top = Object.entries(g.counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 5).map(([w]) => w);
  return { label: top.slice(0, 3).map(w => forms[w] || w).join(' / '), keywords: top, size: g.items.length, examples: g.items.slice(0, 3).map(q => q.subject) };
}).sort((a, b) => b.size - a.size);
return [{ json: { topics, questions: qs.length } }];`),
    code('Compare with help articles', `
// A topic is covered when an article shares ARTICLE_MATCH_MIN keywords with it.
// Covered topics that still reach MIN_GROUP_SIZE are reported as "still asked".
const cfg = $('config').first().json;
const stem = w => { w = w.toLowerCase(); return w.length > 6 && w.endsWith('ing') ? w.slice(0, -3) : w.length > 5 && w.endsWith('ed') ? w.slice(0, -2) : w.length > 4 && /(ss|x|ch|sh)es$/.test(w) ? w.slice(0, -2) : w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w; };
const articles = cfg.help_articles.map(a => ({ ...a, stems: a.keywords.map(stem) }));
const { topics, questions } = $input.first().json;
const gaps = [], stillAsked = [], small = [];
for (const t of topics) {
  if (t.size < cfg.min_group_size) { small.push(t.label); continue; }
  const match = articles.map(a => ({ a, n: t.keywords.filter(k => a.stems.includes(k)).length })).sort((x, y) => y.n - x.n)[0];
  if (match && match.n >= cfg.article_match_min) stillAsked.push({ ...t, article: match.a.title, url: match.a.url });
  else gaps.push(t);
}
return [{ json: { gaps: gaps.slice(0, cfg.top_gaps), more_gaps: Math.max(0, gaps.length - cfg.top_gaps), still_asked: stillAsked, one_offs: small.length, questions } }];`),
    code('Write the gap report', `
// Plain text that reads the same in an email and in Slack.
const cfg = $('config').first().json;
const d = $input.first().json;
const lines = [
  'Help center gaps, last ' + cfg.lookback_days + ' days (' + d.questions + ' support threads)',
  '',
  d.gaps.length ? 'No article yet:' : 'No gaps this week: every repeated question has an article.',
  ...d.gaps.map((g, i) => (i + 1) + '. ' + g.label + ' (' + g.size + ' threads), e.g. "' + g.examples.join('", "') + '"'),
  ...(d.more_gaps ? ['...and ' + d.more_gaps + ' more smaller gaps.'] : []),
  ...(d.still_asked.length ? ['', 'Article exists but people still ask:'] : []),
  ...d.still_asked.map(s => '- ' + s.label + ' (' + s.size + ' threads) -> ' + s.article + ' ' + s.url),
  '', d.one_offs + ' one-off questions were not grouped.',
];
return [{ json: { text: lines.join('\\n'), subject: 'Help center gaps: ' + d.gaps.length + ' topics without an article', gaps: d.gaps.length } }];`),
    ifTrue('Live run?', cfg('live')),
    stop('STOP: dry run - report not sent'),
    ifTrue('Report address set?', cfg('email_enabled')),
    stop('STOP: no report address'),
    gmail.send('Email the gap report', { to: cfg('report_to'), subject: '$json.subject', message: '$json.text' }),
    ifTrue('Slack channel set?', cfg('slack_enabled')),
    stop('STOP: no Slack channel'),
    slack.post('Post the gap report to Slack', cfg('slack_channel_id'), '$json.text'),
  ],
  edges: [
    ['Run manually', 'config'], ['Every Monday at 08:00', 'config'],
    ['config', 'Sample mode?'],
    ['Sample mode?', 0, 'Load sample support emails'], ['Sample mode?', 1, 'List last week support emails'],
    ['List last week support emails', 'Split into message ids'],
    ['Split into message ids', 'Fetch subject and snippet'],
    ['Load sample support emails', 'Combine email sources'], ['Fetch subject and snippet', 0, 'Combine email sources', 1],
    ['Combine email sources', 'Read Gmail messages'],
    ['Read Gmail messages', 'Reduce each question to keywords'],
    ['Reduce each question to keywords', 'Group similar questions'],
    ['Group similar questions', 'Compare with help articles'],
    ['Compare with help articles', 'Write the gap report'],
    ['Write the gap report', 'Live run?'],
    ['Live run?', 0, 'Report address set?'], ['Live run?', 0, 'Slack channel set?'], ['Live run?', 1, 'STOP: dry run - report not sent'],
    ['Report address set?', 0, 'Email the gap report'], ['Report address set?', 1, 'STOP: no report address'],
    ['Slack channel set?', 0, 'Post the gap report to Slack'], ['Slack channel set?', 1, 'STOP: no Slack channel'],
  ],
  groups: [
    { title: 'Start and settings', why: 'Runs Monday at 08:00 so the report covers a full week. The help article list lives in `config`; adding an article there removes its topic from next week\'s gaps.', nodes: ['Run manually', 'Every Monday at 08:00', 'config'] },
    { title: 'Read last week\'s threads', why: 'The Gmail API list call only returns ids, so `Fetch subject and snippet` asks for metadata alone, never full bodies. `Read Gmail messages` keeps one message per thread so replies do not inflate a topic.', nodes: ['Sample mode?', 'Load sample support emails', 'List last week support emails', 'Split into message ids', 'Fetch subject and snippet', 'Combine email sources', 'Read Gmail messages'] },
    { title: 'Group questions and check articles', why: 'Keyword overlap is crude but explainable: each topic shows the words that tied it together. An article must share `ARTICLE_MATCH_MIN` keywords to count, so a vague match does not hide a real gap.', nodes: ['Reduce each question to keywords', 'Group similar questions', 'Compare with help articles'] },
    { title: 'Send the report', why: 'The report text is built on every run so a dry run shows the result. Email and Slack are each optional and each lands on its own STOP when blank, behind one `Live run?` gate.', nodes: ['Write the gap report', 'Live run?', 'Report address set?', 'Slack channel set?', 'STOP: dry run - report not sent', 'STOP: no report address', 'Email the gap report', 'STOP: no Slack channel', 'Post the gap report to Slack'] },
  ],
  scenarios: [
    {
      name: 'shipped config (dry run)', start: 'Run manually',
      expect: { reached: ['Load sample support emails', 'STOP: dry run - report not sent'], outward: 'none' },
      check: out => {
        const f: string[] = [];
        const d = out['Compare with help articles'][0];
        const has = (list: any[], w: string) => list.some((t: any) => t.keywords.includes(w));
        if (d.questions !== 15) f.push(`expected 15 threads after thread dedupe, got ${d.questions}`);
        for (const w of ['csv', 'vat', 'zapier']) if (!has(d.gaps, w)) f.push(`"${w}" should be a gap`);
        if (d.gaps.length !== 3) f.push(`expected 3 gaps, got ${d.gaps.length}: ${d.gaps.map((g: any) => g.label).join(' | ')}`);
        if (!d.still_asked.some((s: any) => s.article === 'Reset your password' && s.size === 4)) f.push('password topic (4 threads) should be still asked');
        if (!d.still_asked.some((s: any) => s.article === 'Cancel or pause your plan')) f.push('cancel topic should match its article');
        if (has(d.gaps, 'dark')) f.push('one-off dark mode question must not be a gap');
        return f;
      },
    },
    {
      name: 'live with Gmail, email and Slack', start: 'Every Monday at 08:00',
      overrides: { USE_GMAIL: true, DRY_RUN: false, REPORT_TO: 'team@yourcompany.example', SLACK_CHANNEL_ID: 'C0HELP' },
      mocks: {
        'List last week support emails': [{ messages: [{ id: 'm1', threadId: 'a' }, { id: 'm2', threadId: 'b' }, { id: 'm3', threadId: 'a' }, { id: 'm4', threadId: 'c' }], resultSizeEstimate: 4 }],
        'Fetch subject and snippet': (items: any[]) => items.map(i => ({ id: i.id, threadId: i.threadId,
          snippet: i.id === 'm4' ? 'how do I change the billing currency' : 'refund for duplicate order charged twice',
          payload: { headers: [{ name: 'Subject', value: i.id === 'm4' ? 'Billing currency' : 'Refund duplicate order' }] } })),
        'Email the gap report': [{ id: 'msg_1' }],
        'Post the gap report to Slack': [{ ok: true }],
      },
      expect: { reached: ['Email the gap report', 'Post the gap report to Slack'], notReached: ['Load sample support emails'], outward: 'some' },
      check: out => {
        const f: string[] = [];
        if (out['Read Gmail messages'].length !== 3) f.push('thread a should be counted once');
        const d = out['Compare with help articles'][0];
        if (d.gaps.length !== 1 || !d.gaps[0].keywords.includes('refund')) f.push('the 2 refund threads should form the one gap; got ' + d.gaps.length);
        return f;
      },
    },
  ],
});
