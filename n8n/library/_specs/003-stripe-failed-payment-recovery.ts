import { defineSpec } from '../_kit/spec';
import { trigger, code, ifTrue, merge, stop, http, gmail, slack } from '../_kit/n';

const cfg = (k: string) => `$('config').first().json.${k}`;

export default defineSpec({
  slug: 'stripe-failed-payment-recovery',
  title: 'Email card update links for failed Stripe subscription payments with Gmail',
  summary: 'Finds open subscription invoices whose card charge failed, sends a day 0, 3 and 7 recovery email with a Stripe billing portal link, stops as soon as the invoice is paid, and posts the run to Slack.',
  category: 'Finance and billing',
  description: {
    who: 'Subscription businesses on Stripe that lose renewals to expired or declined cards. It sends a short, plain email with a link to update the card, three times at most, and stops the moment the invoice is paid.',
    how: [
      'Every day at 10:00 it reads open subscription invoices with at least one failed charge from Stripe, or a sample set until Stripe is connected.',
      'Each invoice gets the next step of a day 0, day 3 and day 7 ladder, counted from the first failed charge. The step already sent is stored in the invoice metadata.',
      'Paid, canceled and finished invoices are held back with a reason, and `DAILY_CAP` limits sends per run.',
      'A fresh billing portal link is created for each customer, the email goes out through Gmail, and the step is written back to Stripe. Slack gets one summary.',
    ],
    setup: [
      'Run it once as imported. It previews against sample invoices and stops at `STOP: preview - nothing sent`.',
      'Add a Stripe credential to the three Stripe nodes, turn on the customer portal in Stripe Billing settings, then set `USE_STRIPE = true`.',
      'Connect Gmail and, optionally, Slack with `SLACK_CHANNEL_ID`.',
      'Put your address in `TEST_EMAIL` to receive every email yourself, then set `TEST_RUN = false` to go live.',
    ],
    requirements: ['A Stripe account with subscriptions and the customer portal turned on', 'A Gmail account', 'Optional: a Slack workspace'],
    customize: [
      '`LADDER` holds the day, subject and opening line of each step.',
      '`PORTAL_RETURN_URL` is where customers land after updating their card.',
      '`MIN_AMOUNT` and `DAILY_CAP` keep small balances and big batches out.',
    ],
  },
  config: {
    intro: ['USE_STRIPE false -> SAMPLE invoices so the run works before any credential exists.', 'SLACK_CHANNEL_ID blank -> no summary is posted.'],
    consts: [
      { name: 'USE_STRIPE', value: false, note: 'set true after adding the Stripe credential to the Stripe nodes' },
      { name: 'LADDER', value: [
        { step: 1, day: 0, subject: 'Your payment for {product} did not go through', opening: 'Your card was declined when we tried to renew your subscription. It happens, often because a card expired.' },
        { step: 2, day: 3, subject: 'Reminder: please update your card for {product}', opening: 'We still have not been able to collect your renewal payment.' },
        { step: 3, day: 7, subject: 'Last notice before {product} is paused', opening: 'This is our final reminder. Without a working card your subscription will be paused when Stripe stops retrying.' },
      ], note: 'days after the first failed charge that unlock each step' },
      { name: 'MIN_AMOUNT', value: 5, note: 'balances below this are not chased (major units)' },
      { name: 'DAILY_CAP', value: 40, note: 'hard ceiling on emails per run' },
      { name: 'PORTAL_RETURN_URL', value: 'https://www.yourcompany.example/account', note: 'where the billing portal sends customers back to' },
      { name: 'SENDER_NAME', value: 'The billing team', note: 'sign-off on every email' },
      { name: 'SLACK_CHANNEL_ID', value: '', note: 'channel for the run summary; blank skips Slack' },
    ],
    flags: { slack_enabled: "SLACK_CHANNEL_ID.trim() !== ''" },
    safety: 'test_run',
  },
  nodes: [
    trigger.manual(),
    trigger.schedule('Every day at 10:00', '0 10 * * *'),
    ifTrue('Stripe connected?', cfg('use_stripe')),
    http('Fetch open subscription invoices', { url: 'https://api.stripe.com/v1/invoices', auth: 'stripeApi', query: { status: 'open', collection_method: 'charge_automatically', limit: '100', 'expand[0]': 'data.customer', 'expand[1]': 'data.subscription' } }),
    code('Read failed invoices', `
// Keep invoices that belong to a subscription and have at least one failed charge.
// The first failure is close to finalisation, so days are counted from finalized_at.
const out = [];
for (const page of $input.all()) {
  for (const inv of page.json.data || []) {
    if (!inv.subscription) continue;
    const sub = typeof inv.subscription === 'object' ? inv.subscription : { id: inv.subscription, status: 'past_due' };
    const cust = typeof inv.customer === 'object' ? inv.customer : { id: inv.customer };
    out.push({ json: {
      id: inv.id, number: inv.number || inv.id, customer_id: cust.id, customer_name: inv.customer_name || cust.name || '',
      email: inv.customer_email || cust.email || '', amount_due: (inv.amount_remaining ?? inv.amount_due ?? 0) / 100,
      currency: (inv.currency || 'usd').toUpperCase(), product: inv.lines?.data?.[0]?.description || 'your subscription',
      failed_at: new Date((inv.status_transitions?.finalized_at || inv.created) * 1000).toISOString().slice(0, 10),
      attempt_count: inv.attempt_count || 0, subscription_status: sub.status, last_step: Number(inv.metadata?.dunning_step || 0),
    } });
  }
}
return out;`),
    code('Load sample invoices', `
// Used until USE_STRIPE is true. Seven invoices covering every ladder decision.
const day = n => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
const inv = (id, name, email, amt, d, step, extra = {}) => ({ id, number: id.toUpperCase(), customer_id: 'cus_' + id, customer_name: name, email,
  amount_due: amt, currency: 'USD', product: 'Pro plan (monthly)', failed_at: day(d), attempt_count: 1, subscription_status: 'past_due', last_step: step, ...extra });
return [
  inv('in_s1', 'Maya Ortiz', 'maya@brightloom.example', 49, 0, 0),
  inv('in_s2', 'Theo Grant', 'theo@quarry-labs.example', 99, 4, 1, { attempt_count: 2 }),
  inv('in_s3', 'Lena Fox', 'lena@fox-and-fern.example', 29, 8, 2, { attempt_count: 3 }),
  inv('in_s4', 'Ravi Shah', 'ravi@tallow.example', 49, 9, 3, { attempt_count: 4 }),
  inv('in_s5', 'Ines Park', 'ines@parkhaus.example', 99, 2, 1, { attempt_count: 2 }),
  inv('in_s6', 'Owen Blake', 'owen@blakeworks.example', 49, 5, 1, { subscription_status: 'canceled' }),
  inv('in_s7', 'Sara Lind', 'sara@lindgren.example', 0, 3, 1),
].map(json => ({ json }));`),
    merge('Combine invoice sources'),
    code('Pick the next recovery step', `
// One step per invoice per run. A step is due when the first failure is at least
// that many days old AND the step has not been sent. Paid or canceled stops the ladder.
const cfg = $('config').first().json;
const ladder = [...cfg.ladder].sort((a, b) => a.day - b.day);
const today = new Date(new Date().toISOString().slice(0, 10));
const due = [], held = [];
for (const { json: inv } of $input.all()) {
  const age = Math.floor((today - new Date(inv.failed_at)) / 864e5);
  const next = ladder.find(s => s.step > inv.last_step && age >= s.day);
  const reason =
    inv.amount_due <= 0 ? 'paid since the failure' :
    inv.subscription_status === 'canceled' ? 'subscription canceled' :
    inv.attempt_count < 1 ? 'no failed charge yet' :
    !inv.email ? 'no customer email' :
    inv.amount_due < cfg.min_amount ? 'below MIN_AMOUNT' :
    !next ? (inv.last_step >= ladder.length ? 'ladder finished' : 'next step not due yet') : '';
  if (reason) held.push({ number: inv.number, customer: inv.customer_name, reason });
  else due.push({ ...inv, days_since_failure: age, step: next.step, subject_tpl: next.subject, opening: next.opening });
}
due.sort((a, b) => b.amount_due - a.amount_due);
const capped = due.slice(0, cfg.daily_cap);
for (const x of due.slice(cfg.daily_cap)) held.push({ number: x.number, customer: x.customer_name, reason: 'over DAILY_CAP, next run' });
return [{ json: { emails: capped, held, checked: $input.all().length, at_risk: capped.reduce((s, x) => s + x.amount_due, 0) } }];`),
    code('Split into one item per email', `
// Fan out so the portal link, the email and the write-back each run once per invoice.
const cfg = $('config').first().json;
return $input.first().json.emails.map(e => ({ json: { ...e,
  subject: e.subject_tpl.replace('{product}', e.product),
  send_to: cfg.mode === 'test' ? cfg.test_email : e.email } }));`),
    ifTrue('Sending switched on?', cfg('sends_enabled')),
    stop('STOP: preview - nothing sent'),
    http('Create card update link', { method: 'POST', url: 'https://api.stripe.com/v1/billing_portal/sessions', auth: 'stripeApi', outward: false,
      query: { customer: '={{ $json.customer_id }}', return_url: `={{ ${cfg('portal_return_url')} }}` } }),
    code('Write the recovery email', `
// The portal session url is single-use and short-lived, so it is created right before the send.
const cfg = $('config').first().json;
const e = $('Split into one item per email').item.json;
const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: e.currency }).format(e.amount_due);
const body = [
  'Hi ' + (e.customer_name.split(' ')[0] || 'there') + ',', '',
  e.opening, '',
  'Amount: ' + money + ' for ' + e.product,
  'Update your card here: ' + $json.url, '',
  'Once the card is updated we retry the payment automatically. No need to reply.', '',
  cfg.sender_name,
].join('\\n');
return { json: { ...e, body, link: $json.url } };`, { perItem: true }),
    gmail.send('Email the card update link', { to: '$json.send_to', subject: "($('config').first().json.mode === 'test' ? '[TEST to ' + $json.email + '] ' : '') + $json.subject", message: '$json.body' }),
    ifTrue('Live run?', cfg('live')),
    stop('STOP: test send - Stripe untouched'),
    http('Record recovery step on Stripe', { method: 'POST', url: "={{ 'https://api.stripe.com/v1/invoices/' + $('Write the recovery email').item.json.id }}", auth: 'stripeApi',
      query: { 'metadata[dunning_step]': "={{ $('Write the recovery email').item.json.step }}" } }),
    code('Summarise the run', `
// One message whatever happened, with the revenue at risk and every held reason.
const cfg = $('config').first().json;
const p = $('Pick the next recovery step').first().json;
const lines = p.emails.map(e => '- ' + e.number + ' ' + e.customer_name + ': step ' + e.step + ', ' + e.currency + ' ' + e.amount_due);
const text = [
  '*Failed payment recovery* (' + cfg.mode + ')',
  p.checked + ' failed invoices checked, ' + p.emails.length + ' emails' + (cfg.mode === 'preview' ? ' prepared' : ' sent') + ', ' + p.at_risk.toFixed(2) + ' at risk.',
  ...(lines.length ? ['', ...lines] : []),
  ...(p.held.length ? ['', 'Held back:', ...p.held.map(h => '- ' + h.number + ' ' + h.customer + ': ' + h.reason)] : []),
].join('\\n');
return [{ json: { text } }];`),
    ifTrue('Slack channel set?', cfg('slack_enabled')),
    stop('STOP: no Slack channel'),
    slack.post('Post the summary to Slack', cfg('slack_channel_id'), '$json.text'),
  ],
  edges: [
    ['Run manually', 'config'], ['Every day at 10:00', 'config'],
    ['config', 'Stripe connected?'],
    ['Stripe connected?', 0, 'Fetch open subscription invoices'], ['Stripe connected?', 1, 'Load sample invoices'],
    ['Fetch open subscription invoices', 'Read failed invoices'],
    ['Read failed invoices', 'Combine invoice sources'], ['Load sample invoices', 0, 'Combine invoice sources', 1],
    ['Combine invoice sources', 'Pick the next recovery step'],
    ['Pick the next recovery step', 'Split into one item per email'],
    ['Pick the next recovery step', 'Summarise the run'],
    ['Split into one item per email', 'Sending switched on?'],
    ['Sending switched on?', 0, 'Create card update link'], ['Sending switched on?', 1, 'STOP: preview - nothing sent'],
    ['Create card update link', 'Write the recovery email'],
    ['Write the recovery email', 'Email the card update link'],
    ['Email the card update link', 'Live run?'],
    ['Live run?', 0, 'Record recovery step on Stripe'], ['Live run?', 1, 'STOP: test send - Stripe untouched'],
    ['Summarise the run', 'Slack channel set?'],
    ['Slack channel set?', 0, 'Post the summary to Slack'], ['Slack channel set?', 1, 'STOP: no Slack channel'],
  ],
  groups: [
    { title: 'Start and settings', why: 'Runs daily at 10:00, a few hours after Stripe usually retries cards, or by hand. The ladder wording and every limit live in `config`.', nodes: ['Run manually', 'Every day at 10:00', 'config'] },
    { title: 'Read failed invoices', why: 'Only open, automatically charged invoices tied to a subscription are read. `Load sample invoices` stands in until `USE_STRIPE` is true, with the same fields `Read failed invoices` produces.', nodes: ['Stripe connected?', 'Fetch open subscription invoices', 'Read failed invoices', 'Load sample invoices', 'Combine invoice sources'] },
    { title: 'Choose the step and report it', why: 'The sent step lives in invoice metadata, so a rerun never repeats an email. Paid and canceled invoices stop the ladder, `DAILY_CAP` is enforced in code, and Slack gets every held reason.', nodes: ['Pick the next recovery step', 'Split into one item per email', 'Summarise the run', 'Slack channel set?', 'STOP: no Slack channel', 'Post the summary to Slack'] },
    { title: 'Link, send and record', why: 'The portal link is created only after `Sending switched on?`, because portal sessions expire. A test send goes to `TEST_EMAIL` and leaves Stripe alone; only `Live run?` writes the step back.', nodes: ['Sending switched on?', 'STOP: preview - nothing sent', 'Create card update link', 'Write the recovery email', 'Email the card update link', 'Live run?', 'STOP: test send - Stripe untouched', 'Record recovery step on Stripe'] },
  ],
  scenarios: [
    {
      name: 'shipped config (preview)', start: 'Run manually',
      expect: { reached: ['Load sample invoices', 'STOP: preview - nothing sent', 'STOP: no Slack channel'], notReached: ['Create card update link'], outward: 'none' },
      check: out => {
        const p = out['Pick the next recovery step'][0];
        const f: string[] = [];
        const steps = Object.fromEntries(p.emails.map((e: any) => [e.id, e.step]));
        if (JSON.stringify(steps) !== JSON.stringify({ in_s2: 2, in_s1: 1, in_s3: 3 })) f.push(`expected steps s2:2 s1:1 s3:3, got ${JSON.stringify(steps)}`);
        const reasons = Object.fromEntries(p.held.map((h: any) => [h.number, h.reason]));
        if (reasons.IN_S4 !== 'ladder finished') f.push('in_s4 should have finished the ladder');
        if (reasons.IN_S5 !== 'next step not due yet') f.push('in_s5 step 2 is not due on day 2');
        if (reasons.IN_S6 !== 'subscription canceled') f.push('canceled subscription not held');
        if (reasons.IN_S7 !== 'paid since the failure') f.push('paid invoice not held');
        if (p.at_risk !== 177) f.push(`at risk should be 177, got ${p.at_risk}`);
        return f;
      },
    },
    {
      name: 'test send to TEST_EMAIL', start: 'Run manually', overrides: { TEST_EMAIL: 'you@example.com' },
      mocks: {
        'Create card update link': (items: any[]) => items.map((_, i) => ({ id: 'bps_' + i, object: 'billing_portal.session', url: 'https://billing.stripe.com/p/session/test_' + i })),
        'Email the card update link': (items: any[]) => items.map(i => ({ id: 'msg_' + i.id, labelIds: ['SENT'] })),
      },
      expect: { reached: ['Email the card update link', 'STOP: test send - Stripe untouched'], notReached: ['Record recovery step on Stripe'], outward: 'some' },
      check: out => {
        const w = out['Write the recovery email'];
        const f: string[] = [];
        if (w.length !== 3) f.push(`expected 3 emails, got ${w.length}`);
        if (!w.every((r: any) => r.send_to === 'you@example.com')) f.push('test send not redirected');
        if (!w.every((r: any) => r.body.includes('https://billing.stripe.com/p/session/test_'))) f.push('portal link missing from body');
        return f;
      },
    },
    {
      name: 'live with Stripe and Slack', start: 'Every day at 10:00',
      overrides: { USE_STRIPE: true, TEST_RUN: false, SLACK_CHANNEL_ID: 'C0123456' },
      mocks: {
        'Fetch open subscription invoices': [{ object: 'list', data: [
          { id: 'in_live1', number: 'B-77', customer: { id: 'cus_9', name: 'Nora Vance', email: 'nora@vance.example' }, amount_remaining: 4900, currency: 'usd',
            subscription: { id: 'sub_9', status: 'past_due' }, attempt_count: 2, status_transitions: { finalized_at: Math.floor(Date.now() / 1000) - 3 * 86400 - 3600 },
            lines: { data: [{ description: '1 x Team plan' }] }, metadata: { dunning_step: '1' } },
          { id: 'in_live2', number: 'B-78', customer: { id: 'cus_10', name: 'Ada Kim', email: 'ada@kim.example' }, amount_remaining: 1900, currency: 'usd',
            subscription: null, attempt_count: 1, status_transitions: { finalized_at: Math.floor(Date.now() / 1000) - 86400 }, metadata: {} },
        ] }],
        'Create card update link': [{ id: 'bps_1', url: 'https://billing.stripe.com/p/session/live_1' }],
        'Email the card update link': [{ id: 'msg_1', labelIds: ['SENT'] }],
        'Record recovery step on Stripe': (items: any[]) => items,
        'Post the summary to Slack': [{ ok: true }],
      },
      expect: { reached: ['Record recovery step on Stripe', 'Post the summary to Slack'], outward: 'some' },
      check: out => {
        const f: string[] = [];
        if (out['Read failed invoices'].length !== 1) f.push('one-off invoice without a subscription should be skipped');
        if (out['Write the recovery email'][0]?.step !== 2) f.push('live invoice should be on step 2');
        if (out['Write the recovery email'][0]?.subject !== 'Reminder: please update your card for 1 x Team plan') f.push('subject not filled');
        return f;
      },
    },
  ],
});
