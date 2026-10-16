// REFERENCE SPEC. Copy this shape for new templates.
import { defineSpec } from '../_kit/spec';
import { trigger, code, ifTrue, merge, stop, http, gmail, slack, c } from '../_kit/n';

const cfg = (k: string) => `$('config').first().json.${k}`;

export default defineSpec({
  slug: 'stripe-overdue-invoice-reminders',
  title: 'Send overdue invoice reminders from Stripe with Gmail and a Slack summary',
  summary: 'Walks every open Stripe invoice down a 3/10/21-day reminder ladder, one step per invoice per run, skipping disputed and already-reminded ones, then posts what went out to Slack.',
  category: 'Finance and billing',
  description: {
    who: 'Small finance teams and agencies who bill through Stripe and chase late invoices by hand. It replaces the weekly "who owes us" spreadsheet with a ladder that runs every weekday morning.',
    how: [
      'Every weekday at 09:00 it reads open invoices from Stripe, or a built-in sample set until Stripe is connected.',
      'Each invoice gets the next step on the reminder ladder (3, 10 and 21 days overdue by default). The step already sent is read from the invoice metadata, so nobody gets the same email twice.',
      'Disputed invoices, invoices under the minimum amount and customers on the skip list are held back with a reason.',
      'Reminders go out through Gmail, the step is written back to the Stripe invoice, and one summary lands in Slack.',
    ],
    setup: [
      'Run it once as imported. It previews against sample invoices and stops at `STOP: preview - nothing sent`.',
      'Add a Stripe credential to `Fetch open invoices from Stripe` and `Record reminder step on Stripe`, then set `USE_STRIPE = true` in `config`.',
      'Connect Gmail and, optionally, Slack, and fill in `SLACK_CHANNEL_ID`.',
      'Put your own address in `TEST_EMAIL` to receive every reminder yourself. Set `TEST_RUN = false` when the wording is right.',
    ],
    requirements: ['A Stripe account with invoices', 'A Gmail account', 'Optional: a Slack workspace'],
    customize: [
      'Change the ladder in `LADDER`: days overdue, subject and tone for each step.',
      'Raise `MIN_AMOUNT` to stop chasing small balances, or add customer ids to `SKIP_CUSTOMERS`.',
      '`DAILY_CAP` limits how many reminders one run can send.',
    ],
  },
  config: {
    intro: ['USE_STRIPE false -> the run uses SAMPLE invoices so it works before any credential exists.', 'SLACK_CHANNEL_ID blank -> no summary is posted.'],
    consts: [
      { name: 'USE_STRIPE', value: false, note: 'set true after adding the Stripe credential to the two Stripe nodes' },
      { name: 'LADDER', value: [
        { step: 1, days: 3, subject: 'A gentle reminder about invoice {number}', tone: 'friendly' },
        { step: 2, days: 10, subject: 'Invoice {number} is now {days} days overdue', tone: 'firm' },
        { step: 3, days: 21, subject: 'Final reminder: invoice {number}', tone: 'final' },
      ], note: 'reminder ladder: days overdue that unlocks each step' },
      { name: 'MIN_AMOUNT', value: 50, note: 'invoices with less than this left to pay are not chased (major units)' },
      { name: 'SKIP_CUSTOMERS', value: [], note: 'Stripe customer ids that are never chased automatically' },
      { name: 'DAILY_CAP', value: 25, note: 'hard ceiling on reminders per run' },
      { name: 'SENDER_NAME', value: 'Accounts team', note: 'sign-off on every reminder' },
      { name: 'SLACK_CHANNEL_ID', value: '', note: 'channel for the run summary; blank skips Slack' },
    ],
    flags: { slack_enabled: "SLACK_CHANNEL_ID.trim() !== ''" },
    safety: 'test_run',
  },
  nodes: [
    trigger.manual(),
    trigger.schedule('Every weekday at 09:00', '0 9 * * 1-5'),
    ifTrue('Stripe connected?', cfg('use_stripe')),
    http('Fetch open invoices from Stripe', { url: 'https://api.stripe.com/v1/invoices', auth: 'stripeApi', query: { status: 'open', limit: '100', 'expand[]': 'data.customer' } }),
    code('Read Stripe invoices', `
// Stripe list response -> one item per invoice, in the shape the ladder reads.
const out = [];
for (const page of $input.all()) {
  for (const inv of page.json.data || []) {
    out.push({ json: {
      id: inv.id, number: inv.number || inv.id, customer_id: typeof inv.customer === 'object' ? inv.customer?.id : inv.customer,
      customer_name: inv.customer_name || inv.customer?.name || '', email: inv.customer_email || inv.customer?.email || '',
      amount_due: (inv.amount_remaining ?? inv.amount_due ?? 0) / 100, currency: (inv.currency || 'usd').toUpperCase(),
      due_date: inv.due_date ? new Date(inv.due_date * 1000).toISOString().slice(0, 10) : null,
      hosted_url: inv.hosted_invoice_url || '', disputed: Boolean(inv.metadata?.disputed === 'true'),
      last_step: Number(inv.metadata?.reminder_step || 0),
    } });
  }
}
return out;`),
    code('Load sample invoices', `
// Used until USE_STRIPE is true. Dates are relative to today so the ladder always has work.
const day = n => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
return [
  { id: 'in_sample_1', number: 'INV-1041', customer_id: 'cus_a', customer_name: 'Harbour Dental', email: 'ap@harbour-dental.example', amount_due: 1200, currency: 'USD', due_date: day(4),  hosted_url: 'https://invoice.example/1041', disputed: false, last_step: 0 },
  { id: 'in_sample_2', number: 'INV-1038', customer_id: 'cus_b', customer_name: 'Northfield Studio', email: 'billing@northfield.example', amount_due: 640, currency: 'USD', due_date: day(12), hosted_url: 'https://invoice.example/1038', disputed: false, last_step: 1 },
  { id: 'in_sample_3', number: 'INV-1033', customer_id: 'cus_c', customer_name: 'Orchard Lane Cafe', email: 'owner@orchardlane.example', amount_due: 310, currency: 'USD', due_date: day(25), hosted_url: 'https://invoice.example/1033', disputed: true, last_step: 2 },
  { id: 'in_sample_4', number: 'INV-1044', customer_id: 'cus_d', customer_name: 'Pine & Co', email: 'accounts@pineco.example', amount_due: 20, currency: 'USD', due_date: day(9), hosted_url: 'https://invoice.example/1044', disputed: false, last_step: 0 },
  { id: 'in_sample_5', number: 'INV-1046', customer_id: 'cus_e', customer_name: 'Lumen Physio', email: 'admin@lumenphysio.example', amount_due: 980, currency: 'USD', due_date: day(1), hosted_url: 'https://invoice.example/1046', disputed: false, last_step: 0 },
].map(json => ({ json }));`),
    merge('Combine invoice sources'),
    code('Pick the next reminder step', `
// One step per invoice per run. A step is due when the invoice is at least that
// many days overdue AND the step has not been sent. Everything held back says why.
const cfg = $('config').first().json;
const ladder = [...cfg.ladder].sort((a, b) => a.days - b.days);
const today = new Date(new Date().toISOString().slice(0, 10));
const due = [], held = [];
for (const { json: inv } of $input.all()) {
  const daysOver = inv.due_date ? Math.floor((today - new Date(inv.due_date)) / 864e5) : -1;
  const next = ladder.find(s => s.step > inv.last_step && daysOver >= s.days);
  const reason =
    !inv.email ? 'no billing email' :
    inv.disputed ? 'disputed' :
    inv.amount_due < cfg.min_amount ? 'below MIN_AMOUNT' :
    cfg.skip_customers.includes(inv.customer_id) ? 'on SKIP_CUSTOMERS' :
    daysOver < 0 ? 'not overdue yet' :
    !next ? (inv.last_step >= ladder.length ? 'ladder finished' : 'next step not due yet') : '';
  if (reason) held.push({ number: inv.number, customer: inv.customer_name, reason });
  else due.push({ ...inv, days_overdue: daysOver, step: next.step, tone: next.tone, subject_tpl: next.subject });
}
due.sort((a, b) => b.days_overdue - a.days_overdue);
const capped = due.slice(0, cfg.daily_cap);
for (const x of due.slice(cfg.daily_cap)) held.push({ number: x.number, customer: x.customer_name, reason: 'over DAILY_CAP, next run' });
return [{ json: { reminders: capped, held, checked: $input.all().length } }];`),
    code('Write each reminder', `
// Facts come from the invoice; tone comes from the ladder step. No model involved.
const cfg = $('config').first().json;
const { reminders } = $input.first().json;
const money = (n, cur) => new Intl.NumberFormat('en-US', { style: 'currency', currency: cur }).format(n);
const opening = {
  friendly: 'Just a quick note in case this slipped through.',
  firm: 'We have not yet received payment for the invoice below.',
  final: 'This is our last automated reminder before we follow up by phone.',
};
return reminders.map(r => {
  const subject = r.subject_tpl.replace('{number}', r.number).replace('{days}', r.days_overdue);
  const body = [
    'Hi ' + (r.customer_name || 'there') + ',', '',
    opening[r.tone] || opening.friendly, '',
    'Invoice: ' + r.number,
    'Amount due: ' + money(r.amount_due, r.currency),
    'Due date: ' + r.due_date + ' (' + r.days_overdue + ' days ago)',
    r.hosted_url ? 'Pay online: ' + r.hosted_url : '', '',
    'If you have already paid, please ignore this email.', '',
    cfg.sender_name,
  ].filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\\n');
  return { json: { ...r, subject, body, send_to: cfg.mode === 'test' ? cfg.test_email : r.email } };
});`),
    ifTrue('Sending switched on?', cfg('sends_enabled')),
    stop('STOP: preview - nothing sent'),
    gmail.send('Email the reminder', { to: '$json.send_to', subject: "($('config').first().json.mode === 'test' ? '[TEST to ' + $json.email + '] ' : '') + $json.subject", message: '$json.body' }),
    ifTrue('Live run?', cfg('live')),
    stop('STOP: test send - Stripe untouched'),
    http('Record reminder step on Stripe', { method: 'POST', url: "={{ 'https://api.stripe.com/v1/invoices/' + $('Write each reminder').item.json.id }}", auth: 'stripeApi', query: { 'metadata[reminder_step]': "={{ $('Write each reminder').item.json.step }}" } }),
    code('Summarise the run', `
// One message whatever happened, including what was held back and why.
const cfg = $('config').first().json;
const picked = $('Pick the next reminder step').first().json;
const lines = picked.reminders.map(r => '- ' + r.number + ' ' + r.customer_name + ': step ' + r.step + ', ' + r.days_overdue + ' days');
const held = picked.held.map(h => '- ' + h.number + ' ' + h.customer + ': ' + h.reason);
const text = [
  '*Invoice reminders* (' + cfg.mode + ')',
  picked.checked + ' open invoices checked, ' + picked.reminders.length + ' reminders' + (cfg.mode === 'preview' ? ' prepared' : ' sent') + '.',
  ...(lines.length ? ['', ...lines] : []),
  ...(held.length ? ['', 'Held back:', ...held] : []),
].join('\\n');
return [{ json: { text, sent: picked.reminders.length, held: picked.held.length } }];`),
    ifTrue('Slack channel set?', cfg('slack_enabled')),
    stop('STOP: no Slack channel'),
    slack.post('Post the summary to Slack', cfg('slack_channel_id'), '$json.text'),
  ],
  edges: [
    ['Run manually', 'config'], ['Every weekday at 09:00', 'config'],
    ['config', 'Stripe connected?'],
    ['Stripe connected?', 0, 'Fetch open invoices from Stripe'], ['Stripe connected?', 1, 'Load sample invoices'],
    ['Fetch open invoices from Stripe', 'Read Stripe invoices'],
    ['Read Stripe invoices', 'Combine invoice sources'], ['Load sample invoices', 0, 'Combine invoice sources', 1],
    ['Combine invoice sources', 'Pick the next reminder step'],
    ['Pick the next reminder step', 'Write each reminder'],
    ['Pick the next reminder step', 'Summarise the run'],
    ['Write each reminder', 'Sending switched on?'],
    ['Sending switched on?', 0, 'Email the reminder'], ['Sending switched on?', 1, 'STOP: preview - nothing sent'],
    ['Email the reminder', 'Live run?'],
    ['Live run?', 0, 'Record reminder step on Stripe'], ['Live run?', 1, 'STOP: test send - Stripe untouched'],
    ['Summarise the run', 'Slack channel set?'],
    ['Slack channel set?', 0, 'Post the summary to Slack'], ['Slack channel set?', 1, 'STOP: no Slack channel'],
  ],
  groups: [
    { title: 'Start and settings', why: 'Runs every weekday at 09:00 or by hand. Every setting lives in `config`, including the reminder ladder, so nothing else needs editing.', nodes: ['Run manually', 'Every weekday at 09:00', 'config'] },
    { title: 'Read open invoices', why: '`Stripe connected?` reads live invoices once `USE_STRIPE` is true. Until then `Load sample invoices` feeds the same shape, so the whole run can be watched before any credential exists.', nodes: ['Stripe connected?', 'Fetch open invoices from Stripe', 'Read Stripe invoices', 'Load sample invoices', 'Combine invoice sources'] },
    { title: 'Choose who gets which step and report it', why: 'The step already sent is stored on the invoice, so a reminder is never repeated. Disputed, tiny and skipped invoices are held with a reason, `DAILY_CAP` is enforced in code, and one Slack message lists every decision.', nodes: ['Pick the next reminder step', 'Write each reminder', 'Summarise the run', 'Slack channel set?', 'STOP: no Slack channel', 'Post the summary to Slack'] },
    { title: 'Send and record', why: 'Nothing is emailed while `TEST_RUN` is true and `TEST_EMAIL` is blank. A test send goes to you and leaves Stripe alone; only a live run writes the step back to the invoice.', nodes: ['Sending switched on?', 'STOP: preview - nothing sent', 'Email the reminder', 'Live run?', 'STOP: test send - Stripe untouched', 'Record reminder step on Stripe'] },
  ],
  scenarios: [
    {
      name: 'shipped config (preview)', start: 'Run manually',
      expect: { reached: ['Load sample invoices', 'STOP: preview - nothing sent', 'STOP: no Slack channel'], outward: 'none' },
      check: out => {
        const p = out['Pick the next reminder step'][0];
        const f: string[] = [];
        if (p.reminders.length !== 2) f.push(`expected 2 reminders from the sample, got ${p.reminders.length}`);
        if (!p.held.some((h: any) => h.reason === 'disputed')) f.push('disputed invoice not held');
        if (!p.held.some((h: any) => h.reason === 'below MIN_AMOUNT')) f.push('small invoice not held');
        return f;
      },
    },
    {
      name: 'test send to TEST_EMAIL', start: 'Run manually', overrides: { TEST_EMAIL: 'you@example.com' },
      expect: { reached: ['Email the reminder', 'STOP: test send - Stripe untouched'], notReached: ['Record reminder step on Stripe'], outward: 'some' },
      check: out => out['Write each reminder'].every((r: any) => r.send_to === 'you@example.com') ? [] : ['test send not redirected'],
    },
    {
      name: 'live with Stripe and Slack', start: 'Every weekday at 09:00',
      overrides: { USE_STRIPE: true, TEST_RUN: false, SLACK_CHANNEL_ID: 'C0123456' },
      mocks: {
        'Fetch open invoices from Stripe': [{ data: [
          { id: 'in_1', number: 'A-1', customer: { id: 'cus_1', name: 'Acme', email: 'ap@acme.example' }, amount_remaining: 50000, currency: 'usd',
            due_date: Math.floor(Date.now() / 1000) - 11 * 86400, hosted_invoice_url: 'https://pay.example/1', metadata: { reminder_step: '1' } },
        ] }],
        'Email the reminder': (items: any[]) => items.map(i => ({ ...i, id: 'msg_1' })),
        'Record reminder step on Stripe': (items: any[]) => items,
        'Post the summary to Slack': [{ ok: true }],
      },
      expect: { reached: ['Record reminder step on Stripe', 'Post the summary to Slack'], outward: 'some' },
      check: out => out['Write each reminder'][0]?.step === 2 ? [] : ['live invoice should be on step 2'],
    },
  ],
});
