import { defineSpec } from '../_kit/spec';
import { trigger, code, ifTrue, ifWhen, switchOn, merge, stop, sheets, gmail, respond } from '../_kit/n';

const cfg = (k: string) => `$('config').first().json.${k}`;

// Weekday-aligned dates for scenarios: the Monday at least `weeks` weeks ahead.
const monday = (weeks: number, plus = 0) => {
  const d = new Date(); d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + 7 * weeks + ((8 - d.getUTCDay()) % 7 || 7) + plus);
  return d.toISOString().slice(0, 10);
};

export default defineSpec({
  slug: 'time-off-request-approval',
  title: 'Route time-off requests from a form to managers with approve and decline links',
  summary: 'Checks each time-off request against the employee\'s remaining allowance, blackout periods and teammates already off, emails the manager one-click approve and decline links, and records the decision in Google Sheets when a link is clicked.',
  category: 'HR and people',
  description: {
    who: 'Teams of 10 to 150 people who approve leave over chat and track it in a spreadsheet. Managers get the facts with each request and decide with one click, and the sheet stays the record.',
    how: [
      'An employee submits the n8n form with type and dates. Working days are counted without weekends or `PUBLIC_HOLIDAYS`.',
      'It reads the Employees and Requests tabs (or sample data), works out the allowance left this year, checks `BLACKOUT_PERIODS` and lists teammates already off on those days.',
      'Impossible requests (unknown email, dates in the past, over allowance) are refused by email with the reason. The rest are saved as pending and the manager gets approve and decline links.',
      'A click hits the second trigger, `Manager decision link`. The token and status are checked, the row is updated and the employee is told the outcome.',
    ],
    setup: [
      'Run it once as imported. It checks a sample request and stops at `STOP: preview - nothing stored or sent`.',
      'Create a sheet with an Employees tab (email, name, team, manager_email, allowance_days) and a Requests tab (id, email, name, team, type, first_day, last_day, days, status, token, created_at, decided_at), connect Google Sheets and set `LEAVE_SHEET_ID`.',
      'Activate the workflow and copy the production URL of `Manager decision link` into `DECISION_URL`.',
      'Put your address in `TEST_EMAIL` to receive every email yourself, then set `TEST_RUN = false`.',
    ],
    requirements: ['A Google Sheet for staff and requests', 'A Gmail account', 'An n8n instance reachable from your managers\' browsers'],
    customize: [
      '`MAX_TEAM_OFF` sets how many people from one team may be off on the same day before the manager is warned.',
      '`COUNTED_TYPES` lists leave types that use allowance; `REFUSE_OVER_ALLOWANCE` decides whether going over is refused or only flagged.',
      '`BLACKOUT_PERIODS` takes dates or yearly `MM-DD` ranges.',
    ],
  },
  config: {
    intro: ['LEAVE_SHEET_ID blank -> SAMPLE staff and requests; nothing can be stored, so nothing is emailed.', 'Two entry points: the request form and the decision link. ENTRY below says which one started the run.'],
    consts: [
      { name: 'LEAVE_SHEET_ID', value: '', note: 'Google Sheets id holding the Employees and Requests tabs; blank uses sample data' },
      { name: 'DECISION_URL', value: 'https://your-n8n.example/webhook/time-off-decision', note: 'production URL of the Manager decision link trigger' },
      { name: 'COUNTED_TYPES', value: ['Vacation', 'Personal'], note: 'leave types that use the yearly allowance' },
      { name: 'REFUSE_OVER_ALLOWANCE', value: true, note: 'true refuses a request that would go below zero; false only warns the manager' },
      { name: 'MAX_TEAM_OFF', value: 2, note: 'warn the manager when this many teammates are already off on an overlapping day' },
      { name: 'BLACKOUT_PERIODS', value: [{ from: '12-15', to: '12-31', reason: 'year-end close' }], note: "periods managers should think twice about: 'YYYY-MM-DD' or yearly 'MM-DD'" },
      { name: 'PUBLIC_HOLIDAYS', value: ['2026-12-25', '2026-12-28', '2027-01-01'], note: 'dates that do not count as working days' },
      { name: 'COMPANY_NAME', value: 'Northwind', note: 'used in email sign-offs' },
    ],
    flags: { sheets_enabled: "LEAVE_SHEET_ID.trim() !== ''", entry: 'ENTRY' },
    safety: 'test_run',
    extra: `// Which trigger started this run: the decision webhook carries a query, the form carries formMode.
const TRIGGER_ITEM = $input.first() ? $input.first().json : {};
const ENTRY = TRIGGER_ITEM.query !== undefined ? 'decision' : (TRIGGER_ITEM.formMode || TRIGGER_ITEM.submittedAt ? 'form' : 'manual');`,
  },
  nodes: [
    trigger.manual(),
    trigger.form('Time-off request form', 'Request time off', 'Your manager gets an email with your request and decides with one click.', [
      { label: 'Work email', type: 'email', required: true },
      { label: 'Type', type: 'dropdown', options: ['Vacation', 'Personal', 'Sick', 'Unpaid'], required: true },
      { label: 'First day', type: 'date', required: true },
      { label: 'Last day', type: 'date', required: true },
      { label: 'Note for your manager', type: 'textarea' },
    ]),
    trigger.webhook('Manager decision link', 'time-off-decision', { method: 'GET', respond: 'node' }),
    switchOn('Which entry point?', '$json.entry', ['form', 'decision', 'manual']),
    stop('STOP: unknown entry'),
    code('Read the form answers', `
// Form labels -> the request shape the checker reads.
const f = $('Time-off request form').first().json;
return [{ json: { entry: 'request', request: {
  email: String(f['Work email'] || '').trim().toLowerCase(), type: f['Type'] || 'Vacation',
  first_day: String(f['First day'] || '').slice(0, 10), last_day: String(f['Last day'] || '').slice(0, 10),
  note: f['Note for your manager'] || '', submitted_at: f.submittedAt || new Date().toISOString(),
} } }];`),
    code('Read the decision link', `
// GET ?id=&decision=&token= from the email link. Nothing is trusted until it matches the stored row.
const q = $('Manager decision link').first().json.query || {};
return [{ json: { entry: 'decision', decision: {
  id: String(q.id || ''), decision: String(q.decision || '').toLowerCase(), token: String(q.token || ''),
} } }];`),
    code('Load sample request', `
// Manual run: a Mon-Fri vacation three weeks out from someone on the Platform team.
const d = new Date(); d.setUTCHours(0, 0, 0, 0);
d.setUTCDate(d.getUTCDate() + 21 + ((8 - d.getUTCDay()) % 7 || 7));
const day = n => new Date(d.getTime() + n * 864e5).toISOString().slice(0, 10);
return [{ json: { entry: 'request', request: {
  email: 'dana.kowalski@northwind.example', type: 'Vacation', first_day: day(0), last_day: day(4),
  note: 'Family trip, booked last month.', submitted_at: new Date().toISOString(),
} } }];`),
    merge('Combine entry', 3),
    ifTrue('Leave sheet blank?', '!' + cfg('sheets_enabled')),
    sheets.read('Read Employees tab', cfg('leave_sheet_id'), 'Employees'),
    code('Collect employees', `
// Many rows -> one item, so the Requests read below runs once, not once per employee.
const employees = $input.all().map(i => i.json).filter(r => r.email).map(r => ({
  email: String(r.email).trim().toLowerCase(), name: r.name || r.email, team: r.team || '',
  manager_email: String(r.manager_email || '').trim(), allowance_days: Number(r.allowance_days || 0),
}));
return [{ json: { employees } }];`),
    sheets.read('Read Requests tab', cfg('leave_sheet_id'), 'Requests'),
    code('Collect team data', `
// Requests rows joined with the employees read before them.
const requests = $input.all().map(i => i.json).filter(r => r.id).map(r => ({
  id: String(r.id), email: String(r.email || '').toLowerCase(), name: r.name || '', team: r.team || '', type: r.type || '',
  first_day: String(r.first_day || '').slice(0, 10), last_day: String(r.last_day || '').slice(0, 10),
  days: Number(r.days || 0), status: String(r.status || '').toLowerCase(), token: String(r.token || ''), row_number: r.row_number,
}));
return [{ json: { employees: $('Collect employees').first().json.employees, requests } }];`),
    code('Load sample team data', `
// Used until LEAVE_SHEET_ID is set. Dana's teammates are already off in the same week.
const d = new Date(); d.setUTCHours(0, 0, 0, 0);
d.setUTCDate(d.getUTCDate() + 21 + ((8 - d.getUTCDay()) % 7 || 7));
const day = n => new Date(d.getTime() + n * 864e5).toISOString().slice(0, 10);
const year = new Date().getUTCFullYear() + '-';
return [{ json: {
  employees: [
    { email: 'dana.kowalski@northwind.example', name: 'Dana Kowalski', team: 'Platform', manager_email: 'lee.manager@northwind.example', allowance_days: 25 },
    { email: 'raj.patel@northwind.example', name: 'Raj Patel', team: 'Platform', manager_email: 'lee.manager@northwind.example', allowance_days: 25 },
    { email: 'mia.chen@northwind.example', name: 'Mia Chen', team: 'Platform', manager_email: 'lee.manager@northwind.example', allowance_days: 25 },
    { email: 'sol.ortiz@northwind.example', name: 'Sol Ortiz', team: 'Sales', manager_email: 'ana.manager@northwind.example', allowance_days: 20 },
  ],
  requests: [
    { id: 'TO-A1', email: 'dana.kowalski@northwind.example', name: 'Dana Kowalski', team: 'Platform', type: 'Vacation', first_day: year + '02-09', last_day: year + '02-13', days: 5, status: 'approved', token: 'used' },
    { id: 'TO-A2', email: 'dana.kowalski@northwind.example', name: 'Dana Kowalski', team: 'Platform', type: 'Vacation', first_day: year + '06-01', last_day: year + '06-10', days: 8, status: 'approved', token: 'used' },
    { id: 'TO-A3', email: 'raj.patel@northwind.example', name: 'Raj Patel', team: 'Platform', type: 'Vacation', first_day: day(2), last_day: day(3), days: 2, status: 'approved', token: 'used' },
    { id: 'TO-A4', email: 'mia.chen@northwind.example', name: 'Mia Chen', team: 'Platform', type: 'Personal', first_day: day(4), last_day: day(4), days: 1, status: 'pending', token: 'tok_sample_mia' },
    { id: 'TO-A5', email: 'sol.ortiz@northwind.example', name: 'Sol Ortiz', team: 'Sales', type: 'Vacation', first_day: day(0), last_day: day(4), days: 5, status: 'pending', token: 'tok_sample_sol' },
  ],
} }];`),
    merge('Combine team data'),
    code('Decide the outcome', `
// One place decides every outcome for both entry points.
//   request  -> refuse with a reason, or save as pending and ask the manager
//   decision -> check the token and status, then approve or decline the stored row
const cfg = $('config').first().json;
const entry = $('Combine entry').first().json;
const { employees, requests } = $input.first().json;
const today = new Date().toISOString().slice(0, 10);
const year = today.slice(0, 4);
const send = to => cfg.mode === 'test' ? cfg.test_email : to;
const ymd = s => new Date(s + 'T00:00:00Z');
const workdays = (a, b) => {
  let n = 0;
  for (let t = ymd(a).getTime(); t <= ymd(b).getTime(); t += 864e5) {
    const d = new Date(t), iso = d.toISOString().slice(0, 10);
    if (d.getUTCDay() % 6 !== 0 && !cfg.public_holidays.includes(iso)) n++;
  }
  return n;
};
const overlaps = (a1, a2, b1, b2) => a1 <= b2 && b1 <= a2;
const inBlackout = (first, last) => cfg.blackout_periods.filter(p => {
  if (p.from.length === 5) {
    for (let t = ymd(first).getTime(); t <= ymd(last).getTime(); t += 864e5) {
      const md = new Date(t).toISOString().slice(5, 10);
      if (md >= p.from && md <= p.to) return true;
    }
    return false;
  }
  return overlaps(first, last, p.from, p.to);
});

if (entry.entry === 'decision') {
  const q = entry.decision;
  const row = requests.find(r => r.id === q.id);
  const bad = !row ? 'This request was not found.' :
    !q.token || q.token !== row.token ? 'This link is not valid.' :
    row.status !== 'pending' ? 'This request was already ' + row.status + '.' :
    !['approve', 'decline'].includes(q.decision) ? 'Unknown decision.' : '';
  if (bad) return [{ json: { entry: 'decision', action: 'bad_link', reply: bad, id: q.id } }];
  const status = q.decision === 'approve' ? 'approved' : 'declined';
  return [{ json: { entry: 'decision', action: 'apply_decision', id: row.id,
    reply: 'Done: ' + row.name + ' ' + row.first_day + ' to ' + row.last_day + ' is ' + status + '. ' + row.name + ' has been emailed.',
    sheet_row: { id: row.id, status, decided_at: new Date().toISOString() },
    email: { to: send(row.email), original_to: row.email, subject: 'Your time off ' + row.first_day + ' to ' + row.last_day + ' was ' + status,
      body: 'Hi ' + row.name.split(' ')[0] + ',\\n\\nYour ' + row.type.toLowerCase() + ' request for ' + row.first_day + ' to ' + row.last_day + ' (' + row.days + ' working days) was ' + status + ' by your manager.\\n\\n' + cfg.company_name + ' People team' } } }];
}

const r = entry.request;
const emp = employees.find(e => e.email === r.email);
const days = r.first_day && r.last_day ? workdays(r.first_day, r.last_day) : 0;
const counted = cfg.counted_types.includes(r.type);
const used = emp ? requests.filter(x => x.email === emp.email && cfg.counted_types.includes(x.type) && x.first_day.startsWith(year))
  .reduce((m, x) => (x.status === 'approved' ? { ...m, approved: m.approved + x.days } : x.status === 'pending' ? { ...m, pending: m.pending + x.days } : m), { approved: 0, pending: 0 }) : { approved: 0, pending: 0 };
const left = emp ? emp.allowance_days - used.approved - used.pending : 0;
const after = counted ? left - days : left;
const refuse =
  !emp ? 'We could not find ' + r.email + ' on the staff list.' :
  !r.first_day || !r.last_day || r.last_day < r.first_day ? 'The last day is before the first day.' :
  r.first_day < today ? 'The first day is in the past.' :
  days === 0 ? 'Those dates contain no working days.' :
  counted && after < 0 && cfg.refuse_over_allowance ? 'This needs ' + days + ' days and you have ' + left + ' left this year (pending requests included).' : '';
if (refuse) {
  return [{ json: { entry: 'request', action: 'tell_employee', reason: refuse, reply: '',
    email: { to: send(r.email), original_to: r.email, subject: 'Your time-off request could not be sent to your manager',
      body: 'Hi,\\n\\nYour request for ' + r.first_day + ' to ' + r.last_day + ' was not sent on: ' + refuse + '\\n\\nFix the dates and submit the form again.\\n\\n' + cfg.company_name + ' People team' } } }];
}
const away = requests.filter(x => x.team === emp.team && x.email !== emp.email && ['approved', 'pending'].includes(x.status)
  && overlaps(r.first_day, r.last_day, x.first_day, x.last_day)).map(x => x.name + ' (' + x.status + ', ' + x.first_day + ' to ' + x.last_day + ')');
const blackouts = inBlackout(r.first_day, r.last_day).map(p => p.reason);
const warnings = [
  ...(away.length >= cfg.max_team_off ? [away.length + ' of ' + emp.team + ' already off on these days'] : []),
  ...blackouts.map(b => 'falls in a blackout period: ' + b),
  ...(counted && after < 0 ? ['goes ' + Math.abs(after) + ' days over allowance'] : []),
];
const rnd = n => { const a = new Uint8Array(n); (globalThis.crypto || { getRandomValues: x => x.map(() => Math.floor(Math.random() * 256)) }).getRandomValues(a); return Array.from(a, b => (b % 36).toString(36)).join(''); };
const id = 'TO-' + Date.now().toString(36).toUpperCase();
const token = rnd(24);
const link = d => cfg.decision_url + '?id=' + encodeURIComponent(id) + '&decision=' + d + '&token=' + token;
const body = [
  'Hi,', '', emp.name + ' asks for ' + r.type.toLowerCase() + ' from ' + r.first_day + ' to ' + r.last_day + ' (' + days + ' working days).',
  r.note ? 'Note: ' + r.note : '', '',
  counted ? 'Allowance: ' + left + ' days left this year, ' + after + ' after this request.' : r.type + ' leave does not use allowance.',
  away.length ? 'Also off in ' + emp.team + ': ' + away.join('; ') : 'Nobody else in ' + emp.team + ' is off on these days.',
  warnings.length ? 'Check before approving: ' + warnings.join('; ') + '.' : '', '',
  'Approve: ' + link('approve'), 'Decline: ' + link('decline'), '',
  'Each link works once.',
].filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\\n');
return [{ json: { entry: 'request', action: 'ask_manager', id, reply: '', days, allowance_left: left, allowance_after: after, away, warnings,
  sheet_row: { id, email: emp.email, name: emp.name, team: emp.team, type: r.type, first_day: r.first_day, last_day: r.last_day,
    days, status: 'pending', token, created_at: new Date().toISOString(), decided_at: '' },
  email: { to: send(emp.manager_email), original_to: emp.manager_email,
    subject: (warnings.length ? '[Check] ' : '') + 'Time off: ' + emp.name + ', ' + r.first_day + ' to ' + r.last_day, body } } }];`),
    ifTrue('Reply on a decision link?', "$json.entry === 'decision'"),
    stop('STOP: no browser to reply to'),
    respond('Reply to the manager', 'JSON.stringify({ message: $json.reply })'),
    ifWhen('Store and send?', [[cfg('sends_enabled'), 'true'], [cfg('sheets_enabled'), 'true']]),
    stop('STOP: preview - nothing stored or sent'),
    switchOn('What to do?', '$json.action', ['ask_manager', 'apply_decision', 'tell_employee']),
    stop('STOP: bad link - nothing to change'),
    code('Pick new row columns', `
// Only the Requests tab columns go to Sheets.
return [{ json: $input.first().json.sheet_row }];`),
    sheets.append('Save the pending request', cfg('leave_sheet_id'), 'Requests'),
    gmail.send('Email the manager approve and decline links', { to: "$('Decide the outcome').first().json.email.to", subject: "($('config').first().json.mode === 'test' ? '[TEST to ' + $('Decide the outcome').first().json.email.original_to + '] ' : '') + $('Decide the outcome').first().json.email.subject", message: "$('Decide the outcome').first().json.email.body" }),
    code('Pick status columns', `
// id is the match column; only status and decided_at change.
return [{ json: $input.first().json.sheet_row }];`),
    sheets.update('Update the request status', cfg('leave_sheet_id'), 'Requests', 'id'),
    gmail.send('Email the employee the decision', { to: "$('Decide the outcome').first().json.email.to", subject: "($('config').first().json.mode === 'test' ? '[TEST to ' + $('Decide the outcome').first().json.email.original_to + '] ' : '') + $('Decide the outcome').first().json.email.subject", message: "$('Decide the outcome').first().json.email.body" }),
    gmail.send('Email the employee why it was refused', { to: '$json.email.to', subject: "($('config').first().json.mode === 'test' ? '[TEST to ' + $json.email.original_to + '] ' : '') + $json.email.subject", message: '$json.email.body' }),
  ],
  edges: [
    ['Run manually', 'config'], ['Time-off request form', 'config'], ['Manager decision link', 'config'],
    ['config', 'Which entry point?'],
    ['Which entry point?', 0, 'Read the form answers'], ['Which entry point?', 1, 'Read the decision link'],
    ['Which entry point?', 2, 'Load sample request'], ['Which entry point?', 3, 'STOP: unknown entry'],
    ['Read the form answers', 'Combine entry'], ['Read the decision link', 0, 'Combine entry', 1], ['Load sample request', 0, 'Combine entry', 2],
    ['Combine entry', 'Leave sheet blank?'],
    ['Leave sheet blank?', 0, 'Load sample team data'], ['Leave sheet blank?', 1, 'Read Employees tab'],
    ['Read Employees tab', 'Collect employees'], ['Collect employees', 'Read Requests tab'], ['Read Requests tab', 'Collect team data'],
    ['Load sample team data', 'Combine team data'], ['Collect team data', 0, 'Combine team data', 1],
    ['Combine team data', 'Decide the outcome'],
    ['Decide the outcome', 'Store and send?'],
    ['Decide the outcome', 'Reply on a decision link?'],
    ['Reply on a decision link?', 0, 'Reply to the manager'], ['Reply on a decision link?', 1, 'STOP: no browser to reply to'],
    ['Store and send?', 0, 'What to do?'], ['Store and send?', 1, 'STOP: preview - nothing stored or sent'],
    ['What to do?', 0, 'Pick new row columns'], ['What to do?', 1, 'Pick status columns'],
    ['What to do?', 2, 'Email the employee why it was refused'], ['What to do?', 3, 'STOP: bad link - nothing to change'],
    ['Pick new row columns', 'Save the pending request'], ['Save the pending request', 'Email the manager approve and decline links'],
    ['Pick status columns', 'Update the request status'], ['Update the request status', 'Email the employee the decision'],
  ],
  groups: [
    { title: 'Two entry points and settings', why: 'The form and the decision link share one `config`, which records which trigger fired. `Which entry point?` sends each to its reader; a manual run takes the sample request so the checks can be watched.', nodes: ['Run manually', 'Time-off request form', 'Manager decision link', 'config', 'Which entry point?', 'STOP: unknown entry'] },
    { title: 'Read the request or the click', why: 'Both readers emit one item with an `entry` field, so everything after `Combine entry` handles requests and decisions with the same team data.', nodes: ['Read the form answers', 'Read the decision link', 'Load sample request', 'Combine entry'] },
    { title: 'Read staff and leave', why: '`Collect employees` folds the Employees rows into one item before `Read Requests tab`, so the second read runs once. Without a sheet, `Load sample team data` has two Platform teammates off in the requested week.', nodes: ['Leave sheet blank?', 'Load sample team data', 'Read Employees tab', 'Collect employees', 'Read Requests tab', 'Collect team data', 'Combine team data'] },
    { title: 'Decide and answer the click', why: '`Decide the outcome` refuses only what a manager could never approve and turns the rest into warnings. A decision link must match the stored token and still be pending, so a forwarded or reused link changes nothing.', nodes: ['Decide the outcome', 'Store and send?', 'Reply on a decision link?', 'STOP: preview - nothing stored or sent', 'Reply to the manager', 'STOP: no browser to reply to'] },
    { title: 'Write the sheet and email', why: 'The pending row is saved before the manager email goes out, so a link can never point at a missing request. In test mode every email goes to `TEST_EMAIL` with the real recipient in the subject.', nodes: ['What to do?', 'Pick new row columns', 'Pick status columns', 'Email the employee why it was refused', 'STOP: bad link - nothing to change', 'Save the pending request', 'Update the request status', 'Email the manager approve and decline links', 'Email the employee the decision'] },
  ],
  scenarios: [
    {
      name: 'shipped config (sample request, preview)', start: 'Run manually',
      expect: { reached: ['Load sample request', 'Load sample team data', 'STOP: preview - nothing stored or sent', 'STOP: no browser to reply to'], outward: 'none' },
      check: out => {
        const d = out['Decide the outcome'][0];
        const f: string[] = [];
        if (d.action !== 'ask_manager') f.push(`expected ask_manager, got ${d.action} (${d.reason})`);
        if (d.days !== 5) f.push(`Mon-Fri should be 5 working days, got ${d.days}`);
        if (d.allowance_left !== 12) f.push(`25 allowance - 13 approved = 12 left, got ${d.allowance_left}`);
        if (d.allowance_after !== 7) f.push(`expected 7 days after the request, got ${d.allowance_after}`);
        if (d.away?.length !== 2) f.push(`Raj and Mia overlap; got ${d.away?.length}`);
        if (!d.warnings?.some((w: string) => w.includes('2 of Platform'))) f.push('team cover warning missing');
        if (!d.email?.body.includes('decision=approve&token=')) f.push('approve link missing');
        return f;
      },
    },
    {
      name: 'form request in test mode, blackout and over allowance', start: 'Time-off request form',
      input: [{ 'Work email': 'Sol.Ortiz@northwind.example', Type: 'Vacation', 'First day': monday(4), 'Last day': monday(5, 4), 'Note for your manager': '', submittedAt: new Date().toISOString(), formMode: 'production' }],
      overrides: { LEAVE_SHEET_ID: '1SheetIdExample', TEST_EMAIL: 'you@example.com', REFUSE_OVER_ALLOWANCE: false, BLACKOUT_PERIODS: [{ from: monday(5), to: monday(5, 6), reason: 'product launch' }] },
      mocks: {
        'Read Employees tab': [{ row_number: 2, email: 'sol.ortiz@northwind.example', name: 'Sol Ortiz', team: 'Sales', manager_email: 'ana.manager@northwind.example', allowance_days: 12 }],
        'Read Requests tab': [{ row_number: 2, id: 'TO-B1', email: 'sol.ortiz@northwind.example', name: 'Sol Ortiz', team: 'Sales', type: 'Vacation', first_day: new Date().getUTCFullYear() + '-03-02', last_day: new Date().getUTCFullYear() + '-03-06', days: 5, status: 'approved', token: 'used' }],
        'Save the pending request': (items: any[]) => items,
        'Email the manager approve and decline links': [{ id: 'msg_1', labelIds: ['SENT'] }],
      },
      expect: { reached: ['Read the form answers', 'Save the pending request', 'Email the manager approve and decline links'], notReached: ['Load sample team data', 'Reply to the manager'], outward: 'some' },
      check: out => {
        const d = out['Decide the outcome'][0];
        const f: string[] = [];
        if (d.days !== 10) f.push(`two Mon-Fri weeks should be 10 days, got ${d.days}`);
        if (!d.warnings.some((w: string) => w.includes('product launch'))) f.push('blackout warning missing');
        if (!d.warnings.some((w: string) => w.includes('3 days over'))) f.push('7 left - 10 = 3 over allowance warning missing');
        if (d.email.to !== 'you@example.com') f.push('test send not redirected');
        if (out['Save the pending request'][0].status !== 'pending') f.push('row should be saved as pending');
        return f;
      },
    },
    {
      name: 'manager clicks approve (live)', start: 'Manager decision link',
      input: [{ headers: { host: 'your-n8n.example' }, params: {}, query: { id: 'TO-A4', decision: 'approve', token: 'tok_sample_mia' }, body: {} }],
      overrides: { LEAVE_SHEET_ID: '1SheetIdExample', TEST_RUN: false },
      mocks: {
        'Read Employees tab': [{ email: 'mia.chen@northwind.example', name: 'Mia Chen', team: 'Platform', manager_email: 'lee.manager@northwind.example', allowance_days: 25 }],
        'Read Requests tab': [{ row_number: 5, id: 'TO-A4', email: 'mia.chen@northwind.example', name: 'Mia Chen', team: 'Platform', type: 'Personal', first_day: '2026-11-20', last_day: '2026-11-20', days: 1, status: 'pending', token: 'tok_sample_mia' }],
        'Update the request status': (items: any[]) => items,
        'Email the employee the decision': [{ id: 'msg_2', labelIds: ['SENT'] }],
      },
      expect: { reached: ['Read the decision link', 'Reply to the manager', 'Update the request status', 'Email the employee the decision'], notReached: ['Save the pending request'], outward: 'some' },
      check: out => {
        const f: string[] = [];
        if (out['Update the request status'][0]?.status !== 'approved') f.push('row should be set to approved');
        if (out['Decide the outcome'][0].email.to !== 'mia.chen@northwind.example') f.push('live email should go to Mia');
        return f;
      },
    },
    {
      name: 'reused link with a wrong token', start: 'Manager decision link',
      input: [{ headers: {}, params: {}, query: { id: 'TO-A4', decision: 'decline', token: 'guessed' }, body: {} }],
      expect: { reached: ['Reply to the manager', 'STOP: preview - nothing stored or sent'], notReached: ['Update the request status'], outward: 'none' },
      check: out => out['Decide the outcome'][0].reply === 'This link is not valid.' ? [] : ['wrong token should be refused'],
    },
  ],
});
