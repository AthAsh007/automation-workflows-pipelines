import { defineSpec } from '../_kit/spec';
import { trigger, code, ifTrue, merge, stop, http, switchOn } from '../_kit/n';

const cfg = (k: string) => `$('config').first().json.${k}`;

export default defineSpec({
  slug: 'gmail-support-to-trello',
  title: 'Turn Gmail support emails into Trello cards by category',
  summary: 'Sorts each new support email into a Trello list by keyword category, sets a due date from its priority, applies label ids, skips auto-replies and internal mail, and adds replies in an existing thread as a comment on that thread\'s card instead of a new card.',
  category: 'Customer support',
  description: {
    who: 'Small teams that run support from a Gmail inbox and plan the work on a Trello board. Each email becomes a card in the right list with a due date, without anyone copying it across.',
    how: [
      'The Gmail trigger picks up unread mail matching `GMAIL_QUERY` every minute. A manual run uses 6 sample emails instead.',
      'Auto-replies, bounces and mail from your own domain are skipped. Several messages from one thread in the same batch become one card.',
      'Keyword rules in `CATEGORIES` pick the list; urgency words pick the priority, and the priority sets the due date (4 hours for urgent, 7 days for low).',
      'A new thread creates a card with the sender, a trimmed body and the Gmail thread id. A later reply in that thread is added as a comment on the same card.',
    ],
    setup: [
      'Run it once as imported. It sorts the sample emails and stops at `STOP: dry run - Trello untouched`.',
      'Add a Gmail credential to `New support email` and set `GMAIL_QUERY` to match your support mail.',
      'Add a Trello credential to `Create the Trello card` and `Add the reply as a card comment`, then paste list ids into `CATEGORIES` and `FALLBACK_LIST_ID`, and label ids into `PRIORITY_LABEL_IDS`.',
      'Set `DRY_RUN = false` and activate the workflow. The thread-to-card memory is kept in static data, which n8n saves on activated runs.',
    ],
    requirements: ['A Gmail or Google Workspace inbox', 'A Trello board with one list per category', 'Trello API key and token'],
    customize: [
      '`CATEGORIES` holds the words, list id and label id for each category; the first match wins.',
      '`DUE_HOURS` sets the due date per priority.',
      '`SKIP_SENDERS` and `OWN_DOMAINS` keep robots and colleagues off the board.',
    ],
  },
  config: {
    intro: ['A manual run uses SAMPLE emails; the Gmail trigger feeds real ones.', 'DRY_RUN true -> cards are planned and shown, Trello is not touched.'],
    consts: [
      { name: 'GMAIL_QUERY', value: 'to:support@yourcompany.example', note: 'Gmail search the trigger polls (unread only); also set it on the trigger node' },
      { name: 'CATEGORIES', value: [
        { name: 'Billing', words: ['invoice', 'refund', 'charged', 'payment', 'receipt', 'billing'], list_id: '', label_id: '' },
        { name: 'Bug', words: ['error', 'crash', 'broken', 'bug', 'not working', 'down'], list_id: '', label_id: '' },
        { name: 'Account access', words: ['password', 'login', 'log in', 'locked', '2fa', 'sign in'], list_id: '', label_id: '' },
        { name: 'Feature request', words: ['feature', 'suggestion', 'would be great', 'could you add', 'idea'], list_id: '', label_id: '' },
      ], note: 'first category whose words appear in the subject or body wins; list_id is the Trello list id' },
      { name: 'FALLBACK_LIST_ID', value: '', note: 'Trello list for mail that matches no category' },
      { name: 'URGENT_WORDS', value: ['urgent', 'asap', 'everyone', 'outage', 'production'], note: 'make a card urgent' },
      { name: 'HIGH_WORDS', value: ['charged twice', 'refund', 'cannot', 'blocked', 'deadline'], note: 'make a card high priority' },
      { name: 'LOW_CATEGORIES', value: ['Feature request'], note: 'categories that are low priority unless urgent words appear' },
      { name: 'DUE_HOURS', value: { urgent: 4, high: 24, normal: 72, low: 168 }, note: 'hours from arrival to the card due date' },
      { name: 'PRIORITY_LABEL_IDS', value: { urgent: '', high: '', normal: '', low: '' }, note: 'Trello label id per priority; blank adds no label' },
      { name: 'SKIP_SENDERS', value: ['no-reply', 'noreply', 'mailer-daemon', 'postmaster'], note: 'sender address fragments that are never carded' },
      { name: 'SKIP_SUBJECTS', value: ['automatic reply', 'out of office', 'delivery status notification', 'undeliverable'], note: 'subject fragments that mark an auto-reply' },
      { name: 'OWN_DOMAINS', value: ['yourcompany.example'], note: 'mail from these domains is internal and skipped' },
      { name: 'BODY_CHARS', value: 1200, note: 'how much of the email body goes onto the card' },
    ],
    safety: 'dry_run',
  },
  nodes: [
    trigger.manual(),
    trigger.gmail('New support email', 'to:support@yourcompany.example'),
    code('Read the incoming email', `
// When the Gmail trigger fired, normalise its messages. A manual run has none,
// so it returns one marker item and the sample emails are used instead.
let mails = [];
try { if ($('New support email').isExecuted) mails = $('New support email').all().map(i => i.json); } catch (e) { mails = []; }
if (!mails.length) return [{ json: { source: 'none' } }];
return mails.map(m => ({ json: {
  source: 'gmail', message_id: m.id, thread_id: m.threadId, subject: m.subject || '(no subject)',
  from_email: (m.from?.value?.[0]?.address || '').toLowerCase(), from_name: m.from?.value?.[0]?.name || '',
  body: String(m.text || '').trim(), received_at: m.date ? new Date(m.date).toISOString() : new Date().toISOString(),
} }));`),
    ifTrue('Triggered by Gmail?', "$json.source === 'gmail'"),
    code('Load sample support emails', `
// Used on a manual run. Six messages: one auto-reply, and two in the same thread.
const ago = m => new Date(Date.now() - m * 60000).toISOString();
return [
  { source: 'sample', message_id: 's1', thread_id: 'th-a1', subject: 'Charged twice this month', from_email: 'nora@pinegrove.example', from_name: 'Nora Webb', body: 'Hi, my card was charged twice for October. Can you refund one of them?', received_at: ago(40) },
  { source: 'sample', message_id: 's2', thread_id: 'th-b2', subject: 'Dashboard down for everyone', from_email: 'ops@tallyhouse.example', from_name: 'Tally House Ops', body: 'Getting a 502 error on the dashboard for the whole team. Urgent please.', received_at: ago(12) },
  { source: 'sample', message_id: 's3', thread_id: 'th-c3', subject: 'Idea: dark mode', from_email: 'kai@lumenart.example', from_name: 'Kai Duarte', body: 'Would be great to have a dark mode for late shifts.', received_at: ago(300) },
  { source: 'sample', message_id: 's4', thread_id: 'th-d4', subject: 'Automatic reply: Out of office', from_email: 'beth@corner.example', from_name: 'Beth Lowe', body: 'I am away until Monday.', received_at: ago(30) },
  { source: 'sample', message_id: 's5', thread_id: 'th-a1', subject: 'Re: Charged twice this month', from_email: 'nora@pinegrove.example', from_name: 'Nora Webb', body: 'Attaching the bank statement showing both charges.', received_at: ago(10) },
  { source: 'sample', message_id: 's6', thread_id: 'th-e5', subject: 'Cannot log in after reset', from_email: 'ivan@ridgefield.example', from_name: 'Ivan Petrov', body: 'The password reset worked but login still says invalid.', received_at: ago(55) },
].map(json => ({ json }));`),
    merge('Combine email sources'),
    code('Sort into a category', `
// Skip robots and colleagues, fold messages from one thread into one card, then
// pick category (first match in CATEGORIES), priority and due date. A thread that
// already has a card from an earlier run becomes a comment on it.
const cfg = $('config').first().json;
const memory = $getWorkflowStaticData('global');
const known = memory.thread_cards || {};
const lc = s => String(s || '').toLowerCase();
const has = (text, words) => words.some(w => text.includes(w.toLowerCase()));
const byThread = {};
const out = [];
for (const { json: m } of $input.all().filter(i => i.json.source !== 'none').sort((a, b) => a.json.received_at.localeCompare(b.json.received_at))) {
  const skip =
    cfg.skip_senders.some(s => m.from_email.includes(s)) ? 'automated sender' :
    cfg.skip_subjects.some(s => lc(m.subject).includes(s)) ? 'auto-reply' :
    cfg.own_domains.includes(m.from_email.split('@')[1]) ? 'internal sender' : '';
  if (skip) { out.push({ ...m, action: 'skip', reason: skip }); continue; }
  (byThread[m.thread_id] ||= []).push(m);
}
for (const [thread, msgs] of Object.entries(byThread)) {
  const first = msgs[0], last = msgs[msgs.length - 1];
  const text = lc(msgs.map(x => x.subject + ' ' + x.body).join(' '));
  const cat = cfg.categories.find(c => has(text, c.words));
  const category = cat ? cat.name : 'General';
  const priority = has(text, cfg.urgent_words) ? 'urgent' : has(text, cfg.high_words) ? 'high' : cfg.low_categories.includes(category) ? 'low' : 'normal';
  const due = new Date(new Date(first.received_at).getTime() + cfg.due_hours[priority] * 36e5).toISOString();
  const labels = [cat?.label_id, cfg.priority_label_ids[priority]].filter(Boolean);
  const body = msgs.map(x => '**' + x.from_name + '** (' + x.received_at.slice(0, 16).replace('T', ' ') + '):\\n' + x.body.slice(0, cfg.body_chars)).join('\\n\\n---\\n\\n');
  const base = { thread_id: thread, subject: first.subject.replace(/^(re|fwd?):\\s*/i, ''), from_email: first.from_email, from_name: first.from_name,
    category, priority, due, messages: msgs.length };
  if (known[thread]) {
    out.push({ ...base, action: 'comment', card_id: known[thread], comment: 'New email from ' + last.from_name + ':\\n\\n' + msgs.map(x => x.body.slice(0, cfg.body_chars)).join('\\n\\n---\\n\\n') });
  } else {
    out.push({ ...base, action: 'create', list_id: (cat && cat.list_id) || cfg.fallback_list_id, label_ids: labels,
      card_name: '[' + priority.toUpperCase() + '] ' + first.subject.replace(/^(re|fwd?):\\s*/i, '') + ' (' + (first.from_name || first.from_email) + ')',
      card_desc: 'From: ' + first.from_name + ' <' + first.from_email + '>\\nCategory: ' + category + '\\nGmail thread: ' + thread + '\\n\\n' + body });
  }
}
return out.map(json => ({ json }));`),
    ifTrue('Live run?', cfg('live')),
    stop('STOP: dry run - Trello untouched'),
    switchOn('Choose the Trello action', '$json.action', ['create', 'comment']),
    code('Prepare the card', `
// Exactly the Trello create-card body; kept as its own step so the card id that
// comes back can be paired with its thread by position.
return $input.all().map(i => ({ json: { thread_id: i.json.thread_id, body: {
  idList: i.json.list_id, name: i.json.card_name, desc: i.json.card_desc, due: i.json.due,
  idLabels: i.json.label_ids.join(','), pos: 'top',
} } }));`),
    http('Create the Trello card', { method: 'POST', url: 'https://api.trello.com/1/cards', auth: 'trelloApi', jsonBody: 'JSON.stringify($json.body)' }),
    code('Remember the card for this thread', `
// Maps Gmail thread -> Trello card, so the next reply in the thread is a comment.
// Entries older than 60 days are dropped.
const memory = $getWorkflowStaticData('global');
const known = memory.thread_cards || {};
const seenAt = memory.thread_seen || {};
const prepared = $('Prepare the card').all();
const now = new Date().toISOString();
const out = $input.all().map((it, i) => {
  const thread = prepared[i].json.thread_id;
  known[thread] = it.json.id; seenAt[thread] = now;
  return { json: { thread_id: thread, card_id: it.json.id, url: it.json.shortUrl || '' } };
});
const cutoff = new Date(Date.now() - 60 * 864e5).toISOString();
for (const [t, at] of Object.entries(seenAt)) if (at < cutoff) { delete seenAt[t]; delete known[t]; }
memory.thread_cards = known; memory.thread_seen = seenAt;
return out;`),
    http('Add the reply as a card comment', {
      method: 'POST', url: "={{ 'https://api.trello.com/1/cards/' + $json.card_id + '/actions/comments' }}", auth: 'trelloApi',
      jsonBody: 'JSON.stringify({ text: $json.comment })',
    }),
    stop('STOP: skipped, not a support request'),
  ],
  edges: [
    ['Run manually', 'config'], ['New support email', 'config'],
    ['config', 'Read the incoming email'],
    ['Read the incoming email', 'Triggered by Gmail?'],
    ['Triggered by Gmail?', 0, 'Combine email sources'], ['Triggered by Gmail?', 1, 'Load sample support emails'],
    ['Load sample support emails', 0, 'Combine email sources', 1],
    ['Combine email sources', 'Sort into a category'],
    ['Sort into a category', 'Live run?'],
    ['Live run?', 0, 'Choose the Trello action'], ['Live run?', 1, 'STOP: dry run - Trello untouched'],
    ['Choose the Trello action', 0, 'Prepare the card'], ['Choose the Trello action', 1, 'Add the reply as a card comment'], ['Choose the Trello action', 2, 'STOP: skipped, not a support request'],
    ['Prepare the card', 'Create the Trello card'],
    ['Create the Trello card', 'Remember the card for this thread'],
  ],
  groups: [
    { title: 'Start and settings', why: 'The Gmail trigger polls every minute for unread mail matching `GMAIL_QUERY`; the manual trigger exists to try the rules on sample mail. Categories, list ids and due times all live in `config`.', nodes: ['Run manually', 'New support email', 'config'] },
    { title: 'Read the email', why: '`Read the incoming email` flattens the Gmail message into sender, subject, body and thread. With no trigger data it returns a marker, so `Load sample support emails` runs instead and the same rules can be checked.', nodes: ['Read the incoming email', 'Triggered by Gmail?', 'Load sample support emails', 'Combine email sources'] },
    { title: 'Sort and plan the card', why: 'Skips come first so an out-of-office never becomes a card. Messages are grouped by thread before categorising, and the first matching category wins, so the order of `CATEGORIES` is the tie-breaker.', nodes: ['Sort into a category', 'Live run?', 'STOP: dry run - Trello untouched'] },
    { title: 'Write to Trello', why: 'A thread already on the board gets a comment, not a second card. The card id is stored only after `Create the Trello card` succeeds, so a failed call is retried on the next email in that thread.', nodes: ['Choose the Trello action', 'Prepare the card', 'Add the reply as a card comment', 'STOP: skipped, not a support request', 'Create the Trello card', 'Remember the card for this thread'] },
  ],
  scenarios: [
    {
      name: 'shipped config (dry run)', start: 'Run manually',
      expect: { reached: ['Load sample support emails', 'STOP: dry run - Trello untouched'], notReached: ['Create the Trello card'], outward: 'none' },
      check: out => {
        const f: string[] = [];
        const rows = out['Sort into a category'];
        const t = (id: string) => rows.find((r: any) => r.thread_id === id);
        const want: Record<string, [string, string]> = { 'th-a1': ['Billing', 'high'], 'th-b2': ['Bug', 'urgent'], 'th-c3': ['Feature request', 'low'], 'th-e5': ['Account access', 'high'] };
        for (const [id, [cat, pri]] of Object.entries(want)) if (t(id)?.category !== cat || t(id)?.priority !== pri) f.push(`${id} should be ${cat}/${pri}, got ${t(id)?.category}/${t(id)?.priority}`);
        if (rows.filter((r: any) => r.action === 'create').length !== 4) f.push('expected 4 cards');
        if (t('th-a1')?.messages !== 2) f.push('the two th-a1 messages should fold into one card');
        if (rows.find((r: any) => r.action === 'skip')?.reason !== 'auto-reply') f.push('out-of-office should be skipped as auto-reply');
        const urgentDue = (new Date(t('th-b2').due).getTime() - Date.now()) / 36e5;
        if (urgentDue < 3.5 || urgentDue > 4) f.push('urgent card should be due about 4 hours after arrival');
        return f;
      },
    },
    {
      name: 'live: Gmail trigger creates a card', start: 'New support email',
      input: [{ id: '18c1', threadId: '18c0', subject: 'Invoice 2231 has the wrong address', text: 'Please fix the billing address on invoice 2231.', date: new Date().toISOString(),
        from: { value: [{ address: 'ap@corbel.example', name: 'Corbel AP' }], text: 'Corbel AP <ap@corbel.example>' } },
        { id: '18c2', threadId: '18c9', subject: 'Lunch?', text: 'Friday?', date: new Date().toISOString(), from: { value: [{ address: 'sam@yourcompany.example', name: 'Sam' }], text: 'Sam' } }],
      overrides: { DRY_RUN: false, FALLBACK_LIST_ID: 'list_general' },
      mocks: { 'Create the Trello card': (items: any[]) => items.map((_, i) => ({ id: 'card_' + i, shortUrl: 'https://trello.com/c/abc' + i })) },
      expect: { reached: ['Create the Trello card', 'Remember the card for this thread', 'STOP: skipped, not a support request'], notReached: ['Load sample support emails', 'Add the reply as a card comment'], outward: 'some' },
      check: out => {
        const f: string[] = [];
        const p = out['Prepare the card'];
        if (p.length !== 1 || !p[0].body.name.includes('Invoice 2231')) f.push('one card for the invoice email');
        if (out['Remember the card for this thread'][0]?.thread_id !== '18c0') f.push('card should be remembered against thread 18c0');
        return f;
      },
    },
  ],
});
