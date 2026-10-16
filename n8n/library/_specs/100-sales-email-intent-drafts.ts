import { defineSpec } from '../_kit/spec';
import { trigger, code, ifTrue, ifWhen, merge, stop, switchOn, http, sheets, aiAgent } from '../_kit/n';

const cfg = (k: string) => `$('config').first().json.${k}`;

export default defineSpec({
  slug: 'sales-email-intent-drafts',
  title: 'Classify inbound sales emails with OpenAI and create Gmail reply drafts',
  summary: 'Reads new sales emails from Gmail, sorts each into pricing, demo, objection, unsubscribe, out-of-office or other with OpenAI or keyword rules, writes a reply draft in the same thread from a template per intent, and adds unsubscribe requests to a Google Sheets suppression list.',
  category: 'Sales and CRM',
  description: {
    who: 'Founders and small sales teams who answer the same five kinds of reply to their outreach every day. Each reply already has a draft waiting in the thread, and nothing is sent without a person pressing Send.',
    how: [
      'The Gmail trigger picks up new inbox emails. A manual run uses 7 sample replies.',
      'Senders from your own domains are skipped. The rest are classified by OpenAI when `USE_OPENAI` is true, or by keyword rules checked in a fixed order: unsubscribe, out of office, objection, demo, pricing.',
      'Pricing, demo and objection replies get a draft from `REPLY_TEMPLATES`, filled with the sender\'s first name and your links, and threaded under the original email.',
      'Unsubscribe requests get no draft. They are appended to the Suppression tab so outreach tools can exclude them. Out-of-office and unclear emails are left alone.',
      'A model answer with an unknown intent or confidence under `MIN_CONFIDENCE` is treated as unclear, so a weak guess never becomes a draft.',
    ],
    setup: [
      'Run it once as imported. It classifies the sample emails and stops at `STOP: dry run - no drafts created`.',
      'Connect Gmail to `New sales email in Gmail` and `Create the Gmail draft`, and set `OWN_DOMAINS`.',
      'Edit `REPLY_TEMPLATES`, `CALENDAR_URL` and `PRICING_URL`. Optionally add an OpenAI credential and set `USE_OPENAI = true`, and set `SUPPRESSION_SHEET_ID`.',
      'Check the planned drafts in `Pick a reply template`, then set `DRY_RUN = false`.',
    ],
    requirements: ['A Gmail account', 'Optional: an OpenAI API key', 'Optional: a Google Sheet with a Suppression tab'],
    customize: [
      '`INTENT_KEYWORDS` lists the phrases behind each rule.',
      '`REPLY_TEMPLATES` holds one reply per intent; {first_name}, {calendar_url} and {pricing_url} are filled in.',
      '`MAX_DRAFTS` caps drafts per run.',
    ],
  },
  config: {
    intro: ['USE_OPENAI false -> keyword rules classify the emails.', 'DRY_RUN true -> drafts and suppression rows are planned and shown, nothing is created.'],
    consts: [
      { name: 'USE_OPENAI', value: false, note: 'set true after adding an OpenAI credential to the agent model' },
      { name: 'MIN_CONFIDENCE', value: 0.6, note: 'model answers below this are treated as unclear' },
      { name: 'OWN_DOMAINS', value: ['northwind.example'], note: 'emails from these domains are never classified' },
      { name: 'INTENT_KEYWORDS', value: {
        unsubscribe: ['unsubscribe', 'remove me', 'stop emailing', 'opt out', 'take me off', 'do not contact'],
        out_of_office: ['out of office', 'automatic reply', 'auto-reply', 'on leave', 'away until', 'limited access to email'],
        objection: ['too expensive', 'no budget', 'not a priority', 'already use', 'already using', 'not interested', 'not the right time', 'next quarter'],
        demo: ['demo', 'walkthrough', 'walk me through', 'book a call', 'jump on a call', 'schedule a call', 'trial'],
        pricing: ['price', 'pricing', 'cost', 'quote', 'how much', 'per seat', 'plans'],
      }, note: 'phrases per intent; the first intent in this order with a hit wins' },
      { name: 'REPLY_TEMPLATES', value: {
        pricing: 'Hi {first_name},\n\nThanks for asking. Our plans and what each includes are here: {pricing_url}\n\nIf you tell me your team size I can point you to the right one, or we can go through it on a short call: {calendar_url}\n\nBest,\n{sender_name}',
        demo: 'Hi {first_name},\n\nHappy to show you around. Pick any 30-minute slot that suits you here: {calendar_url}\n\nIf you send me the one problem you most want to solve, I will build the demo around it.\n\nBest,\n{sender_name}',
        objection: 'Hi {first_name},\n\nThanks for the honest reply. That is fair.\n\nWould it be useful if I checked back in next quarter, or should I close this out on my side?\n\nBest,\n{sender_name}',
      }, note: 'reply body per intent; intents without a template get no draft' },
      { name: 'SENDER_NAME', value: 'Ana Ruiz', note: 'sign-off' },
      { name: 'CALENDAR_URL', value: 'https://cal.northwind.example/ana/30min', note: 'booking link used in templates' },
      { name: 'PRICING_URL', value: 'https://northwind.example/pricing', note: 'pricing page used in templates' },
      { name: 'SUPPRESSION_SHEET_ID', value: '', note: 'Google Sheets id with a Suppression tab; blank keeps unsubscribes in the run output only' },
      { name: 'MAX_DRAFTS', value: 25, note: 'hard ceiling on drafts per run' },
    ],
    flags: { sheets_enabled: "SUPPRESSION_SHEET_ID.trim() !== ''" },
    safety: 'dry_run',
  },
  nodes: [
    trigger.manual(),
    trigger.gmail('New sales email in Gmail', 'in:inbox -from:me -category:promotions -category:social'),
    code('Read the incoming emails', `
// Gmail trigger items (simple: false) -> one shape. A manual run has none.
let items = [];
try { items = $('New sales email in Gmail').all().map(i => i.json); } catch (e) { items = []; }
const emails = items.filter(m => m && m.id).map(m => {
  const from = m.from?.value?.[0] || {};
  return { id: m.id, thread_id: m.threadId, message_id: m.messageId || m.headers?.['message-id'] || '', from_email: String(from.address || '').toLowerCase(),
    from_name: from.name || '', subject: m.subject || '', text: String(m.text || '').slice(0, 4000) };
});
return emails.length ? emails.map(json => ({ json: { has_email: true, ...json } })) : [{ json: { has_email: false } }];`),
    ifTrue('Email received?', '$json.has_email'),
    code('Load sample sales emails', `
// Used on a manual run: one reply of each kind, plus a colleague who must be skipped.
const e = (id, from_name, from_email, subject, text) => ({ has_email: true, id, thread_id: 't' + id, message_id: '<' + id + '@mail.example>', from_email, from_name, subject, text });
return [
  e('m1', 'Sam Patel', 'sam@harbour-dental.example', 'Re: Booking reminders for clinics', 'Hi Ana, this looks useful. How much is it for 3 locations? Is pricing per seat?'),
  e('m2', 'Rosa Diaz', 'rosa@orchardlane.example', 'Re: Quick question', 'Could you walk me through it next week? A demo would help me pitch it to my partner.'),
  e('m3', 'Ken Ito', 'ken@pineco.example', 'Re: Following up', 'Honestly it looks too expensive for us right now and it is not a priority until next quarter.'),
  e('m4', 'Mia Novak', 'mia@novakjoinery.example', 'Re: Following up', 'Please remove me from this list.'),
  e('m5', 'Joel Grant', 'joel@lumenphysio.example', 'Automatic reply: Following up', 'I am out of office until Monday with limited access to email.'),
  e('m6', 'Lee Chen', 'lee@northwind.example', 'Fwd: Harbour Dental', 'Can you look at the pricing they asked about?'),
  e('m7', 'Dana Okafor', 'dana@brightside.example', 'Re: Hello', 'Who gave you my address?'),
].map(json => ({ json }));`),
    merge('Combine email sources'),
    ifTrue('OpenAI enabled?', cfg('use_openai')),
    aiAgent('Classify intent with OpenAI', {
      prompt: 'From: {{ $json.from_name }} <{{ $json.from_email }}>\nSubject: {{ $json.subject }}\n\n{{ $json.text }}',
      system: 'You classify replies to sales outreach. Choose exactly one intent: pricing (asks about cost or plans), demo (wants a call, demo or trial), objection (pushes back on price, timing or fit), unsubscribe (asks to stop receiving emails), out_of_office (automatic away reply), other. Give a confidence from 0 to 1 and a short reason.',
      schemaExample: { intent: 'pricing', confidence: 0.86, reason: 'asks how much it costs for 3 locations' },
    }),
    code('Classify intent by rules', `
// Keyword rules in a fixed order, so "too expensive" is an objection, not a pricing
// question, and an auto-reply mentioning a demo stays out of office.
const cfg = $('config').first().json;
const order = Object.keys(cfg.intent_keywords);
return $input.all().map(({ json: m }) => {
  const text = (m.subject + ' ' + m.text).toLowerCase();
  const hits = {};
  for (const intent of order) hits[intent] = cfg.intent_keywords[intent].filter(k => text.includes(k));
  const intent = order.find(i => hits[i].length) || 'other';
  return { json: { ...m, intent, confidence: intent === 'other' ? 0 : Math.min(1, 0.6 + 0.15 * hits[intent].length), reason: intent === 'other' ? 'no keyword matched' : 'matched: ' + hits[intent].join(', '), method: 'rules' } };
});`),
    merge('Combine classifications'),
    code('Pick a reply template', `
// Model output is re-joined to its email by position. Unknown intents and weak model
// answers become 'other'. Own-domain senders are skipped before anything else.
const cfg = $('config').first().json;
const emails = $('Combine email sources').all().map(i => i.json);
const valid = ['pricing', 'demo', 'objection', 'unsubscribe', 'out_of_office', 'other'];
const b64url = s => Buffer.from(s, 'utf8').toString('base64').replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '');
let drafts = 0;
return $input.all().map(({ json }, i) => {
  const m = json.output ? emails[i] : json;
  let intent = json.output ? String(json.output.intent || '') : json.intent;
  const confidence = json.output ? Number(json.output.confidence || 0) : json.confidence;
  let note = json.output ? (json.output.reason || '') : json.reason;
  if (json.output && (!valid.includes(intent) || confidence < cfg.min_confidence)) { note = 'model answer "' + intent + '" at ' + confidence + ' treated as unclear'; intent = 'other'; }
  const domain = m.from_email.split('@')[1] || '';
  let action = 'none';
  if (cfg.own_domains.includes(domain)) { action = 'none'; note = 'own domain, skipped'; intent = 'internal'; }
  else if (intent === 'unsubscribe') action = 'suppress';
  else if (cfg.reply_templates[intent]) action = drafts++ < cfg.max_drafts ? 'draft' : 'none';
  const first = (m.from_name || '').split(' ')[0] || 'there';
  const body = action === 'draft' ? cfg.reply_templates[intent].replace(/{first_name}/g, first).replace(/{calendar_url}/g, cfg.calendar_url)
    .replace(/{pricing_url}/g, cfg.pricing_url).replace(/{sender_name}/g, cfg.sender_name) : '';
  const subject = /^re:/i.test(m.subject) ? m.subject : 'Re: ' + m.subject;
  const raw = action === 'draft' ? [
    'To: ' + (m.from_name ? '"' + m.from_name + '" ' : '') + '<' + m.from_email + '>', 'Subject: ' + subject,
    ...(m.message_id ? ['In-Reply-To: ' + m.message_id, 'References: ' + m.message_id] : []),
    'Content-Type: text/plain; charset="UTF-8"', '', body,
  ].join('\\r\\n') : '';
  return { json: { id: m.id, thread_id: m.thread_id, from_email: m.from_email, from_name: m.from_name, subject: m.subject, intent, note, action, body,
    draft_request: raw ? { message: { raw: b64url(raw), threadId: m.thread_id } } : null,
    suppression_row: action === 'suppress' ? { Email: m.from_email, Name: m.from_name, Reason: 'replied to unsubscribe', Date: new Date().toISOString().slice(0, 10), Subject: m.subject } : null } };
});`),
    switchOn('Route by action', '$json.action', ['draft', 'suppress']),
    stop('STOP: no reply needed'),
    ifWhen('Add to suppression list?', [[cfg('live'), 'true'], [cfg('sheets_enabled'), 'true']]),
    stop('STOP: dry run - suppression list untouched'),
    code('Shape the suppression row', `
// Only the sheet columns.
return $input.all().map(i => ({ json: i.json.suppression_row }));`),
    sheets.append('Add to the suppression sheet', cfg('suppression_sheet_id'), 'Suppression'),
    ifTrue('Create drafts?', cfg('live')),
    stop('STOP: dry run - no drafts created'),
    http('Create the Gmail draft', { method: 'POST', url: 'https://gmail.googleapis.com/gmail/v1/users/me/drafts', auth: 'gmailOAuth2', jsonBody: 'JSON.stringify($json.draft_request)' }),
  ],
  edges: [
    ['Run manually', 'config'], ['New sales email in Gmail', 'config'],
    ['config', 'Read the incoming emails'],
    ['Read the incoming emails', 'Email received?'],
    ['Email received?', 0, 'Combine email sources'], ['Email received?', 1, 'Load sample sales emails'],
    ['Load sample sales emails', 0, 'Combine email sources', 1],
    ['Combine email sources', 'OpenAI enabled?'],
    ['OpenAI enabled?', 0, 'Classify intent with OpenAI'], ['OpenAI enabled?', 1, 'Classify intent by rules'],
    ['Classify intent with OpenAI model', 'Classify intent with OpenAI', 'ai_languageModel'],
    ['Classify intent with OpenAI output format', 'Classify intent with OpenAI', 'ai_outputParser'],
    ['Classify intent with OpenAI', 'Combine classifications'], ['Classify intent by rules', 0, 'Combine classifications', 1],
    ['Combine classifications', 'Pick a reply template'],
    ['Pick a reply template', 'Route by action'],
    ['Route by action', 0, 'Create drafts?'], ['Route by action', 1, 'Add to suppression list?'], ['Route by action', 2, 'STOP: no reply needed'],
    ['Add to suppression list?', 0, 'Shape the suppression row'], ['Add to suppression list?', 1, 'STOP: dry run - suppression list untouched'],
    ['Shape the suppression row', 'Add to the suppression sheet'],
    ['Create drafts?', 0, 'Create the Gmail draft'], ['Create drafts?', 1, 'STOP: dry run - no drafts created'],
  ],
  groups: [
    { title: 'Start and settings', why: 'The Gmail trigger polls the inbox every minute; `Run manually` replays sample replies. Keywords, templates, links and the confidence floor all live in `config`.', nodes: ['Run manually', 'New sales email in Gmail', 'config'] },
    { title: 'Read the emails', why: '`Read the incoming emails` keeps the thread id and Message-ID, which the draft needs to land in the right conversation. A manual run uses `Load sample sales emails`.', nodes: ['Read the incoming emails', 'Email received?', 'Load sample sales emails', 'Combine email sources'] },
    { title: 'Classify intent', why: 'OpenAI is optional. `Classify intent by rules` checks unsubscribe and out of office before anything else, so an auto-reply or opt-out is never answered with a sales pitch.', nodes: ['OpenAI enabled?', 'Classify intent with OpenAI', 'Classify intent by rules', 'Combine classifications'] },
    { title: 'Choose the action and suppress', why: 'Each email gets one action: draft, suppress or none. Unsubscribes go to the Suppression tab instead of getting a reply, and only on a live run with a sheet id.', nodes: ['Pick a reply template', 'Route by action', 'Add to suppression list?', 'STOP: no reply needed', 'Shape the suppression row', 'STOP: dry run - suppression list untouched', 'Add to the suppression sheet'] },
    { title: 'Create drafts', why: 'Drafts are created, never sent: a person reads each one in Gmail first. `Create drafts?` opens only when `DRY_RUN` is false, so the first runs only show the planned replies.', nodes: ['Create drafts?', 'STOP: dry run - no drafts created', 'Create the Gmail draft'] },
  ],
  scenarios: [
    {
      name: 'shipped config (dry run, sample replies)', start: 'Run manually',
      expect: { reached: ['Load sample sales emails', 'Classify intent by rules', 'STOP: dry run - no drafts created', 'STOP: dry run - suppression list untouched', 'STOP: no reply needed'], notReached: ['Classify intent with OpenAI'], outward: 'none' },
      check: out => {
        const p = out['Pick a reply template'];
        const f: string[] = [];
        const got = p.map((x: any) => x.id + ':' + x.intent + ':' + x.action).join(',');
        const want = 'm1:pricing:draft,m2:demo:draft,m3:objection:draft,m4:unsubscribe:suppress,m5:out_of_office:none,m6:internal:none,m7:other:none';
        if (got !== want) f.push(`expected ${want}, got ${got}`);
        const raw = Buffer.from(p[0].draft_request.message.raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
        if (!raw.includes('In-Reply-To: <m1@mail.example>') || !raw.includes('Hi Sam,') || !raw.includes('https://northwind.example/pricing')) f.push('pricing draft should thread and fill the template');
        if (p[0].draft_request.message.threadId !== 'tm1') f.push('draft must carry the thread id');
        return f;
      },
    },
    {
      name: 'live Gmail trigger with OpenAI', start: 'New sales email in Gmail',
      overrides: { USE_OPENAI: true, DRY_RUN: false, SUPPRESSION_SHEET_ID: '1SuppressionSheetExample' },
      input: [
        { id: 'g1', threadId: 'th1', messageId: '<g1@mail.example>', subject: 'Re: Intro', text: 'Can we set up a demo on Thursday?', from: { value: [{ address: 'Ivy@AcmeBikes.example', name: 'Ivy Moss' }], text: 'Ivy Moss <Ivy@AcmeBikes.example>' } },
        { id: 'g2', threadId: 'th2', messageId: '<g2@mail.example>', subject: 'Re: Intro', text: 'Please stop emailing me.', from: { value: [{ address: 'ola@berg.example', name: 'Ola Berg' }], text: 'Ola Berg' } },
        { id: 'g3', threadId: 'th3', messageId: '<g3@mail.example>', subject: 'Re: Intro', text: 'hmm', from: { value: [{ address: 'x@y.example', name: '' }], text: '' } },
      ],
      mocks: {
        'Classify intent with OpenAI': [
          { output: { intent: 'demo', confidence: 0.93, reason: 'asks for a demo' } },
          { output: { intent: 'unsubscribe', confidence: 0.97, reason: 'asks to stop' } },
          { output: { intent: 'pricing', confidence: 0.3, reason: 'unclear' } },
        ],
        'Create the Gmail draft': (items: any[]) => items.map((_, i) => ({ id: 'r-' + i, message: { id: 'm-' + i, threadId: 'th1' } })),
        'Add to the suppression sheet': (items: any[]) => items,
      },
      expect: { reached: ['Classify intent with OpenAI', 'Create the Gmail draft', 'Add to the suppression sheet'], notReached: ['Load sample sales emails', 'Classify intent by rules'], outward: 'some' },
      check: out => {
        const p = out['Pick a reply template'];
        const f: string[] = [];
        if (p.map((x: any) => x.action).join(',') !== 'draft,suppress,none') f.push(`actions wrong: ${p.map((x: any) => x.action).join(',')}`);
        if (p[0].from_email !== 'ivy@acmebikes.example') f.push('sender email should be lower-cased');
        if (!p[2].note.includes('treated as unclear')) f.push('0.3 confidence should be unclear');
        if (out['Shape the suppression row'][0]?.Email !== 'ola@berg.example') f.push('Ola should be suppressed');
        return f;
      },
    },
  ],
});
