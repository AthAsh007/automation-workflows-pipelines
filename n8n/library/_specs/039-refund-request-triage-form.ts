import { defineSpec } from '../_kit/spec';
import { trigger, code, ifTrue, ifWhen, merge, stop, gmail, sheets } from '../_kit/n';

const cfg = (k: string) => `$('config').first().json.${k}`;

export default defineSpec({
  slug: 'refund-request-triage-form',
  title: 'Route refund requests from a form by policy rules with Gmail replies',
  summary: 'Takes refund requests through an n8n form, applies a policy table by product type (days since purchase, reason, amount), auto-approves, declines or sends to review, flags repeat requesters and large amounts, replies by Gmail with wording for each outcome, and logs every request to Google Sheets.',
  category: 'E-commerce',
  description: {
    who: 'Small online shops whose refund inbox is the same five cases every week. Clear cases get an answer in a minute; anything unusual waits for a person, with the policy reason written down.',
    how: [
      'A customer fills in the refund form: order number, email, purchase date, product type, amount, reason and details. A manual run uses 7 sample requests.',
      'Past requests are read from the log, so a second request from the same email within 90 days always goes to review.',
      'The policy table sets, per product type, the return window, the change-of-mind window and the amount that can be approved without a person. Anything over 300 is always reviewed.',
      'Fault reasons (damaged, not as described, late) inside the window are approved up to the limit; change-of-mind requests follow the stricter window, and digital goods are not refundable for change of mind.',
      'The customer gets the reply for their outcome, and the request is logged with the rule that decided it.',
    ],
    setup: [
      'Run it once as imported. It applies the policy to the samples and stops at `STOP: preview - nothing sent`.',
      'Edit `POLICY` and `REVIEW_ALWAYS_OVER` to match your refund policy, and the reply wording in `REPLIES`.',
      'Connect Gmail and Google Sheets, create a Refund requests tab, and put the sheet id in `LOG_SHEET_ID`.',
      'Activate the workflow and share the form URL. Put your address in `TEST_EMAIL` first, then set `TEST_RUN = false`.',
    ],
    requirements: ['A Gmail account', 'A Google Sheet for the log'],
    customize: [
      '`POLICY` holds windows and limits per product type; add a type and its dropdown option on the form.',
      '`FAULT_REASONS` decides which reasons use the fault rules.',
      '`REPEAT_DAYS` sets how far back repeat requests are checked.',
    ],
  },
  config: {
    intro: ['A manual run uses SAMPLE requests. LOG_SHEET_ID blank -> SAMPLE past requests, nothing logged.', 'TEST_RUN true + TEST_EMAIL blank -> preview only. Approval here only records the decision; the refund itself is issued by your team.'],
    consts: [
      { name: 'POLICY', value: {
        Physical: { window_days: 30, change_mind_days: 14, approve_max: 150, change_mind_max: 50 },
        Digital: { window_days: 14, change_mind_days: 0, approve_max: 30, change_mind_max: 0 },
        Subscription: { window_days: 7, change_mind_days: 7, approve_max: 30, change_mind_max: 30 },
        'Custom order': { window_days: 30, change_mind_days: 0, approve_max: 0, change_mind_max: 0 },
      }, note: 'per product type: return window, change-of-mind window (0 = never), most that is approved without review' },
      { name: 'FAULT_REASONS', value: ['Damaged or faulty', 'Not as described', 'Late delivery'], note: 'reasons that use the fault rules' },
      { name: 'REVIEW_ALWAYS_OVER', value: 300, note: 'any request above this amount goes to a person' },
      { name: 'REPEAT_DAYS', value: 90, note: 'a second request from the same email inside this many days goes to review' },
      { name: 'REPLIES', value: {
        approve: 'Your refund of {amount} for order {order} is approved. It will reach your original payment method within 5 to 10 business days.',
        review: 'Thanks, we have your request for order {order}. A member of the team will look at it and reply within 2 business days.',
        decline: 'We are sorry, but order {order} is not eligible for a refund: {why}. If you think this is wrong, reply to this email with any details we missed.',
      }, note: 'reply text per outcome; {order}, {amount} and {why} are filled in' },
      { name: 'SHOP_NAME', value: 'Northwind Goods', note: 'used in the subject and sign-off' },
      { name: 'LOG_SHEET_ID', value: '', note: 'Google Sheets id with a Refund requests tab; blank uses sample history and logs nothing' },
    ],
    flags: { log_enabled: "LOG_SHEET_ID.trim() !== ''" },
    safety: 'test_run',
  },
  nodes: [
    trigger.manual(),
    trigger.form('Refund request form', 'Request a refund', 'Tell us about the order. Most requests get an answer within a few minutes.', [
      { label: 'Order number', required: true },
      { label: 'Email', type: 'email', required: true },
      { label: 'Purchase date', type: 'date', required: true },
      { label: 'Product type', type: 'dropdown', options: ['Physical', 'Digital', 'Subscription', 'Custom order'], required: true },
      { label: 'Amount paid', type: 'number', required: true },
      { label: 'Reason', type: 'dropdown', options: ['Damaged or faulty', 'Not as described', 'Late delivery', 'Changed my mind', 'Other'], required: true },
      { label: 'Details', type: 'textarea' },
    ]),
    code('Read the form submission', `
// Form fields arrive under their labels. A manual run has no submission, so it
// returns a marker and the sample requests are used.
let subs = [];
try { if ($('Refund request form').isExecuted) subs = $('Refund request form').all().map(i => i.json); } catch (e) { subs = []; }
if (!subs.length) return [{ json: { source: 'none' } }];
return subs.map(s => ({ json: { source: 'form', order: String(s['Order number'] || '').trim().replace(/^#/, ''), email: String(s['Email'] || '').trim().toLowerCase(),
  purchased: s['Purchase date'], type: s['Product type'], amount: Number(s['Amount paid'] || 0), reason: s['Reason'], details: s['Details'] || '',
  submitted_at: s.submittedAt || new Date().toISOString() } }));`),
    ifTrue('Form submitted?', "$json.source === 'form'"),
    code('Load sample requests', `
// Used on a manual run. Two approvals, two declines, three reviews.
const day = n => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
return [
  ['R1', 'jade@willowmere.example', day(10), 'Physical', 89, 'Damaged or faulty', 'Lid arrived cracked.'],
  ['R2', 'kofi@ambergate.example', day(20), 'Physical', 40, 'Changed my mind', 'Colour does not suit the room.'],
  ['R3', 'lia@foxglove.example', day(3), 'Digital', 29, 'Changed my mind', 'Bought the wrong template.'],
  ['R4', 'max@redfern.example', day(5), 'Subscription', 25, 'Other', 'Forgot to cancel before renewal.'],
  ['R5', 'nell@kestrel.example', day(12), 'Physical', 420, 'Not as described', 'Sofa cover is a different fabric.'],
  ['R6', 'otto@brambles.example', day(15), 'Physical', 60, 'Damaged or faulty', 'Handle came off.'],
  ['R7', 'pia@thornbury.example', day(5), 'Custom order', 120, 'Damaged or faulty', 'Engraving is misspelled.'],
].map(([order, email, purchased, type, amount, reason, details]) => ({ json: { source: 'sample', order, email, purchased, type, amount, reason, details, submitted_at: new Date().toISOString() } }));`),
    merge('Combine request sources'),
    code('Collect the requests', `
// One item, so the log is read once however many requests came in.
return [{ json: { requests: $input.all().map(i => i.json).filter(r => r.source !== 'none') } }];`),
    ifTrue('Log sheet set?', cfg('log_enabled')),
    sheets.read('Read past requests', cfg('log_sheet_id'), 'Refund requests'),
    code('Load sample past requests', `
// Used until LOG_SHEET_ID is set. Otto asked for a refund 30 days ago.
const day = n => new Date(Date.now() - n * 864e5).toISOString();
return [
  { order: 'Q88', email: 'otto@brambles.example', outcome: 'approve', submitted_at: day(30) },
  { order: 'Q41', email: 'jade@willowmere.example', outcome: 'approve', submitted_at: day(200) },
].map(json => ({ json }));`),
    merge('Combine request history'),
    code('Apply the refund policy', `
// Order of rules: impossible dates, big amounts and repeat requests go to a person
// first; then the product type's window; then fault vs change-of-mind limits.
// Every outcome carries the rule that produced it.
const cfg = $('config').first().json;
const { requests } = $('Collect the requests').first().json;
const now = Date.now();
const history = $input.all().map(i => i.json).filter(h => h.email);
const out = [];
for (const r of requests) {
  const p = cfg.policy[r.type];
  const days = Math.floor((now - new Date(r.purchased).getTime()) / 864e5);
  const prior = history.find(h => String(h.email).toLowerCase() === r.email && h.order !== r.order && (now - new Date(h.submitted_at).getTime()) / 864e5 <= cfg.repeat_days);
  const fault = cfg.fault_reasons.includes(r.reason);
  let outcome, rule;
  if (!p) { outcome = 'review'; rule = 'unknown product type ' + r.type; }
  else if (isNaN(days) || days < 0) { outcome = 'review'; rule = 'purchase date is missing or in the future'; }
  else if (r.amount > cfg.review_always_over) { outcome = 'review'; rule = 'amount over ' + cfg.review_always_over; }
  else if (prior) { outcome = 'review'; rule = 'repeat request (order ' + prior.order + ' within ' + cfg.repeat_days + ' days)'; }
  else if (days > p.window_days) {
    if (fault && days <= p.window_days * 2) { outcome = 'review'; rule = 'fault reported ' + days + ' days after purchase, past the ' + p.window_days + ' day window'; }
    else { outcome = 'decline'; rule = 'it is ' + days + ' days since purchase and the ' + r.type.toLowerCase() + ' return window is ' + p.window_days + ' days'; }
  }
  else if (fault) {
    if (r.amount <= p.approve_max) { outcome = 'approve'; rule = 'fault inside ' + p.window_days + ' days, up to ' + p.approve_max; }
    else { outcome = 'review'; rule = 'fault claim above the ' + p.approve_max + ' auto-approve limit for ' + r.type; }
  }
  else if (p.change_mind_days === 0) { outcome = 'decline'; rule = r.type.toLowerCase() + ' products are not refundable for a change of mind'; }
  else if (days > p.change_mind_days) { outcome = 'decline'; rule = 'change-of-mind refunds close ' + p.change_mind_days + ' days after purchase'; }
  else if (r.amount <= p.change_mind_max) { outcome = 'approve'; rule = 'change of mind inside ' + p.change_mind_days + ' days, up to ' + p.change_mind_max; }
  else { outcome = 'review'; rule = 'change-of-mind amount above ' + p.change_mind_max; }
  out.push({ json: { ...r, days_since_purchase: days, outcome, rule } });
}
return out;`),
    code('Write each reply', `
// One reply per request, worded for its outcome. Declines quote the rule.
const cfg = $('config').first().json;
const money = n => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
const subjects = { approve: 'Refund approved for order {order}', review: 'We are looking at your refund request for order {order}', decline: 'About your refund request for order {order}' };
return $input.all().map(({ json: r }) => {
  const fill = s => s.replace('{order}', r.order).replace('{amount}', money(r.amount)).replace('{why}', r.rule);
  return { json: { ...r, subject: fill(subjects[r.outcome]), body: ['Hi,', '', fill(cfg.replies[r.outcome]), '', cfg.shop_name].join('\\n'),
    send_to: cfg.mode === 'test' ? cfg.test_email : r.email } };
});`),
    ifTrue('Sending switched on?', cfg('sends_enabled')),
    stop('STOP: preview - nothing sent'),
    gmail.send('Email the customer', { to: '$json.send_to', subject: "($('config').first().json.mode === 'test' ? '[TEST ' + $json.outcome + ' to ' + $json.email + '] ' : '') + $json.subject", message: '$json.body' }),
    ifWhen('Log this request?', [[cfg('live'), 'true'], [cfg('log_enabled'), 'true']]),
    stop('STOP: test send or no sheet - not logged'),
    code('Shape the log row', `
// One row per request: what was asked, what the policy decided, and why.
return $('Write each reply').all().map(({ json: r }) => ({ json: { submitted_at: r.submitted_at, order: r.order, email: r.email, product_type: r.type,
  amount: r.amount, reason: r.reason, days_since_purchase: r.days_since_purchase, outcome: r.outcome, rule: r.rule, details: r.details, status: r.outcome === 'review' ? 'open' : 'closed' } }));`),
    sheets.append('Log the request', cfg('log_sheet_id'), 'Refund requests'),
  ],
  edges: [
    ['Run manually', 'config'], ['Refund request form', 'config'],
    ['config', 'Read the form submission'],
    ['Read the form submission', 'Form submitted?'],
    ['Form submitted?', 0, 'Combine request sources'], ['Form submitted?', 1, 'Load sample requests'],
    ['Load sample requests', 0, 'Combine request sources', 1],
    ['Combine request sources', 'Collect the requests'],
    ['Collect the requests', 'Log sheet set?'],
    ['Log sheet set?', 0, 'Read past requests'], ['Log sheet set?', 1, 'Load sample past requests'],
    ['Read past requests', 'Combine request history'], ['Load sample past requests', 0, 'Combine request history', 1],
    ['Combine request history', 'Apply the refund policy'],
    ['Apply the refund policy', 'Write each reply'],
    ['Write each reply', 'Sending switched on?'],
    ['Sending switched on?', 0, 'Email the customer'], ['Sending switched on?', 1, 'STOP: preview - nothing sent'],
    ['Email the customer', 'Log this request?'],
    ['Log this request?', 0, 'Shape the log row'], ['Log this request?', 1, 'STOP: test send or no sheet - not logged'],
    ['Shape the log row', 'Log the request'],
  ],
  groups: [
    { title: 'Start and settings', why: 'The form is the front door; the manual trigger replays sample requests. The whole refund policy, including reply wording, lives in `config`, so a policy change never touches the logic.', nodes: ['Run manually', 'Refund request form', 'config'] },
    { title: 'Read the request', why: 'Form answers are keyed by their labels, so `Read the form submission` renames them once. `Collect the requests` gathers them into one item so the log is read a single time.', nodes: ['Read the form submission', 'Form submitted?', 'Load sample requests', 'Combine request sources', 'Collect the requests'] },
    { title: 'Check history and policy', why: 'Past requests are read before deciding, because a repeat requester is the case a rule table gets wrong most often. Escalation rules run before approval rules, so a large or repeat claim can never be auto-approved.', nodes: ['Log sheet set?', 'Read past requests', 'Load sample past requests', 'Combine request history', 'Apply the refund policy'] },
    { title: 'Reply and log', why: 'Nothing is emailed while `TEST_RUN` is true and `TEST_EMAIL` is blank. The log is written only on a live run with a sheet set, so test requests never count as a customer\'s earlier request.', nodes: ['Write each reply', 'Sending switched on?', 'STOP: preview - nothing sent', 'Email the customer', 'Log this request?', 'STOP: test send or no sheet - not logged', 'Shape the log row', 'Log the request'] },
  ],
  scenarios: [
    {
      name: 'shipped config (preview)', start: 'Run manually',
      expect: { reached: ['Load sample requests', 'Load sample past requests', 'STOP: preview - nothing sent'], outward: 'none' },
      check: out => {
        const f: string[] = [];
        const rows = out['Apply the refund policy'];
        const o = (id: string) => rows.find((r: any) => r.order === id);
        const want: Record<string, string> = { R1: 'approve', R2: 'decline', R3: 'decline', R4: 'approve', R5: 'review', R6: 'review', R7: 'review' };
        for (const [id, w] of Object.entries(want)) if (o(id)?.outcome !== w) f.push(`${id} should be ${w}, got ${o(id)?.outcome} (${o(id)?.rule})`);
        if (!o('R6')?.rule.startsWith('repeat request')) f.push('R6 should be reviewed as a repeat request');
        if (!o('R3')?.rule.includes('not refundable for a change of mind')) f.push('R3 decline should quote the digital rule');
        if (!out['Write each reply'].find((r: any) => r.order === 'R2')?.body.includes('change-of-mind refunds close 14 days after purchase')) f.push('R2 decline email should quote the change-of-mind window');
        return f;
      },
    },
    {
      name: 'live form submission', start: 'Refund request form',
      input: [{ 'Order number': '#5120', Email: 'Rosa@Harrowgate.example', 'Purchase date': new Date(Date.now() - 4 * 864e5).toISOString().slice(0, 10),
        'Product type': 'Physical', 'Amount paid': 64, Reason: 'Not as described', Details: 'Size label says M, fits like XS.', submittedAt: new Date().toISOString(), formMode: 'production' }],
      overrides: { TEST_RUN: false, LOG_SHEET_ID: '1RefundLog' },
      mocks: {
        'Read past requests': [{ row_number: 2, order: '4000', email: 'someone@else.example', outcome: 'approve', submitted_at: new Date(Date.now() - 10 * 864e5).toISOString() }],
        'Email the customer': (items: any[]) => items.map(() => ({ id: 'msg_1' })),
        'Log the request': (items: any[]) => items,
      },
      expect: { reached: ['Email the customer', 'Log the request'], notReached: ['Load sample requests', 'Load sample past requests'], outward: 'some' },
      check: out => {
        const f: string[] = [];
        const r = out['Write each reply'][0];
        if (r?.outcome !== 'approve' || r.send_to !== 'rosa@harrowgate.example' || r.order !== '5120') f.push(`expected an approval to rosa for order 5120, got ${JSON.stringify([r?.outcome, r?.send_to, r?.order])}`);
        if (out['Log the request'][0]?.status !== 'closed') f.push('approved request should be logged as closed');
        return f;
      },
    },
  ],
});
