import { defineSpec } from '../_kit/spec';
import { trigger, code, ifTrue, ifWhen, merge, stop, http, splitOut } from '../_kit/n';

const cfg = (k: string) => `$('config').first().json.${k}`;

export default defineSpec({
  slug: 'brevo-welcome-sequence',
  title: 'Send a welcome sequence to new Brevo contacts based on signup source',
  summary: 'Every hour, reads Brevo contacts created in the last week, picks a welcome variant from their SOURCE attribute, sends the day 0, 2 and 5 emails through the Brevo transactional API one step at a time, and stops for anyone who unsubscribed.',
  category: 'Marketing and content',
  description: {
    who: 'Small teams on Brevo who collect signups from a trial form, webinars and content downloads, and want each group welcomed differently without building three automations in the Brevo editor.',
    how: [
      'Every hour from 08:00 to 18:00 it reads contacts created in the last 7 days from Brevo, or 7 sample contacts until Brevo is connected.',
      'The SOURCE attribute picks the variant (trial, webinar, content or default), and the WELCOME_STEP attribute says which email went last.',
      'The next email is sent once its day (0, 2 or 5 after signup) arrives. Unsubscribed and hard-bounced contacts stop, contacts who signed up before the sequence existed are left alone, and at most 100 emails go per run.',
      'Each email goes through the Brevo transactional API and WELCOME_STEP is updated on the contact, so a step is never repeated.',
    ],
    setup: [
      'Run it once as imported. It plans emails for the sample contacts and stops at `STOP: preview - nothing sent`.',
      'In Brevo, create the number attribute WELCOME_STEP and a text attribute SOURCE that your forms fill in.',
      'Add a Brevo credential to the three Brevo nodes, set `SENDER` to a verified sender and set `USE_BREVO = true`.',
      'Put your address in `TEST_EMAIL` to receive every email yourself, then set `TEST_RUN = false`.',
    ],
    requirements: ['A Brevo account with transactional email enabled', 'Signup forms that set a SOURCE attribute'],
    customize: [
      '`SEQUENCES` holds the subject and opening line of every email per variant.',
      '`SOURCE_MAP` maps your SOURCE values to a variant.',
      '`START_WITHIN_DAYS` and `DAILY_CAP` control who starts the sequence and how many emails one run sends.',
    ],
  },
  config: {
    intro: ['USE_BREVO false -> SAMPLE contacts.', 'Sends go through the Brevo transactional API; WELCOME_STEP is written only on a live run.'],
    consts: [
      { name: 'USE_BREVO', value: false, note: 'set true after adding the Brevo credential to the three Brevo nodes' },
      { name: 'SENDER', value: { name: 'Mara at Tallyroom', email: 'hello@yourcompany.example' }, note: 'verified Brevo sender' },
      { name: 'SEQUENCE_DAYS', value: [0, 2, 5], note: 'days after signup for steps 1, 2 and 3' },
      { name: 'SOURCE_MAP', value: { trial: 'trial', 'free-trial': 'trial', webinar: 'webinar', ebook: 'content', guide: 'content', checklist: 'content' }, note: 'SOURCE attribute value (lowercase) -> variant; anything else uses default' },
      { name: 'SEQUENCES', value: {
        trial: [
          { subject: 'Your trial is ready, here is the 5-minute setup', line: 'Most teams are set up after three steps: invite one colleague, connect a card and upload last month of receipts.' },
          { subject: 'The one report trial users open most', line: 'The spend-by-person report shows where the money went last month, and it fills itself once receipts are in.' },
          { subject: 'Questions before your trial ends?', line: 'Reply to this email with anything that is not working. A person reads every reply within one working day.' },
        ],
        webinar: [
          { subject: 'Thanks for registering, here is what to expect', line: 'You will get the join link an hour before we start. Bring one question about your month-end process.' },
          { subject: 'The checklist from the session', line: 'This is the month-end checklist we walked through, ready to copy.' },
          { subject: 'Want to try it on your own numbers?', line: 'A free trial takes five minutes to set up and you can import last month to compare.' },
        ],
        content: [
          { subject: 'Your download is inside', line: 'Here is the link to the guide you asked for. It takes about 12 minutes to read.' },
          { subject: 'Three templates that go with the guide', line: 'These are the expense policy, approval rules and reimbursement templates referenced in chapter two.' },
          { subject: 'How one 12-person team uses it', line: 'Northwind Labs cut their close from six days to two with the steps in the guide.' },
        ],
        default: [
          { subject: 'Welcome to Tallyroom', line: 'Thanks for signing up. Here is where to start.' },
          { subject: 'Three things worth setting up first', line: 'Invite a colleague, connect a card and set one approval rule.' },
          { subject: 'Anything we can help with?', line: 'Reply to this email and a person will answer within one working day.' },
        ],
      }, note: 'per variant: one entry per step with subject and opening line (avoid apostrophes)' },
      { name: 'START_WITHIN_DAYS', value: 1, note: 'contacts older than this with no step sent never start (protects existing contacts on day one)' },
      { name: 'DAILY_CAP', value: 100, note: 'hard ceiling on emails per run' },
      { name: 'UNSUBSCRIBE_URL', value: 'https://www.yourcompany.example/unsubscribe', note: 'your unsubscribe page; the contact email is appended as ?email=' },
    ],
    safety: 'test_run',
  },
  nodes: [
    trigger.manual(),
    trigger.schedule('Every hour from 08:00 to 18:00', '0 8-18 * * *'),
    ifTrue('Brevo connected?', cfg('use_brevo')),
    http('Fetch new Brevo contacts', {
      url: 'https://api.brevo.com/v3/contacts', auth: 'brevoApi',
      query: { limit: '1000', sort: 'desc', createdSince: `={{ new Date(Date.now() - (Math.max(...${cfg('sequence_days')}) + 2) * 864e5).toISOString() }}` },
    }),
    code('Read Brevo contacts', `
// Brevo /contacts -> flat contacts with the two attributes the sequence uses.
const out = [];
for (const page of $input.all()) for (const c of page.json.contacts || []) out.push({
  email: c.email, first_name: c.attributes?.FIRSTNAME || '', source: String(c.attributes?.SOURCE || ''), step: Number(c.attributes?.WELCOME_STEP || 0),
  created_at: c.createdAt, unsubscribed: Boolean(c.emailBlacklisted) });
return [{ json: { contacts: out } }];`),
    code('Load sample contacts', `
// Used until USE_BREVO is true. One contact per sequence decision.
const ago = d => new Date(Date.now() - d * 864e5).toISOString();
return [{ json: { contacts: [
  { email: 'ana@northwind-labs.example', first_name: 'Ana', source: 'Trial', step: 0, created_at: ago(0.1), unsubscribed: false },
  { email: 'ben@harbourdesign.example', first_name: 'Ben', source: 'webinar', step: 1, created_at: ago(2.2), unsubscribed: false },
  { email: 'cai@pineco.example', first_name: 'Cai', source: 'ebook', step: 2, created_at: ago(5.5), unsubscribed: false },
  { email: 'dee@lumenphysio.example', first_name: 'Dee', source: 'trial', step: 2, created_at: ago(3), unsubscribed: false },
  { email: 'eve@orchardlane.example', first_name: 'Eve', source: 'trial', step: 0, created_at: ago(0.5), unsubscribed: true },
  { email: 'fin@northfield.example', first_name: 'Fin', source: 'podcast', step: 0, created_at: ago(6), unsubscribed: false },
  { email: 'gia@studio.example', first_name: '', source: 'partner', step: 0, created_at: ago(0.2), unsubscribed: false },
] } }];`),
    merge('Combine contact sources'),
    code('Pick the next email per contact', `
// One step per contact per run: the first step after WELCOME_STEP whose day has
// arrived. A contact who never got step 1 and is older than START_WITHIN_DAYS
// was there before the sequence and is left alone.
const cfg = $('config').first().json;
const days = cfg.sequence_days;
const due = [], held = [];
for (const c of $input.first().json.contacts) {
  const age = (Date.now() - new Date(c.created_at).getTime()) / 864e5;
  const variant = cfg.source_map[c.source.trim().toLowerCase()] || 'default';
  const next = c.step + 1;
  const reason =
    c.unsubscribed ? 'unsubscribed or blocked' :
    next > days.length ? 'sequence finished' :
    c.step === 0 && age > cfg.start_within_days ? 'joined before the sequence started' :
    age < days[next - 1] ? 'step ' + next + ' due in ' + Math.ceil(days[next - 1] - age) + ' day(s)' : '';
  if (reason) { held.push({ email: c.email, reason }); continue; }
  due.push({ ...c, variant, next_step: next, age_days: Math.floor(age) });
}
due.sort((a, b) => a.next_step - b.next_step || b.age_days - a.age_days);
for (const d of due.slice(cfg.daily_cap)) held.push({ email: d.email, reason: 'over DAILY_CAP, next run' });
return [{ json: { emails: due.slice(0, cfg.daily_cap), held } }];`),
    ifWhen('Any emails due?', [['$json.emails.length', 'gt', 0]]),
    stop('STOP: no emails due'),
    splitOut('One item per contact', 'emails'),
    code('Write each email', `
// Subject and opening line from SEQUENCES, the rest is a fixed frame. Builds the
// Brevo /smtp/email payload; test mode sends to TEST_EMAIL with the real address in the subject.
const cfg = $('config').first().json;
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
return $input.all().map(({ json: c }) => {
  const copy = cfg.sequences[c.variant][c.next_step - 1];
  const to = cfg.mode === 'test' ? cfg.test_email : c.email;
  const html = '<p>Hi ' + esc(c.first_name || 'there') + ',</p><p>' + esc(copy.line) + '</p><p>' + esc(cfg.sender.name) + '</p>' +
    '<p style="font-size:12px;color:#777">You are getting this because you signed up. <a href="' + cfg.unsubscribe_url + '?email=' + encodeURIComponent(c.email) + '">Unsubscribe</a></p>';
  return { json: { email: c.email, step: c.next_step, variant: c.variant, subject: copy.subject, payload: {
    sender: cfg.sender, to: [{ email: to, name: c.first_name || undefined }],
    subject: (cfg.mode === 'test' ? '[TEST to ' + c.email + '] ' : '') + copy.subject, htmlContent: html,
    tags: ['welcome', 'welcome-' + c.variant, 'welcome-step-' + c.next_step] } } };
});`),
    ifTrue('Sending switched on?', cfg('sends_enabled')),
    stop('STOP: preview - nothing sent'),
    http('Send through Brevo', { method: 'POST', url: 'https://api.brevo.com/v3/smtp/email', auth: 'brevoApi', jsonBody: 'JSON.stringify($json.payload)' }),
    ifTrue('Live run?', cfg('live')),
    stop('STOP: test send - contacts untouched'),
    http('Record the step on the contact', {
      method: 'PUT', auth: 'brevoApi',
      url: "={{ 'https://api.brevo.com/v3/contacts/' + encodeURIComponent($('Write each email').item.json.email) }}",
      jsonBody: "JSON.stringify({ attributes: { WELCOME_STEP: $('Write each email').item.json.step } })",
    }),
  ],
  edges: [
    ['Run manually', 'config'], ['Every hour from 08:00 to 18:00', 'config'],
    ['config', 'Brevo connected?'],
    ['Brevo connected?', 0, 'Fetch new Brevo contacts'], ['Brevo connected?', 1, 'Load sample contacts'],
    ['Fetch new Brevo contacts', 'Read Brevo contacts'],
    ['Read Brevo contacts', 'Combine contact sources'], ['Load sample contacts', 0, 'Combine contact sources', 1],
    ['Combine contact sources', 'Pick the next email per contact'],
    ['Pick the next email per contact', 'Any emails due?'],
    ['Any emails due?', 0, 'One item per contact'], ['Any emails due?', 1, 'STOP: no emails due'],
    ['One item per contact', 'Write each email'],
    ['Write each email', 'Sending switched on?'],
    ['Sending switched on?', 0, 'Send through Brevo'], ['Sending switched on?', 1, 'STOP: preview - nothing sent'],
    ['Send through Brevo', 'Live run?'],
    ['Live run?', 0, 'Record the step on the contact'], ['Live run?', 1, 'STOP: test send - contacts untouched'],
  ],
  groups: [
    { title: 'Start and settings', why: 'Runs hourly in working hours, so a day 0 email arrives within an hour of signup. Every subject, opening line and source mapping is in `config`.', nodes: ['Run manually', 'Every hour from 08:00 to 18:00', 'config'] },
    { title: 'Read new contacts', why: 'Only contacts created in the last week are read, filtered by Brevo itself with createdSince. `Load sample contacts` covers every sequence decision, including an unsubscribe and a pre-existing contact.', nodes: ['Brevo connected?', 'Fetch new Brevo contacts', 'Read Brevo contacts', 'Load sample contacts', 'Combine contact sources'] },
    { title: 'Pick the next step', why: 'The step already sent lives on the contact in WELCOME_STEP, so the sequence survives a reinstall and is visible in Brevo. `START_WITHIN_DAYS` stops the first run from emailing everyone who joined last week.', nodes: ['Pick the next email per contact', 'Any emails due?', 'STOP: no emails due', 'One item per contact', 'Write each email'] },
    { title: 'Send and record', why: 'Nothing is sent in preview. A test send goes to `TEST_EMAIL` and leaves WELCOME_STEP alone; only a live send moves the contact on to the next step.', nodes: ['Sending switched on?', 'STOP: preview - nothing sent', 'Send through Brevo', 'Live run?', 'STOP: test send - contacts untouched', 'Record the step on the contact'] },
  ],
  scenarios: [
    {
      name: 'shipped config (preview)', start: 'Run manually',
      expect: { reached: ['Load sample contacts', 'STOP: preview - nothing sent'], notReached: ['Send through Brevo'], outward: 'none' },
      check: out => {
        const f: string[] = [];
        const p = out['Pick the next email per contact'][0];
        const got = p.emails.map((e: any) => e.email.split('@')[0] + ':' + e.variant + ':' + e.next_step).join();
        if (got !== 'ana:trial:1,gia:default:1,ben:webinar:2,cai:content:3') f.push(`emails wrong: ${got}`);
        const r = Object.fromEntries(p.held.map((h: any) => [h.email.split('@')[0], h.reason]));
        if (r.dee !== 'step 3 due in 2 day(s)') f.push(`dee: ${r.dee}`);
        if (r.eve !== 'unsubscribed or blocked') f.push(`eve: ${r.eve}`);
        if (r.fin !== 'joined before the sequence started') f.push(`fin: ${r.fin}`);
        const w = out['Write each email'].find((e: any) => e.email.startsWith('cai'));
        if (w?.subject !== 'How one 12-person team uses it') f.push('content step 3 subject wrong');
        return f;
      },
    },
    {
      name: 'live with Brevo', start: 'Every hour from 08:00 to 18:00',
      overrides: { USE_BREVO: true, TEST_RUN: false },
      mocks: {
        'Fetch new Brevo contacts': [{ count: 2, contacts: [
          { id: 11, email: 'kim@mailbox.example', emailBlacklisted: false, createdAt: new Date(Date.now() - 2.5 * 864e5).toISOString(), attributes: { FIRSTNAME: 'Kim', SOURCE: 'guide', WELCOME_STEP: 1 } },
          { id: 12, email: 'lou@inbox.example', emailBlacklisted: false, createdAt: new Date(Date.now() - 1.5 * 864e5).toISOString(), attributes: { FIRSTNAME: 'Lou', SOURCE: 'trial', WELCOME_STEP: 1 } },
        ] }],
        'Send through Brevo': (items: any[]) => items.map((_, i) => ({ messageId: '<msg' + i + '@smtp-relay.mailin.fr>' })),
        'Record the step on the contact': (items: any[]) => items.map(() => ({})),
      },
      expect: { reached: ['Send through Brevo', 'Record the step on the contact'], outward: 'some' },
      check: out => {
        const w = out['Write each email'];
        return w.length === 1 && w[0].payload.to[0].email === 'kim@mailbox.example' && w[0].step === 2 ? [] : [`expected only Kim on step 2: ${JSON.stringify(w.map((x: any) => x.email))}`];
      },
    },
  ],
});
