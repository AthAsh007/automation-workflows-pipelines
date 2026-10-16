import { defineSpec } from '../_kit/spec';
import { trigger, code, ifTrue, merge, stop, sheets, gmail } from '../_kit/n';

const cfg = (k: string) => `$('config').first().json.${k}`;

export default defineSpec({
  slug: 'contract-signature-chaser',
  title: 'Chase unsigned contracts listed in Google Sheets with reminder emails',
  summary: 'Each weekday, reads a Google Sheets list of contracts out for signature, sends the signer the next reminder on a 3, 7 and 12 day ladder, escalates to the account owner after the last one, stops on signed or declined, and writes the reminder count back to the sheet.',
  category: 'Productivity and operations',
  description: {
    who: 'Agencies, consultancies and small legal or sales teams that send contracts through any e-signature tool and track them in a Google Sheet. It does the polite chasing so the account owner only steps in when three reminders have not worked.',
    how: [
      'Every weekday at 10:00 it reads the Contracts tab, or sample contracts until a sheet is connected.',
      'Rows marked signed, declined or voided are skipped. For the rest, days since the contract was sent pick the next step: reminder 1 at 3 days, 2 at 7, 3 at 12.',
      'Three days after the third reminder the account owner gets one escalation email with the history. A contract is never chased twice within `MIN_GAP_DAYS`, even after a missed run.',
      'Emails go out through Gmail, then Reminders sent and Last reminder are written back to the row, keyed by Contract ID.',
    ],
    setup: [
      'Run it once as imported. It previews against sample contracts and stops at `STOP: preview - nothing sent`.',
      'Connect Google Sheets and put the spreadsheet id in `CONTRACTS_SHEET_ID`. The column names are listed in `COLUMNS`.',
      'Connect Gmail on `Email the reminder`.',
      'Put your address in `TEST_EMAIL` to receive every reminder yourself, then set `TEST_RUN = false` to email signers and update the sheet.',
    ],
    requirements: ['A Google Sheet listing contracts out for signature', 'A Gmail account'],
    customize: [
      '`LADDER` sets the day and wording of each reminder.',
      '`ESCALATE_AFTER_DAYS` sets the wait between the last reminder and the owner email.',
      '`DONE_STATUSES` lists the Status values that stop chasing.',
    ],
  },
  config: {
    intro: ['CONTRACTS_SHEET_ID blank -> SAMPLE contracts so the run works before any credential exists.', 'Reminder counts are written back only on a live run.'],
    consts: [
      { name: 'CONTRACTS_SHEET_ID', value: '', note: 'Google Sheets id with a Contracts tab; blank uses sample rows' },
      { name: 'COLUMNS', value: { id: 'Contract ID', company: 'Company', title: 'Contract', signer: 'Signer name', signer_email: 'Signer email', owner: 'Owner name', owner_email: 'Owner email',
        sent: 'Sent date', status: 'Status', count: 'Reminders sent', last: 'Last reminder', link: 'Signing link' }, note: 'column headers on the Contracts tab' },
      { name: 'LADDER', value: [
        { step: 1, days: 3, subject: 'Quick reminder: {title} is ready to sign', opening: 'Just a nudge in case this got buried: {title} is waiting for your signature.' },
        { step: 2, days: 7, subject: 'Following up on {title}', opening: 'Following up on {title}, which we sent a week ago. If anything in it needs changing, reply and we will sort it out.' },
        { step: 3, days: 12, subject: 'Last reminder: {title}', opening: 'This is our last automatic reminder about {title}. After this, {owner} will get in touch directly.' },
      ], note: 'days after sending that unlock each reminder' },
      { name: 'ESCALATE_AFTER_DAYS', value: 3, note: 'days after the last reminder before the owner is emailed' },
      { name: 'MIN_GAP_DAYS', value: 2, note: 'never two emails to one contract within this many days' },
      { name: 'DONE_STATUSES', value: ['signed', 'declined', 'voided', 'cancelled'], note: 'Status values that stop all chasing' },
      { name: 'DAILY_CAP', value: 30, note: 'hard ceiling on emails per run' },
      { name: 'SENDER_NAME', value: 'Contracts team', note: 'sign-off on reminders' },
    ],
    flags: { sheets_enabled: "CONTRACTS_SHEET_ID.trim() !== ''" },
    safety: 'test_run',
  },
  nodes: [
    trigger.manual(),
    trigger.schedule('Every weekday at 10:00', '0 10 * * 1-5'),
    ifTrue('Use sample contracts?', '!' + cfg('sheets_enabled')),
    code('Load sample contracts', `
// Used until CONTRACTS_SHEET_ID is set. Dates are relative to today so every rule fires.
const day = n => n === null ? '' : new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
const k = (id, company, title, signer, sentAgo, count, lastAgo, status = 'sent', extra = {}) => ({ id, company, title, signer, signer_email: signer.split(' ')[0].toLowerCase() + '@' + company.toLowerCase().replace(/[^a-z]/g, '') + '.example',
  owner: 'Maya Ortiz', owner_email: 'maya@yourcompany.example', sent: day(sentAgo), status, count, last: day(lastAgo), link: 'https://sign.example/c/' + id, ...extra });
return [
  k('C-101', 'Harbour Dental', 'Website services agreement', 'Priya Nair', 4, 0, null),
  k('C-102', 'Northfield Studio', 'Retainer renewal 2026', 'Lee Moran', 8, 1, 4),
  k('C-103', 'Lumen Physio', 'Data processing addendum', 'Sam Okoro', 13, 2, 1),
  k('C-104', 'Orchard Lane Cafe', 'Menu site build', 'Jo Banks', 16, 3, 4),
  k('C-105', 'Pine and Co', 'Logo licence', 'Ari Cole', 6, 1, 3, 'Signed'),
  k('C-106', 'Quarry Labs', 'Pilot agreement', 'Kim Ross', 9, 1, 2, 'declined'),
  k('C-107', 'Tallow Goods', 'Master services agreement', 'Dee Hart', 1, 0, null),
  k('C-108', 'Beacon Health', 'NDA', 'Tom Wynn', 30, 4, 12),
  k('C-109', 'Driftwood Inn', 'Booking engine setup', 'Lou Grey', 5, 0, null, 'sent', { signer_email: '' }),
].map(json => ({ json }));`),
    sheets.read('Read the Contracts tab', cfg('contracts_sheet_id'), 'Contracts'),
    code('Read contract rows', `
// Sheet rows -> the sample shape, through COLUMNS.
const col = $('config').first().json.columns;
const d = v => String(v || '').slice(0, 10);
return $input.all().map(({ json: r }) => ({ json: { id: String(r[col.id] || ''), company: r[col.company] || '', title: r[col.title] || 'the contract', signer: r[col.signer] || '',
  signer_email: String(r[col.signer_email] || '').trim(), owner: r[col.owner] || '', owner_email: String(r[col.owner_email] || '').trim(), sent: d(r[col.sent]),
  status: String(r[col.status] || 'sent'), count: Number(r[col.count] || 0), last: d(r[col.last]), link: r[col.link] || '' } })).filter(i => i.json.id);`),
    merge('Combine contract sources'),
    code('Pick the next step', `
// Steps 1..N go to the signer; step N+1 is the one escalation to the owner. The step
// count comes from the sheet, so a row edited by hand is respected.
const cfg = $('config').first().json;
const ladder = [...cfg.ladder].sort((a, b) => a.days - b.days);
const days = s => s ? Math.floor((Date.now() - new Date(s).getTime()) / 864e5) : null;
const due = [], held = [];
for (const { json: c } of $input.all()) {
  const status = c.status.trim().toLowerCase();
  const age = days(c.sent), gap = days(c.last);
  let reason = '', next = null;
  if (cfg.done_statuses.includes(status)) reason = status;
  else if (age === null) reason = 'no sent date';
  else if (c.count > ladder.length) reason = 'already escalated, chase by hand';
  else if (gap !== null && gap < cfg.min_gap_days) reason = 'last email ' + gap + ' day(s) ago';
  else if (c.count === ladder.length) {
    if (gap !== null && gap >= cfg.escalate_after_days) next = { step: ladder.length + 1, escalate: true };
    else reason = 'escalation due in ' + (cfg.escalate_after_days - (gap ?? 0)) + ' day(s)';
  } else {
    const s = ladder.find(x => x.step > c.count && age >= x.days);
    if (s) next = { step: s.step, escalate: false, subject: s.subject, opening: s.opening };
    else reason = 'next reminder not due yet';
  }
  if (!reason && !next.escalate && !c.signer_email) reason = 'no signer email';
  if (!reason && next.escalate && !c.owner_email) reason = 'no owner email for escalation';
  if (reason) held.push({ id: c.id, company: c.company, reason });
  else due.push({ ...c, ...next, age });
}
due.sort((a, b) => b.age - a.age);
for (const x of due.splice(cfg.daily_cap)) held.push({ id: x.id, company: x.company, reason: 'over DAILY_CAP, next run' });
return [{ json: { due, held } }];`),
    code('Write each email', `
// Signer reminders use the ladder wording; the escalation goes to the owner with the history.
const cfg = $('config').first().json;
return $input.first().json.due.map(c => {
  const fill = s => s.replace(/{title}/g, c.title).replace(/{owner}/g, c.owner || 'your contact');
  let to, subject, body;
  if (c.escalate) {
    to = c.owner_email;
    subject = 'Unsigned after ' + cfg.ladder.length + ' reminders: ' + c.title + ' (' + c.company + ')';
    body = ['Hi ' + (c.owner.split(' ')[0] || 'there') + ',', '', c.title + ' for ' + c.company + ' was sent ' + c.age + ' days ago to ' + c.signer + ' (' + c.signer_email + ').',
      cfg.ladder.length + ' reminders have gone out, the last on ' + c.last + ', with no signature.', '', 'Time for a personal call. Signing link: ' + c.link].join('\\n');
  } else {
    to = c.signer_email;
    subject = fill(c.subject);
    body = ['Hi ' + (c.signer.split(' ')[0] || 'there') + ',', '', fill(c.opening), '', 'Sign here: ' + c.link, '', 'Thank you,', cfg.sender_name].join('\\n');
  }
  return { json: { ...c, to, subject, body, send_to: cfg.mode === 'test' ? cfg.test_email : to } };
});`),
    ifTrue('Sending switched on?', cfg('sends_enabled')),
    stop('STOP: preview - nothing sent'),
    gmail.send('Email the reminder', { to: '$json.send_to', subject: "($('config').first().json.mode === 'test' ? '[TEST to ' + $json.to + '] ' : '') + $json.subject", message: '$json.body' }),
    ifTrue('Live run with a sheet?', `${cfg('live')} && ${cfg('sheets_enabled')}`),
    stop('STOP: not live - sheet untouched'),
    code('Shape the sheet update', `
// Only the two tracking columns change; the key column finds the row.
const col = $('config').first().json.columns;
const c = $('Write each email').item.json;
return { json: { [col.id]: c.id, [col.count]: c.step, [col.last]: new Date().toISOString().slice(0, 10) } };`, { perItem: true }),
    sheets.update('Update the Contracts tab', cfg('contracts_sheet_id'), 'Contracts', 'Contract ID'),
  ],
  edges: [
    ['Run manually', 'config'], ['Every weekday at 10:00', 'config'],
    ['config', 'Use sample contracts?'],
    ['Use sample contracts?', 0, 'Load sample contracts'], ['Use sample contracts?', 1, 'Read the Contracts tab'],
    ['Read the Contracts tab', 'Read contract rows'],
    ['Load sample contracts', 'Combine contract sources'], ['Read contract rows', 0, 'Combine contract sources', 1],
    ['Combine contract sources', 'Pick the next step'],
    ['Pick the next step', 'Write each email'],
    ['Write each email', 'Sending switched on?'],
    ['Sending switched on?', 0, 'Email the reminder'], ['Sending switched on?', 1, 'STOP: preview - nothing sent'],
    ['Email the reminder', 'Live run with a sheet?'],
    ['Live run with a sheet?', 0, 'Shape the sheet update'], ['Live run with a sheet?', 1, 'STOP: not live - sheet untouched'],
    ['Shape the sheet update', 'Update the Contracts tab'],
  ],
  groups: [
    { title: 'Start and settings', why: 'Weekdays at 10:00, so reminders land during working hours. The ladder, escalation wait and column names live in `config`.', nodes: ['Run manually', 'Every weekday at 10:00', 'config'] },
    { title: 'Read the contract list', why: '`Read contract rows` maps your headers through `COLUMNS` and drops rows without an id. `Load sample contracts` covers every rule until `CONTRACTS_SHEET_ID` is set.', nodes: ['Use sample contracts?', 'Load sample contracts', 'Read the Contracts tab', 'Read contract rows', 'Combine contract sources'] },
    { title: 'Pick the step and write', why: 'Done statuses are checked first, then `MIN_GAP_DAYS`, so a signed or recently chased contract never gets another email. The step after the last reminder goes to the owner, once.', nodes: ['Pick the next step', 'Write each email'] },
    { title: 'Send and write back', why: 'A test send goes to `TEST_EMAIL` and leaves the sheet alone, so the real reminder still goes later. Only a live run updates Reminders sent and Last reminder.', nodes: ['Sending switched on?', 'STOP: preview - nothing sent', 'Email the reminder', 'Live run with a sheet?', 'STOP: not live - sheet untouched', 'Shape the sheet update', 'Update the Contracts tab'] },
  ],
  scenarios: [
    {
      name: 'shipped config (preview)', start: 'Run manually',
      expect: { reached: ['Load sample contracts', 'STOP: preview - nothing sent'], outward: 'none' },
      check: out => {
        const p = out['Pick the next step'][0];
        const f: string[] = [];
        const got = p.due.map((c: any) => c.id + ':' + c.step + (c.escalate ? 'E' : '')).sort().join(',');
        if (got !== 'C-101:1,C-102:2,C-104:4E') f.push(`steps wrong: ${got}`);
        const r = Object.fromEntries(p.held.map((h: any) => [h.id, h.reason]));
        const want: Record<string, string> = { 'C-103': 'last email 1 day(s) ago', 'C-105': 'signed', 'C-106': 'declined', 'C-107': 'next reminder not due yet', 'C-108': 'already escalated, chase by hand', 'C-109': 'no signer email' };
        for (const [k, v] of Object.entries(want)) if (r[k] !== v) f.push(`${k} should be held as "${v}", got "${r[k]}"`);
        const esc = out['Write each email'].find((e: any) => e.escalate);
        if (esc?.to !== 'maya@yourcompany.example' || !esc?.subject.startsWith('Unsigned after 3 reminders')) f.push('escalation should go to the owner');
        return f;
      },
    },
    {
      name: 'test send to TEST_EMAIL', start: 'Run manually', overrides: { TEST_EMAIL: 'you@example.com' },
      mocks: { 'Email the reminder': (items: any[]) => items.map(() => ({ id: 'msg', labelIds: ['SENT'] })) },
      expect: { reached: ['Email the reminder', 'STOP: not live - sheet untouched'], notReached: ['Update the Contracts tab'], outward: 'some' },
      check: out => out['Write each email'].every((e: any) => e.send_to === 'you@example.com') ? [] : ['test send not redirected'],
    },
    {
      name: 'live from the sheet', start: 'Every weekday at 10:00',
      overrides: { CONTRACTS_SHEET_ID: '1CtrSheet', TEST_RUN: false },
      mocks: {
        'Read the Contracts tab': [{ row_number: 2, 'Contract ID': 'K-9', Company: 'Ridge Timber', Contract: 'Supply agreement', 'Signer name': 'Ana Ruiz', 'Signer email': 'ana@ridgetimber.example',
          'Owner name': 'Theo Grant', 'Owner email': 'theo@yourcompany.example', 'Sent date': new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10), Status: 'Sent', 'Reminders sent': '1',
          'Last reminder': new Date(Date.now() - 4 * 864e5).toISOString().slice(0, 10), 'Signing link': 'https://sign.example/k9' }],
        'Email the reminder': [{ id: 'msg_1', labelIds: ['SENT'] }],
        'Update the Contracts tab': (items: any[]) => items,
      },
      expect: { reached: ['Read contract rows', 'Email the reminder', 'Update the Contracts tab'], notReached: ['Load sample contracts'], outward: 'some' },
      check: out => {
        const u = out['Shape the sheet update'][0];
        return u?.['Contract ID'] === 'K-9' && u?.['Reminders sent'] === 2 ? [] : [`write-back wrong: ${JSON.stringify(u)}`];
      },
    },
  ],
});
