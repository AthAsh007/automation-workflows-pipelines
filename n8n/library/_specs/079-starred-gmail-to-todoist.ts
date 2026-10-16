import { defineSpec } from '../_kit/spec';
import { trigger, code, ifTrue, ifWhen, merge, stop, http } from '../_kit/n';

const cfg = (k: string) => `$('config').first().json.${k}`;
const b64url = (s: string) => Buffer.from(s, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export default defineSpec({
  slug: 'starred-gmail-to-todoist',
  title: 'Create Todoist tasks from starred Gmail emails',
  summary: 'Every 15 minutes it finds newly starred Gmail messages, cleans the subject into a task title, reads due dates like today, tomorrow, by Friday or next week from the email, sets priority from a sender list and urgent words, and creates one Todoist task per email, never twice.',
  category: 'Productivity and operations',
  description: {
    who: 'Freelancers, founders and managers who star emails as a to-do list and then lose them under newer mail. Starring stays the habit; the task with a due date and a link back to the email appears in Todoist.',
    how: [
      'Every 15 minutes it searches Gmail for `GMAIL_QUERY` (starred in the last 7 days), skips message ids it already turned into tasks, and reads the rest. Sample emails are used until Gmail is connected.',
      'The title is the subject without Re:, Fwd:, [EXTERNAL] tags or trailing punctuation. A blank subject uses the first line of the body.',
      'Due dates come from phrases in the subject or body, counted from when the email arrived: today, EOD, tomorrow, by a weekday, next week, end of month or an ISO date. A date already passed becomes today.',
      'Priority is 4 for `VIP_SENDERS` or urgent words, 3 for `IMPORTANT_DOMAINS`, else 1. The task links back to the email.',
    ],
    setup: [
      'Run it once as imported. It turns sample emails into tasks and stops at `STOP: dry run - Todoist untouched`.',
      'Add a Gmail OAuth2 credential to `List starred messages` and `Fetch each message`, then set `USE_GMAIL = true`.',
      'Add a Todoist credential to `Create the Todoist task` and optionally set `TODOIST_PROJECT_ID`.',
      'Check the tasks on `Turn emails into tasks`, then set `DRY_RUN = false` and activate the workflow.',
    ],
    requirements: ['A Gmail account', 'A Todoist account'],
    customize: [
      '`VIP_SENDERS`, `IMPORTANT_DOMAINS` and `URGENT_WORDS` decide the priority.',
      '`GMAIL_QUERY` can narrow the search, for example to one label.',
      '`DEFAULT_DUE` sets the due date when the email names none: blank, today or tomorrow.',
    ],
  },
  config: {
    intro: ['USE_GMAIL false -> SAMPLE emails, so the run works before any credential exists.', 'DRY_RUN true -> tasks are built and shown, Todoist is not changed.'],
    consts: [
      { name: 'USE_GMAIL', value: false, note: 'set true after adding the Gmail credential to both Gmail nodes' },
      { name: 'GMAIL_QUERY', value: 'is:starred newer_than:7d', note: 'Gmail search for emails that should become tasks' },
      { name: 'VIP_SENDERS', value: ['ceo@northwind.example', 'board@northwind.example'], note: 'senders whose emails become priority 4' },
      { name: 'IMPORTANT_DOMAINS', value: ['bigclient.example'], note: 'sender domains whose emails become priority 3' },
      { name: 'URGENT_WORDS', value: ['urgent', 'asap', 'action required'], note: 'words in the subject that make priority 4' },
      { name: 'DEFAULT_DUE', value: '', note: "due date when none is found: '', 'today' or 'tomorrow'" },
      { name: 'TODOIST_PROJECT_ID', value: '', note: 'Todoist project for the tasks; blank uses the Inbox' },
      { name: 'TASK_LABELS', value: ['email'], note: 'labels added to every task' },
      { name: 'MAX_PER_RUN', value: 20, note: 'hard ceiling on tasks per run' },
    ],
    safety: 'dry_run',
  },
  nodes: [
    trigger.manual(),
    trigger.schedule('Every 15 minutes', '*/15 * * * *'),
    ifTrue('Gmail off?', '!' + cfg('use_gmail')),
    code('Load sample starred emails', `
// Used until USE_GMAIL is true. Already decoded: the same shape Read the messages builds.
const ago = h => new Date(Date.now() - h * 36e5).toISOString();
return [
  { id: '18c1a0000000a001', thread_id: '18c1a0000000a001', from: 'Maria Lopez <maria@bigclient.example>', subject: 'Re: Fwd: [EXTERNAL] Q4 proposal - need your numbers by Friday!!', body: 'Hi, can you send the revised numbers by Friday? Thanks', received_at: ago(3) },
  { id: '18c1a0000000a002', thread_id: '18c1a0000000a002', from: 'Sam Holt <ceo@northwind.example>', subject: 'Board deck', body: 'Please review the deck today. It goes out tonight.', received_at: ago(1) },
  { id: '18c1a0000000a003', thread_id: '18c1a0000000a003', from: 'billing@vendor.example', subject: 'ACTION REQUIRED: renew your plan', body: 'Your plan renews at the end of the month.', received_at: ago(30) },
  { id: '18c1a0000000a004', thread_id: '18c1a0000000a004', from: 'Ola <ola@friend.example>', subject: '', body: 'Book the restaurant for Saturday\\nIt is the place on Harbour Street.', received_at: ago(26) },
  { id: '18c1a0000000a005', thread_id: '18c1a0000000a005', from: 'dev@northwind.example', subject: 'Re: release checklist', body: 'Can you sign off tomorrow?', received_at: ago(30) },
  { id: '18c1a0000000a006', thread_id: '18c1a0000000a006', from: 'news@letters.example', subject: 'Weekly reading list', body: 'Ten links for the weekend.', received_at: ago(5) },
].map(json => ({ json }));`),
    http('List starred messages', { url: 'https://gmail.googleapis.com/gmail/v1/users/me/messages', auth: 'gmailOAuth2', query: { q: `={{ ${cfg('gmail_query')} }}`, maxResults: '50' } }),
    code('Keep unseen message ids', `
// Only ids that never became a task are fetched, so a run with nothing new costs one call.
const cfg = $('config').first().json;
const seen = $getWorkflowStaticData('global').done || {};
return ($input.first().json.messages || []).filter(m => !seen[m.id]).slice(0, cfg.max_per_run).map(m => ({ json: { id: m.id } }));`),
    http('Fetch each message', { url: "={{ 'https://gmail.googleapis.com/gmail/v1/users/me/messages/' + $json.id }}", auth: 'gmailOAuth2', query: { format: 'full' } }),
    code('Read the messages', `
// Headers plus the first text/plain part, base64url-decoded.
const dec = d => Buffer.from(String(d || '').replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
const plain = p => {
  if (!p) return '';
  if (p.mimeType === 'text/plain' && p.body?.data) return dec(p.body.data);
  for (const c of p.parts || []) { const t = plain(c); if (t) return t; }
  return '';
};
return $input.all().map(({ json: m }) => {
  const h = Object.fromEntries((m.payload?.headers || []).map(x => [x.name.toLowerCase(), x.value]));
  return { json: { id: m.id, thread_id: m.threadId, from: h.from || '', subject: h.subject || '', body: (plain(m.payload) || m.snippet || '').slice(0, 4000),
    received_at: new Date(Number(m.internalDate || Date.now())).toISOString() } };
});`),
    merge('Combine email sources'),
    code('Turn emails into tasks', `
// Title: subject minus reply/forward prefixes and bracket tags. Due: the first phrase
// found, counted from the email's arrival. Priority: VIP > urgent words > domain > 1.
const cfg = $('config').first().json;
const seen = $getWorkflowStaticData('global').done || {};
const today = new Date().toISOString().slice(0, 10);
const iso = d => d.toISOString().slice(0, 10);
const addDays = (d, n) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + n));
const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const dueFrom = (text, ref) => {
  const t = text.toLowerCase();
  let m;
  if ((m = t.match(/\\b(\\d{4}-\\d{2}-\\d{2})\\b/))) return [m[1], m[1]];
  if (/\\b(today|tonight|eod|end of (the )?day)\\b/.test(t)) return [iso(ref), 'today'];
  if (/\\btomorrow\\b/.test(t)) return [iso(addDays(ref, 1)), 'tomorrow'];
  if ((m = t.match(/\\b(?:by|on|before|for|this)\\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\\b/))) {
    const want = days.indexOf(m[1]);
    return [iso(addDays(ref, (want - ref.getUTCDay() + 7) % 7)), m[0]];
  }
  if (/\\bnext week\\b/.test(t)) return [iso(addDays(ref, ((8 - ref.getUTCDay()) % 7) || 7)), 'next week'];
  if (/\\bend of (the )?month\\b/.test(t)) return [iso(new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() + 1, 0))), 'end of month'];
  return [null, ''];
};
const clean = s => String(s || '').replace(/^\\s*((re|fwd?|fw|aw|tr)\\s*:\\s*|\\[[^\\]]*\\]\\s*)+/i, '').replace(/[!?.\\s]+$/, '').replace(/\\s+/g, ' ').trim();
const tasks = [], skipped = [];
for (const { json: e } of $input.all()) {
  if (!e.id) continue;
  if (seen[e.id]) { skipped.push({ id: e.id, reason: 'task already created' }); continue; }
  const title = clean(e.subject) || clean(String(e.body || '').split('\\n')[0]).slice(0, 120) || '(no subject)';
  const ref = new Date(e.received_at);
  let [due, phrase] = dueFrom(e.subject + '\\n' + e.body, ref);
  if (!due && cfg.default_due) due = cfg.default_due === 'tomorrow' ? iso(addDays(new Date(), 1)) : today;
  const late = due && due < today;
  const addr = ((e.from.match(/<([^>]+)>/) || [])[1] || e.from).toLowerCase().trim();
  const domain = addr.split('@')[1] || '';
  const urgent = cfg.urgent_words.some(w => e.subject.toLowerCase().includes(w));
  const priority = cfg.vip_senders.includes(addr) || urgent ? 4 : cfg.important_domains.includes(domain) ? 3 : 1;
  tasks.push({ email_id: e.id, title, due: late ? today : due, due_phrase: phrase, was_late: !!late, priority, from: addr,
    description: 'From ' + e.from + ' on ' + e.received_at.slice(0, 10) + '\\nhttps://mail.google.com/mail/u/0/#all/' + e.thread_id });
}
return [{ json: { tasks: tasks.slice(0, cfg.max_per_run), skipped } }];`),
    ifTrue('Any tasks to add?', '$json.tasks.length > 0'),
    stop('STOP: no new starred emails'),
    code('Shape Todoist tasks', `
// One item per task in the Todoist API body shape.
const cfg = $('config').first().json;
return $input.first().json.tasks.map(t => ({ json: { email_id: t.email_id, body: {
  content: t.title, description: t.description, priority: t.priority, labels: cfg.task_labels,
  ...(t.due ? { due_date: t.due } : {}), ...(cfg.todoist_project_id ? { project_id: cfg.todoist_project_id } : {}),
} } }));`),
    ifTrue('Create in Todoist?', cfg('live')),
    stop('STOP: dry run - Todoist untouched'),
    http('Create the Todoist task', { method: 'POST', url: 'https://api.todoist.com/api/v1/tasks', auth: 'todoistApi', jsonBody: 'JSON.stringify($json.body)' }),
    code('Remember added emails', `
// Message id -> task id, kept 60 days, so a starred email never becomes two tasks.
const store = $getWorkflowStaticData('global');
const done = store.done || {};
const shaped = $('Shape Todoist tasks').all();
$input.all().forEach((it, i) => { if (it.json.id && shaped[i]) done[shaped[i].json.email_id] = { task: it.json.id, at: Date.now() }; });
for (const [k, v] of Object.entries(done)) if (Date.now() - v.at > 60 * 864e5) delete done[k];
store.done = done;
return [{ json: { remembered: Object.keys(done).length } }];`),
  ],
  edges: [
    ['Run manually', 'config'], ['Every 15 minutes', 'config'],
    ['config', 'Gmail off?'],
    ['Gmail off?', 0, 'Load sample starred emails'], ['Gmail off?', 1, 'List starred messages'],
    ['List starred messages', 'Keep unseen message ids'], ['Keep unseen message ids', 'Fetch each message'], ['Fetch each message', 'Read the messages'],
    ['Load sample starred emails', 'Combine email sources'], ['Read the messages', 0, 'Combine email sources', 1],
    ['Combine email sources', 'Turn emails into tasks'],
    ['Turn emails into tasks', 'Any tasks to add?'],
    ['Any tasks to add?', 0, 'Shape Todoist tasks'], ['Any tasks to add?', 1, 'STOP: no new starred emails'],
    ['Shape Todoist tasks', 'Create in Todoist?'],
    ['Create in Todoist?', 0, 'Create the Todoist task'], ['Create in Todoist?', 1, 'STOP: dry run - Todoist untouched'],
    ['Create the Todoist task', 'Remember added emails'],
  ],
  groups: [
    { title: 'Start and settings', why: 'A 15-minute search rather than the Gmail trigger, because starring usually happens on mail that is already read and the trigger only sees new arrivals. Sender lists and the search live in `config`.', nodes: ['Run manually', 'Every 15 minutes', 'config'] },
    { title: 'Read starred emails', why: '`Keep unseen message ids` drops ids that already became tasks before any message is downloaded. `Load sample starred emails` gives the decoded shape, including a reply chain, a VIP, an urgent subject and a blank subject.', nodes: ['Gmail off?', 'Load sample starred emails', 'List starred messages', 'Keep unseen message ids', 'Fetch each message', 'Read the messages', 'Combine email sources'] },
    { title: 'Build the tasks', why: 'Dates are counted from when the email arrived, so "tomorrow" in yesterday\'s email means today. A date that already passed becomes today rather than an overdue task nobody sees.', nodes: ['Turn emails into tasks', 'Any tasks to add?', 'STOP: no new starred emails'] },
    { title: 'Create and remember', why: 'Only a live run creates tasks. `Remember added emails` records a message id only when Todoist returned a task id, so a failed create is retried on the next run.', nodes: ['Shape Todoist tasks', 'Create in Todoist?', 'STOP: dry run - Todoist untouched', 'Create the Todoist task', 'Remember added emails'] },
  ],
  scenarios: [
    {
      name: 'shipped config (sample emails, dry run)', start: 'Run manually',
      expect: { reached: ['Load sample starred emails', 'Shape Todoist tasks', 'STOP: dry run - Todoist untouched'], notReached: ['List starred messages'], outward: 'none' },
      check: out => {
        const t = out['Turn emails into tasks'][0].tasks;
        const by = (id: string) => t.find((x: any) => x.email_id === '18c1a0000000a00' + id);
        const today = new Date().toISOString().slice(0, 10);
        const f: string[] = [];
        if (by('1')?.title !== 'Q4 proposal - need your numbers by Friday') f.push(`title cleanup: ${by('1')?.title}`);
        if (by('1')?.priority !== 3 || by('1')?.due_phrase !== 'by friday') f.push('bigclient domain = priority 3, due by Friday');
        if (by('2')?.priority !== 4) f.push('CEO is a VIP sender');
        if (by('3')?.priority !== 4 || by('3')?.due_phrase !== 'end of month') f.push('ACTION REQUIRED is urgent, due end of month');
        if (by('4')?.title !== 'Book the restaurant for Saturday') f.push(`blank subject should use the first body line: ${by('4')?.title}`);
        if (by('5')?.due !== today || by('5')?.due_phrase !== 'tomorrow') f.push('"tomorrow" in a 30-hour-old email is today');
        if (by('6')?.due !== null || by('6')?.priority !== 1) f.push('newsletter: no due date, priority 1');
        return f;
      },
    },
    {
      name: 'live with Gmail and Todoist', start: 'Every 15 minutes',
      overrides: { USE_GMAIL: true, DRY_RUN: false, TODOIST_PROJECT_ID: '6Jf8VQXxpwv56VQ7' },
      mocks: {
        'List starred messages': [{ messages: [{ id: 'm1', threadId: 't1' }], resultSizeEstimate: 1 }],
        'Fetch each message': [{ id: 'm1', threadId: 't1', internalDate: String(Date.now() - 2 * 36e5), snippet: 'Send the contract',
          payload: { mimeType: 'multipart/alternative', headers: [{ name: 'From', value: 'Lee <lee@bigclient.example>' }, { name: 'Subject', value: 'FW: contract' }],
            parts: [{ mimeType: 'text/plain', body: { data: b64url('Please send the signed contract by 2030-01-15.') } }, { mimeType: 'text/html', body: { data: b64url('<p>x</p>') } }] } }],
        'Create the Todoist task': [{ id: '6X7rM8997g3RQmvh', content: 'contract', priority: 3 }],
      },
      expect: { reached: ['Read the messages', 'Create the Todoist task', 'Remember added emails'], notReached: ['Load sample starred emails'], outward: 'some' },
      check: out => {
        const b = out['Shape Todoist tasks'][0]?.body;
        const f: string[] = [];
        if (b?.content !== 'contract' || b?.due_date !== '2030-01-15' || b?.priority !== 3 || b?.project_id !== '6Jf8VQXxpwv56VQ7') f.push(`task body: ${JSON.stringify(b)}`);
        if (out['Remember added emails'][0].remembered !== 1) f.push('message id should be remembered');
        return f;
      },
    },
  ],
});
