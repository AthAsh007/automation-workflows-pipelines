import { defineSpec } from '../_kit/spec';
import { trigger, code, ifTrue, ifWhen, merge, stop, http, respond, aiAgent } from '../_kit/n';

const cfg = (k: string) => `$('config').first().json.${k}`;

export default defineSpec({
  slug: 'meeting-transcript-action-items',
  title: 'Turn meeting transcripts into Notion action items with OpenAI',
  summary: 'Takes a meeting transcript by webhook, pulls out action items with OpenAI or a rule-based fallback, matches each owner to the attendee list, resolves phrases like "by Friday" into dates and creates one Notion database page per action.',
  category: 'Project management',
  description: {
    who: 'Team leads and consultants who record calls with a notetaker tool and then retype the follow-ups into Notion. Post the transcript to the webhook and the action items appear in your tasks database with an owner and a date.',
    how: [
      'A transcript arrives on the webhook with the meeting title, date and attendee list. A manual run uses a built-in sample meeting.',
      'Action items are extracted by OpenAI when `USE_OPENAI` is true. Otherwise rules pick up lines like "Action: ...", "I\'ll send ... by Friday" and "Dana will book ...".',
      'Each owner is matched to an attendee by full or first name. Names that match nobody, or two people, are kept as unassigned with the reason.',
      'Due phrases (tomorrow, Friday, end of week, next week, in 3 days, a YYYY-MM-DD date) become real dates counted from the meeting date. Repeated actions are merged.',
      'The webhook gets the list back at once, then one Notion page per action is created on a live run.',
    ],
    setup: [
      'Run it once as imported. It extracts actions from the sample meeting and stops at `STOP: dry run - Notion untouched`.',
      'Create a Notion database with Name, Owner, Due, Status and Meeting properties, share it with your integration, and put its id in `NOTION_DATABASE_ID`.',
      'Optionally add an OpenAI credential to `Extract action items with OpenAI` and set `USE_OPENAI = true`.',
      'Point your notetaker at the webhook URL, check a few runs, then set `DRY_RUN = false`.',
    ],
    requirements: ['A Notion workspace and an internal integration', 'Optional: an OpenAI API key'],
    customize: [
      '`DEFAULT_DUE_DAYS` sets the date for actions where nobody named one.',
      '`MAX_ACTIONS` caps pages per meeting so a rambling transcript cannot flood the database.',
      '`IGNORED_SUBJECTS` lists words like "We" that look like names but are not owners.',
    ],
  },
  config: {
    intro: ['USE_OPENAI false -> action items come from the rule-based extractor.', 'NOTION_DATABASE_ID blank or DRY_RUN true -> actions are returned to the caller, no pages are created.'],
    consts: [
      { name: 'USE_OPENAI', value: false, note: 'set true after adding an OpenAI credential to the agent model' },
      { name: 'NOTION_DATABASE_ID', value: '', note: 'id of the Notion database that receives one page per action' },
      { name: 'DEFAULT_DUE_DAYS', value: 7, note: 'days after the meeting for actions with no due phrase' },
      { name: 'MAX_ACTIONS', value: 15, note: 'pages created per transcript at most' },
      { name: 'IGNORED_SUBJECTS', value: ['We', 'They', 'It', 'This', 'That', 'Someone', 'Everyone', 'You'], note: 'capitalised words that are never treated as an owner name' },
      { name: 'STATUS_VALUE', value: 'To do', note: 'value set on the Status select of each new page' },
    ],
    flags: { notion_enabled: "NOTION_DATABASE_ID.trim() !== ''" },
    safety: 'dry_run',
  },
  nodes: [
    trigger.manual(),
    trigger.webhook('Receive meeting transcript', 'meeting-transcript', { respond: 'node' }),
    code('Read the incoming transcript', `
// The webhook body when one arrived; an empty marker on a manual run.
let body = null;
try { body = $('Receive meeting transcript').first().json.body; } catch (e) { body = null; }
const ok = Boolean(body && typeof body.transcript === 'string' && body.transcript.trim());
return [{ json: ok ? {
  has_transcript: true, title: body.title || 'Untitled meeting',
  meeting_date: String(body.meeting_date || new Date().toISOString()).slice(0, 10),
  attendees: Array.isArray(body.attendees) ? body.attendees : [], transcript: body.transcript,
} : { has_transcript: false } }];`),
    ifTrue('Transcript received?', '$json.has_transcript'),
    code('Load sample transcript', `
// Used on a manual run. Covers every rule: speaker "I'll", "X will", Action: lines,
// an @mention, a non-attendee owner, a duplicate and a line with no due phrase.
const today = new Date().toISOString().slice(0, 10);
const inTwoWeeks = new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10);
return [{ json: {
  has_transcript: true, title: 'Q4 launch sync', meeting_date: today,
  attendees: [
    { name: 'Priya Natarajan', email: 'priya@northwind.example' },
    { name: 'Marco Lindqvist', email: 'marco@northwind.example' },
    { name: 'Dana Okafor', email: 'dana@northwind.example' },
    { name: 'Lee Chen', email: 'lee@northwind.example' },
  ],
  transcript: [
    'Priya Natarajan: Thanks all. Quick recap of where the Q4 launch stands.',
    "Marco Lindqvist: I'll send the revised pricing deck to Harbour Dental by Friday.",
    'Dana Okafor: Action: update the onboarding checklist for the new tier',
    'Priya Natarajan: Dana will book the venue for the customer day by ' + inTwoWeeks + '.',
    'Lee Chen: Sounds good. We will need the final numbers first.',
    'Marco Lindqvist: Sam will draft the press release by next week.',
    'Priya Natarajan: TODO: @Lee review the security questionnaire by tomorrow',
    'Marco Lindqvist: Marco will send the revised pricing deck to Harbour Dental.',
  ].join('\\n'),
} }];`),
    merge('Combine transcript sources'),
    ifTrue('OpenAI enabled?', cfg('use_openai')),
    aiAgent('Extract action items with OpenAI', {
      prompt: 'Meeting: {{ $json.title }} on {{ $json.meeting_date }}\nAttendees: {{ $json.attendees.map(a => a.name).join(", ") }}\n\nTranscript:\n{{ $json.transcript }}',
      system: 'You extract action items from meeting transcripts. Return only concrete commitments someone agreed to do. For each, give the task as a short imperative sentence, the owner name exactly as spoken (or the speaker when they said "I will"), and the due phrase exactly as spoken, or an empty string. Never invent owners or dates.',
      schemaExample: { actions: [{ task: 'Send the revised pricing deck to Harbour Dental', owner: 'Marco', due: 'Friday', speaker: 'Marco Lindqvist' }] },
    }),
    code('Extract action items by rule', `
// Deterministic fallback. Three patterns, checked in order on each spoken line:
//   "Action:/TODO:/Next step: <task>"  owner = @mention, else the speaker
//   "I will / I'll <task>"            owner = the speaker
//   "<Name> will <task>"              owner = Name (unless Name is in IGNORED_SUBJECTS)
// A trailing "by/before <phrase>" becomes the due hint.
const cfg = $('config').first().json;
const src = $input.first().json;
const ignored = new Set(cfg.ignored_subjects);
const candidates = [];
const splitDue = text => {
  const m = text.match(/^(.*?)\\s+(?:by|before|due)\\s+([^,;]+?)[.!]?$/i);
  return m ? [m[1], m[2]] : [text.replace(/[.!]$/, ''), ''];
};
for (const raw of src.transcript.split(/\\r?\\n/)) {
  const line = raw.trim();
  if (!line) continue;
  const sp = line.match(/^([A-Z][\\w'.-]*(?: [A-Z][\\w'.-]*)?)\\s*:\\s*(.+)$/);
  const speaker = sp ? sp[1] : '';
  const said = sp ? sp[2] : line;
  let m = said.match(/^(?:action(?: item)?|todo|next step)\\s*[:-]\\s*(.+)$/i);
  if (m) {
    let text = m[1], owner = speaker;
    const at = text.match(/@([A-Z][a-z]+(?: [A-Z][a-z]+)?)/);
    if (at) { owner = at[1]; text = text.replace(at[0], '').replace(/\\s+/g, ' ').trim(); }
    const [task, due] = splitDue(text);
    candidates.push({ task, owner_hint: owner, due_hint: due, speaker });
    continue;
  }
  m = said.match(/\\b(?:I will|I'll|I am going to|I'm going to)\\s+(.+)$/i);
  if (m) { const [task, due] = splitDue(m[1]); candidates.push({ task, owner_hint: speaker, due_hint: due, speaker }); continue; }
  m = said.match(/\\b([A-Z][a-z]+(?: [A-Z][a-z]+)?) (?:will|is going to)\\s+(.+)$/);
  if (m && !ignored.has(m[1].split(' ')[0])) { const [task, due] = splitDue(m[2]); candidates.push({ task, owner_hint: m[1], due_hint: due, speaker }); }
}
return [{ json: { ...src, method: 'rules', candidates } }];`),
    merge('Combine extraction results'),
    code('Match owners and due dates', `
// Owner: full name, then unique first name, against the attendee list.
// Due: phrase -> date counted from the meeting date; none -> DEFAULT_DUE_DAYS.
// Identical tasks (case and punctuation ignored) are merged, then MAX_ACTIONS applies.
const cfg = $('config').first().json;
// Input is either the rule extractor's candidates or the agent's $json.output.actions.
const src = $('Combine transcript sources').first().json;
const got = $input.first().json;
const m = got.candidates ? got : { ...src, method: 'openai', candidates: (got.output?.actions || []).map(a => ({
  task: String(a.task || '').trim(), owner_hint: String(a.owner || '').trim(), due_hint: String(a.due || '').trim(), speaker: a.speaker || '' })) };
const base = new Date(m.meeting_date + 'T12:00:00Z');
const iso = d => d.toISOString().slice(0, 10);
const add = n => new Date(base.getTime() + n * 864e5);
const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const resolveDue = phrase => {
  const p = phrase.toLowerCase().replace(/^(the|this|next)\\s+(?=(monday|tuesday|wednesday|thursday|friday|saturday|sunday))/, '');
  if (!p) return null;
  let x;
  if ((x = p.match(/(\\d{4}-\\d{2}-\\d{2})/))) return x[1];
  if (/^(today|end of day|eod)$/.test(p)) return iso(base);
  if (p === 'tomorrow') return iso(add(1));
  if ((x = p.match(/^in (\\d+) days?$/))) return iso(add(Number(x[1])));
  const dow = DAYS.findIndex(d => p.startsWith(d));
  if (dow >= 0) { const diff = (dow - base.getUTCDay() + 7) % 7 || 7; return iso(add(diff)); }
  if (/^(end of (the )?week|eow)$/.test(p)) { const diff = (5 - base.getUTCDay() + 7) % 7; return iso(add(diff)); }
  if (p === 'next week') { const diff = (1 - base.getUTCDay() + 7) % 7 || 7; return iso(add(diff)); }
  if (/^(end of (the )?month|eom)$/.test(p)) return iso(new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)));
  return null;
};
const people = m.attendees || [];
const matchOwner = hint => {
  const h = hint.trim().toLowerCase();
  if (!h) return { owner: '', reason: 'no owner named' };
  const full = people.find(a => a.name.toLowerCase() === h);
  if (full) return { owner: full.name, email: full.email || '' };
  const first = people.filter(a => a.name.toLowerCase().split(' ')[0] === h.split(' ')[0]);
  if (first.length === 1) return { owner: first[0].name, email: first[0].email || '' };
  return { owner: '', reason: first.length > 1 ? hint + ' matches ' + first.length + ' attendees' : hint + ' is not an attendee' };
};
const seen = new Set(), actions = [], dropped = [];
for (const c of m.candidates) {
  const task = c.task.replace(/^please\\s+/i, '').replace(/\\s+/g, ' ').trim();
  const key = task.toLowerCase().replace(/[^a-z0-9 ]/g, '');
  if (!task) continue;
  if (seen.has(key)) { dropped.push({ task, reason: 'duplicate of an earlier action' }); continue; }
  seen.add(key);
  const who = matchOwner(c.owner_hint);
  const due = resolveDue(c.due_hint);
  actions.push({
    task: task.charAt(0).toUpperCase() + task.slice(1), owner: who.owner || 'Unassigned', owner_email: who.email || '',
    owner_note: who.reason || '', due: due || iso(add(cfg.default_due_days)),
    due_note: due ? 'from "' + c.due_hint + '"' : (c.due_hint ? 'could not read "' + c.due_hint + '", default used' : 'no due date said, default used'),
  });
}
for (const a of actions.slice(cfg.max_actions)) dropped.push({ task: a.task, reason: 'over MAX_ACTIONS' });
return [{ json: { title: m.title, meeting_date: m.meeting_date, method: m.method, actions: actions.slice(0, cfg.max_actions), dropped } }];`),
    respond('Reply with the action items', "JSON.stringify({ ok: true, meeting: $json.title, method: $json.method, mode: $('config').first().json.mode, actions: $json.actions, dropped: $json.dropped })"),
    ifWhen('Write to Notion?', [[cfg('live'), 'true'], [cfg('notion_enabled'), 'true']]),
    stop('STOP: dry run - Notion untouched'),
    code('Split into Notion pages', `
// One Notion create-page body per action. Property names match the database in setup.
const cfg = $('config').first().json;
const m = $input.first().json;
const text = s => [{ type: 'text', text: { content: String(s).slice(0, 1900) } }];
return m.actions.map(a => ({ json: { task: a.task, body: {
  parent: { database_id: cfg.notion_database_id },
  properties: {
    Name: { title: text(a.task) },
    Owner: { rich_text: text(a.owner + (a.owner_note ? ' (' + a.owner_note + ')' : '')) },
    Due: { date: { start: a.due } },
    Status: { select: { name: cfg.status_value } },
    Meeting: { rich_text: text(m.title + ', ' + m.meeting_date) },
  },
} } }));`),
    http('Create the Notion action item', { method: 'POST', url: 'https://api.notion.com/v1/pages', auth: 'notionApi', headers: { 'Notion-Version': '2022-06-28' }, jsonBody: 'JSON.stringify($json.body)' }),
  ],
  edges: [
    ['Run manually', 'config'], ['Receive meeting transcript', 'config'],
    ['config', 'Read the incoming transcript'],
    ['Read the incoming transcript', 'Transcript received?'],
    ['Transcript received?', 0, 'Combine transcript sources'], ['Transcript received?', 1, 'Load sample transcript'],
    ['Load sample transcript', 0, 'Combine transcript sources', 1],
    ['Combine transcript sources', 'OpenAI enabled?'],
    ['OpenAI enabled?', 0, 'Extract action items with OpenAI'], ['OpenAI enabled?', 1, 'Extract action items by rule'],
    ['Extract action items with OpenAI model', 'Extract action items with OpenAI', 'ai_languageModel'],
    ['Extract action items with OpenAI output format', 'Extract action items with OpenAI', 'ai_outputParser'],
    ['Extract action items with OpenAI', 'Combine extraction results'], ['Extract action items by rule', 0, 'Combine extraction results', 1],
    ['Combine extraction results', 'Match owners and due dates'],
    ['Match owners and due dates', 'Reply with the action items'],
    ['Reply with the action items', 'Write to Notion?'],
    ['Write to Notion?', 0, 'Split into Notion pages'], ['Write to Notion?', 1, 'STOP: dry run - Notion untouched'],
    ['Split into Notion pages', 'Create the Notion action item'],
  ],
  groups: [
    { title: 'Start and settings', why: 'A notetaker posts to `Receive meeting transcript`; `Run manually` replays the sample meeting. The Notion database, default due days and the cap all live in `config`.', nodes: ['Run manually', 'Receive meeting transcript', 'config'] },
    { title: 'Load the transcript', why: '`Read the incoming transcript` checks that a non-empty transcript arrived before any extraction runs. Without one, `Load sample transcript` supplies a meeting that exercises every extraction rule.', nodes: ['Read the incoming transcript', 'Transcript received?', 'Load sample transcript', 'Combine transcript sources'] },
    { title: 'Extract action items', why: 'OpenAI is optional. With `USE_OPENAI` false, `Extract action items by rule` reads Action lines, "I\'ll" from the speaker and "Name will", so the template works with no model and no cost.', nodes: ['OpenAI enabled?', 'Extract action items with OpenAI', 'Extract action items by rule', 'Combine extraction results'] },
    { title: 'Owners, dates and reply', why: 'Owners must be attendees; a name that matches nobody or two people stays unassigned with the reason, never guessed. The caller gets the list from `Reply with the action items` before any page is written.', nodes: ['Match owners and due dates', 'Reply with the action items'] },
    { title: 'Create Notion pages', why: '`Write to Notion?` needs a live run and a database id, so a test transcript never lands in the shared tasks database. Each action becomes its own page with owner, due date and meeting.', nodes: ['Write to Notion?', 'STOP: dry run - Notion untouched', 'Split into Notion pages', 'Create the Notion action item'] },
  ],
  scenarios: [
    {
      name: 'shipped config (dry run, sample meeting)', start: 'Run manually',
      expect: { reached: ['Load sample transcript', 'Extract action items by rule', 'Reply with the action items', 'STOP: dry run - Notion untouched'], notReached: ['Extract action items with OpenAI'], outward: 'none' },
      check: out => {
        const r = out['Match owners and due dates'][0];
        const f: string[] = [];
        const iso = (n: number) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
        const find = (s: string) => r.actions.find((a: any) => a.task.toLowerCase().includes(s));
        if (r.actions.length !== 5) f.push(`expected 5 actions, got ${r.actions.length}: ${r.actions.map((a: any) => a.task).join(' | ')}`);
        if (find('pricing deck')?.owner !== 'Marco Lindqvist') f.push('pricing deck should belong to Marco');
        if (find('onboarding checklist')?.owner !== 'Dana Okafor') f.push('Action: line should fall back to the speaker');
        if (find('security questionnaire')?.owner !== 'Lee Chen') f.push('@Lee should match Lee Chen');
        if (find('security questionnaire')?.due !== iso(1)) f.push('"by tomorrow" should resolve to tomorrow');
        if (find('venue')?.due !== iso(14)) f.push('ISO due date should be kept');
        if (find('press release')?.owner !== 'Unassigned') f.push('Sam is not an attendee and must stay unassigned');
        if (find('onboarding checklist')?.due !== iso(7)) f.push('no due phrase should use DEFAULT_DUE_DAYS');
        if (!r.dropped.some((d: any) => d.reason.startsWith('duplicate'))) f.push('repeated pricing deck action should be merged');
        if (r.actions.some((a: any) => /final numbers/.test(a.task))) f.push('"We will" must not become an action');
        return f;
      },
    },
    {
      name: 'live webhook with OpenAI and Notion', start: 'Receive meeting transcript',
      overrides: { USE_OPENAI: true, NOTION_DATABASE_ID: 'a1b2c3d4e5f6', DRY_RUN: false },
      input: [{ headers: { 'content-type': 'application/json' }, params: {}, query: {}, body: {
        title: 'Website kickoff', meeting_date: '2026-10-12',
        attendees: [{ name: 'Ana Ruiz', email: 'ana@studio.example' }, { name: 'Tom Becker', email: 'tom@studio.example' }, { name: 'Tom Hale', email: 'thale@studio.example' }],
        transcript: 'Ana Ruiz: I will share the sitemap by Wednesday.\nTom Becker: Tom will set up staging.',
      } }],
      mocks: {
        'Extract action items with OpenAI': [{ output: { actions: [
          { task: 'Share the sitemap', owner: 'Ana', due: 'Wednesday', speaker: 'Ana Ruiz' },
          { task: 'Set up staging', owner: 'Tom', due: 'end of week', speaker: 'Tom Becker' },
        ] } }],
        'Create the Notion action item': (items: any[]) => items.map((_, i) => ({ object: 'page', id: 'page-' + i })),
      },
      expect: { reached: ['Extract action items with OpenAI', 'Create the Notion action item'], notReached: ['Load sample transcript', 'Extract action items by rule'], outward: 'some' },
      check: out => {
        const r = out['Match owners and due dates'][0];
        const f: string[] = [];
        if (r.actions[0]?.due !== '2026-10-14') f.push(`Wednesday after Monday 2026-10-12 is 2026-10-14, got ${r.actions[0]?.due}`);
        if (r.actions[1]?.owner !== 'Unassigned' || !r.actions[1]?.owner_note.includes('2 attendees')) f.push('ambiguous Tom should stay unassigned');
        if (r.actions[1]?.due !== '2026-10-16') f.push('end of week should be Friday 2026-10-16');
        if (out['Split into Notion pages'].length !== 2) f.push('two Notion pages expected');
        return f;
      },
    },
  ],
});
