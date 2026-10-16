import { defineSpec } from '../_kit/spec';
import { trigger, code, ifTrue, ifWhen, merge, stop, http, gmail } from '../_kit/n';

const cfg = (k: string) => `$('config').first().json.${k}`;

const FORM = 'Share your experience';

export default defineSpec({
  slug: 'testimonial-collection-form',
  title: 'Collect testimonials by form, score them, and queue approved ones in Airtable',
  summary: 'Collects customer testimonials through an n8n form, scores each one for length, specific detail, rating and attribution, checks publishing permission and language, picks a pull quote, files it in Airtable as ready to publish or needs review, and thanks the customer by email.',
  category: 'Sales and CRM',
  description: {
    who: 'Founders and marketers who ask happy customers for a testimonial and then lose the replies in an inbox. Strong, approved quotes arrive ready to publish; weak or risky ones wait for a person.',
    how: [
      'A customer fills in the hosted n8n form: name, email, company, role, rating, the testimonial and whether you may publish it.',
      'The text is scored out of 100: length, numbers and time frames, outcome words like "saved" or "cut", rating, and a named company and role. Shouting and repeated exclamation marks cost points.',
      'A blocked word, a missing permission or a score under 70 sends it to review with the reasons; everything else is queued as Ready to publish. The most specific short sentence becomes the pull quote.',
      'The record is created in Airtable and the customer gets a thank-you email that matches their permission choice.',
    ],
    setup: [
      'Run it once as imported from `Run manually`. It scores 3 sample testimonials and stops at `STOP: test run - Airtable untouched` and `STOP: preview - nothing sent`.',
      'Create an Airtable table with the fields listed in `Shape the Airtable record`, add the token credential and set `AIRTABLE_BASE_ID`.',
      'Connect Gmail and share the production form URL with customers.',
      'Put your address in `TEST_EMAIL` to receive the thank-you emails yourself, then set `TEST_RUN = false`.',
    ],
    requirements: ['An Airtable base', 'A Gmail account'],
    customize: [
      '`AUTO_QUEUE_SCORE` sets the bar for Ready to publish.',
      '`OUTCOME_WORDS` and `BLOCKED_WORDS` tune what counts as specific and what is never published.',
      '`THANKS_SUBJECT` and `SENDER_NAME` change the email.',
    ],
  },
  config: {
    intro: ['A manual run scores SAMPLE testimonials. AIRTABLE_BASE_ID blank -> nothing is stored.', 'Thank-you emails follow TEST_RUN and TEST_EMAIL like every send.'],
    consts: [
      { name: 'AIRTABLE_BASE_ID', value: '', note: 'Airtable base id (starts with app); blank means nothing is stored' },
      { name: 'AIRTABLE_TABLE', value: 'Testimonials', note: 'table name or id' },
      { name: 'AUTO_QUEUE_SCORE', value: 70, note: 'score from 0 to 100 needed for Ready to publish' },
      { name: 'OUTCOME_WORDS', value: ['saved', 'cut', 'reduced', 'faster', 'increased', 'grew', 'doubled', 'halved', 'switched', 'replaced', 'before', 'after', 'hours', 'minutes', 'weeks'], note: 'words that signal a concrete outcome' },
      { name: 'BLOCKED_WORDS', value: ['damn', 'crap', 'hell', 'shit', 'wtf'], note: 'whole words that send a testimonial to review' },
      { name: 'THANKS_SUBJECT', value: 'Thank you for the kind words', note: 'subject of the thank-you email' },
      { name: 'SENDER_NAME', value: 'Mara, Tallyroom', note: 'sign-off on the thank-you email' },
    ],
    flags: { airtable_enabled: "AIRTABLE_BASE_ID.trim() !== ''" },
    safety: 'test_run',
  },
  nodes: [
    trigger.manual(),
    trigger.form('Testimonial form', FORM, 'Two minutes, and it helps other teams decide. We never publish anything without your permission.', [
      { label: 'Your name', required: true }, { label: 'Email', type: 'email', required: true }, { label: 'Company' }, { label: 'Role' },
      { label: 'Rating', type: 'dropdown', options: ['5', '4', '3', '2', '1'], required: true },
      { label: 'Your testimonial', type: 'textarea', required: true },
      { label: 'May we publish this with your name and company?', type: 'dropdown', options: ['Yes', 'No'], required: true },
    ]),
    code('Read the form', `
// The form fields when a customer submitted; nothing when the run was started by hand.
let f = null;
try { f = $('Testimonial form').first().json; } catch (e) { f = null; }
const t = f ? [{ name: f['Your name'], email: f['Email'], company: f['Company'] || '', role: f['Role'] || '', rating: Number(f['Rating']),
  text: f['Your testimonial'], permission: f['May we publish this with your name and company?'] === 'Yes', submitted_at: f.submittedAt || new Date().toISOString() }] : [];
return [{ json: { from_form: Boolean(f), testimonials: t } }];`),
    ifTrue('Real submission?', '$json.from_form'),
    code('Load sample testimonials', `
// Used for manual runs: one strong, one too thin, one with a blocked word and no permission.
const now = new Date().toISOString();
return [{ json: { from_form: false, testimonials: [
  { name: 'Priya Nair', email: 'priya@northwind-labs.example', company: 'Northwind Labs', role: 'Head of Finance', rating: 5, permission: true, submitted_at: now,
    text: 'Before Tallyroom our month-end close took six days and two people. We switched in March and now close in two days with one person. Receipts are matched automatically, so I have not chased a receipt by email in weeks. It saved us roughly 20 hours a month.' },
  { name: 'Sam Ortiz', email: 'sam@harbourdesign.example', company: '', role: '', rating: 5, permission: true, submitted_at: now, text: 'GREAT PRODUCT!! Love it, highly recommend!!' },
  { name: 'Lee Park', email: 'lee@pineco.example', company: 'Pine & Co', role: 'Owner', rating: 4, permission: false, submitted_at: now,
    text: 'Setup was a damn sight faster than our old tool, about 30 minutes for the whole team. Approvals on mobile cut the back and forth with our site managers.' },
] } }];`),
    merge('Combine testimonial sources'),
    code('Score each testimonial', `
// Score out of 100. Length 0-25, specifics 0-40 (numbers and outcome words),
// rating 0-20, attribution 0-10, minus shouting. A blocked word, no permission or
// a low score routes to review; the reasons are kept for the reviewer.
const cfg = $('config').first().json;
const outcome = cfg.outcome_words, blocked = cfg.blocked_words;
return $input.first().json.testimonials.map(t => {
  const text = String(t.text || '').trim();
  const words = text.split(/\\s+/).filter(Boolean);
  const low = text.toLowerCase();
  const numbers = (text.match(/\\b\\d+(?:[.,]\\d+)?\\s?(%|percent|hours?|days?|weeks?|minutes?|months?|people|x)?/gi) || []).length;
  const outcomes = outcome.filter(w => new RegExp('\\\\b' + w + '\\\\b').test(low)).length;
  const caps = words.filter(w => w.length > 2 && w === w.toUpperCase() && /[A-Z]/.test(w)).length / Math.max(1, words.length);
  const bad = blocked.filter(w => new RegExp('\\\\b' + w + '\\\\b').test(low));
  const parts = {
    length: words.length < 15 ? 0 : words.length < 25 ? 10 : words.length <= 150 ? 25 : 15,
    specifics: Math.min(20, numbers * 10) + Math.min(20, outcomes * 5),
    rating: t.rating >= 5 ? 20 : t.rating === 4 ? 10 : 0,
    attribution: (t.company ? 5 : 0) + (t.role ? 5 : 0),
    penalty: (caps > 0.3 ? -15 : 0) + (/!!/.test(text) ? -5 : 0),
  };
  const score = Math.max(0, Object.values(parts).reduce((a, b) => a + b, 0));
  const reasons = [];
  if (bad.length) reasons.push('blocked word: ' + bad.join(', '));
  if (!t.permission) reasons.push('no permission to publish');
  if (score < cfg.auto_queue_score) reasons.push('score ' + score + ' under ' + cfg.auto_queue_score);
  if (t.rating < 4) reasons.push('rating ' + t.rating);
  const sentences = text.split(/(?<=[.!?])\\s+/).filter(s => { const n = s.split(/\\s+/).length; return n >= 6 && n <= 25; });
  const spec = s => (s.match(/\\d/g) || []).length * 3 + outcome.filter(w => s.toLowerCase().includes(w)).length * 2 - s.length / 100;
  const pull = [...sentences].sort((a, b) => spec(b) - spec(a))[0] || '';
  return { json: { ...t, text, word_count: words.length, score, parts, decision: reasons.length ? 'review' : 'queue', reasons, pull_quote: pull } };
});`),
    ifWhen('Live with Airtable?', [[cfg('live'), 'true'], [cfg('airtable_enabled'), 'true']]),
    code('Write the thank-you email', `
// Wording follows the permission answer, so nobody is told their words go public by mistake.
const cfg = $('config').first().json;
return $input.all().map(({ json: t }) => {
  const first = (t.name || '').split(' ')[0] || 'there';
  const body = 'Hi ' + first + ',\\n\\nThank you for taking the time to write this. ' +
    (t.permission ? 'We may feature it on our site; we will send you the link if we do, and you can ask us to take it down at any time.' : 'You asked us not to publish it, so it stays with our team. It still helps us decide what to build next.') +
    '\\n\\n' + cfg.sender_name;
  return { json: { email: t.email, subject: cfg.thanks_subject, body, send_to: cfg.mode === 'test' ? cfg.test_email : t.email } };
});`),
    stop('STOP: test run - Airtable untouched'),
    code('Shape the Airtable record', `
// Fields: Name, Email, Company, Role, Rating, Testimonial, Permission, Score,
// Status, Reasons, Pull quote, Submitted at.
const records = $input.all().map(({ json: t }) => ({ fields: {
  Name: t.name, Email: t.email, Company: t.company, Role: t.role, Rating: t.rating, Testimonial: t.text, Permission: t.permission,
  Score: t.score, Status: t.decision === 'queue' ? 'Ready to publish' : 'Needs review', Reasons: t.reasons.join('; '), 'Pull quote': t.pull_quote, 'Submitted at': t.submitted_at } }));
return [{ json: { payload: { records, typecast: true } } }];`),
    http('Create the Airtable record', {
      method: 'POST', auth: 'airtableTokenApi',
      url: `={{ 'https://api.airtable.com/v0/' + ${cfg('airtable_base_id')} + '/' + encodeURIComponent(${cfg('airtable_table')}) }}`,
      jsonBody: 'JSON.stringify($json.payload)',
    }),
    ifTrue('Sending switched on?', cfg('sends_enabled')),
    stop('STOP: preview - nothing sent'),
    gmail.send('Email the thank-you', { to: '$json.send_to', subject: "($('config').first().json.mode === 'test' ? '[TEST to ' + $json.email + '] ' : '') + $json.subject", message: '$json.body' }),
  ],
  edges: [
    ['Run manually', 'config'], ['Testimonial form', 'config'],
    ['config', 'Read the form'],
    ['Read the form', 'Real submission?'],
    ['Real submission?', 0, 'Combine testimonial sources'], ['Real submission?', 1, 'Load sample testimonials'],
    ['Load sample testimonials', 0, 'Combine testimonial sources', 1],
    ['Combine testimonial sources', 'Score each testimonial'],
    ['Score each testimonial', 'Live with Airtable?'],
    ['Score each testimonial', 'Write the thank-you email'],
    ['Live with Airtable?', 0, 'Shape the Airtable record'], ['Live with Airtable?', 1, 'STOP: test run - Airtable untouched'],
    ['Shape the Airtable record', 'Create the Airtable record'],
    ['Write the thank-you email', 'Sending switched on?'],
    ['Sending switched on?', 0, 'Email the thank-you'], ['Sending switched on?', 1, 'STOP: preview - nothing sent'],
  ],
  groups: [
    { title: 'Collect the testimonial', why: 'The hosted `Testimonial form` asks for permission as a required Yes or No, so consent is never inferred. A manual run feeds `Load sample testimonials` through the same path.', nodes: ['Run manually', 'Testimonial form', 'config', 'Read the form', 'Real submission?', 'Load sample testimonials', 'Combine testimonial sources'] },
    { title: 'Score and pick a pull quote', why: 'Specific numbers and outcomes are worth more than praise, because "cut close from six days to two" sells and "great product" does not. Every point is kept in parts, so a reviewer can see why a quote landed in review.', nodes: ['Score each testimonial'] },
    { title: 'File in Airtable and say thanks', why: 'Airtable is written only on a live run with a base id, review or not, so nothing is lost. The thank-you follows the usual preview and test gates and is redirected to `TEST_EMAIL` in test mode.', nodes: ['Live with Airtable?', 'Write the thank-you email', 'STOP: test run - Airtable untouched', 'Shape the Airtable record', 'Create the Airtable record', 'Sending switched on?', 'STOP: preview - nothing sent', 'Email the thank-you'] },
  ],
  scenarios: [
    {
      name: 'shipped config (manual sample testimonials)', start: 'Run manually',
      expect: { reached: ['Load sample testimonials', 'STOP: test run - Airtable untouched', 'STOP: preview - nothing sent'], outward: 'none' },
      check: out => {
        const f: string[] = [];
        const s = Object.fromEntries(out['Score each testimonial'].map((t: any) => [t.name.split(' ')[0], t]));
        if (s.Priya?.decision !== 'queue' || s.Priya.score < 70) f.push(`Priya should be queued: ${s.Priya?.score} ${s.Priya?.reasons}`);
        if (!/six days and two people|20 hours/.test(s.Priya?.pull_quote || '')) f.push(`pull quote not specific: ${s.Priya?.pull_quote}`);
        if (s.Sam?.decision !== 'review' || !s.Sam.reasons.some((r: string) => r.startsWith('score'))) f.push(`Sam should be in review for a low score: ${s.Sam?.score}`);
        if (s.Sam?.parts.penalty !== -20) f.push('shouting and !! should cost 20 points');
        if (!s.Lee?.reasons.includes('blocked word: damn') || !s.Lee.reasons.includes('no permission to publish')) f.push(`Lee reasons wrong: ${s.Lee?.reasons}`);
        if (!out['Write the thank-you email'].find((e: any) => e.email.startsWith('lee'))?.body.includes('stays with our team')) f.push('no-permission wording missing');
        return f;
      },
    },
    {
      name: 'live form submission', start: 'Testimonial form',
      input: [{ 'Your name': 'Ada Quinn', Email: 'ada@lumenphysio.example', Company: 'Lumen Physio', Role: 'Practice manager', Rating: '5',
        'Your testimonial': 'We replaced three spreadsheets with Tallyroom and reduced expense approval time from 5 days to under 24 hours. Our 9 physios submit receipts from their phones after each home visit.',
        'May we publish this with your name and company?': 'Yes', submittedAt: new Date().toISOString(), formMode: 'production' }],
      overrides: { AIRTABLE_BASE_ID: 'appTestimonials1', TEST_RUN: false },
      mocks: {
        'Create the Airtable record': [{ records: [{ id: 'recA1', fields: {} }] }],
        'Email the thank-you': [{ id: 'msg-1', labelIds: ['SENT'] }],
      },
      expect: { reached: ['Create the Airtable record', 'Email the thank-you'], notReached: ['Load sample testimonials'], outward: 'some' },
      check: out => {
        const r = out['Shape the Airtable record'][0].payload.records[0].fields;
        return r.Status === 'Ready to publish' && out['Write the thank-you email'][0].send_to === 'ada@lumenphysio.example' ? [] : [`live record wrong: ${JSON.stringify(r)}`];
      },
    },
  ],
});
