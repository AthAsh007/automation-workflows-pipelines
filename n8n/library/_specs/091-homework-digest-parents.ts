import { defineSpec } from '../_kit/spec';
import { trigger, code, ifTrue, merge, stop, sheets, gmail } from '../_kit/n';

const cfg = (k: string) => `$('config').first().json.${k}`;

export default defineSpec({
  slug: 'homework-digest-parents',
  title: 'Email weekly homework digests to parents from Google Sheets',
  summary: 'Every Sunday reads assignments, students and grades from one Google Sheet, builds a single digest per family covering every sibling with homework due next week plus any late or missing work, and emails both parents.',
  category: 'Local business and services',
  description: {
    who: 'Small schools, tutoring centres and homeschool co-ops that track homework in a spreadsheet. Parents get one email on Sunday evening that covers every child, instead of one per class or none at all.',
    how: [
      'Every Sunday at 17:00 it reads three tabs: Assignments (class, subject, title, due date), Students (class and parent emails) and Grades (late or missing work). Sample data is used until a sheet is set.',
      'Assignments due Monday to Sunday of next week are matched to each student by class.',
      'Late and missing items from the Grades tab are added per student, with how many days overdue they are.',
      'Students who share a parent email are one family, so siblings in different classes land in one digest sent to both parents.',
      'Families with nothing due and nothing outstanding are skipped, as are students with no parent email.',
    ],
    setup: [
      'Run it once as imported. It builds digests from sample data and stops at `STOP: preview - nothing sent`.',
      'Create Assignments (Class, Subject, Title, Due), Students (Student ID, Student name, Class, Parent email, Second parent email) and Grades (Student ID, Assignment, Status, Due) tabs, connect Google Sheets and set `SCHOOL_SHEET_ID`.',
      'Connect Gmail and set `SCHOOL_NAME` and `REPLY_TO_NAME`.',
      'Put your address in `TEST_EMAIL` to receive every digest yourself, then set `TEST_RUN = false`.',
    ],
    requirements: ['A Google Sheet with Assignments, Students and Grades tabs', 'A Gmail account'],
    customize: [
      'Set `SEND_EMPTY = true` to send a short "nothing due" email to every family.',
      '`OUTSTANDING_STATUSES` lists the Grades statuses that count as late or missing.',
      '`MAX_EMAILS` caps digests per run.',
    ],
  },
  config: {
    intro: ['SCHOOL_SHEET_ID blank -> SAMPLE assignments, students and grades so the run works before any credential exists.', 'Nothing is written anywhere; the only action is the email.'],
    consts: [
      { name: 'SCHOOL_SHEET_ID', value: '', note: 'Google Sheets id with Assignments, Students and Grades tabs; blank uses sample data' },
      { name: 'SCHOOL_NAME', value: 'Riverside Learning Centre', note: 'shown in the subject and sign-off' },
      { name: 'REPLY_TO_NAME', value: 'Ms Alvarez, homework coordinator', note: 'who parents should reply to' },
      { name: 'OUTSTANDING_STATUSES', value: ['missing', 'late', 'incomplete'], note: 'Grades statuses listed as outstanding (case ignored)' },
      { name: 'SEND_EMPTY', value: false, note: 'true sends a short email even when a family has nothing due' },
      { name: 'MAX_EMAILS', value: 300, note: 'hard ceiling on digests per run' },
    ],
    flags: { sheets_enabled: "SCHOOL_SHEET_ID.trim() !== ''" },
    safety: 'test_run',
  },
  nodes: [
    trigger.manual(),
    trigger.schedule('Every Sunday at 17:00', '0 17 * * 0'),
    ifTrue('School sheet set?', cfg('sheets_enabled')),
    sheets.read('Read the Assignments tab', cfg('school_sheet_id'), 'Assignments'),
    sheets.read('Read the Students tab', cfg('school_sheet_id'), 'Students'),
    sheets.read('Read the Grades tab', cfg('school_sheet_id'), 'Grades'),
    code('Load sample school data', `
// Used until SCHOOL_SHEET_ID is set. Dates are built around next Monday so the
// week window always has work in it. Rows from all three tabs, as the sheet returns them.
const now = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');
const toMon = (8 - now.getUTCDay()) % 7 || 7;
const d = n => new Date(now.getTime() + (toMon + n) * 864e5).toISOString().slice(0, 10);
const past = n => new Date(now.getTime() - n * 864e5).toISOString().slice(0, 10);
const A = (Class, Subject, Title, Due) => ({ Class, Subject, Title, Due });
const S = (id, name, Class, p1, p2 = '') => ({ 'Student ID': id, 'Student name': name, Class, 'Parent email': p1, 'Second parent email': p2, 'Parent name': '' });
const G = (id, Assignment, Status, Due) => ({ 'Student ID': id, Assignment, Status, Due });
return [
  A('7A', 'English', 'Read chapters 4-6 of Holes', d(1)),
  A('7A', 'Maths', 'Fractions worksheet 3', d(3)),
  A('9C', 'Science', 'Forces revision quiz', d(0)),
  A('9C', 'History', 'Essay plan: causes of WW1', d(4)),
  A('9C', 'Maths', 'Algebra homework 12', d(9)),
  A('7A', 'Art', 'Sketchbook page', past(3)),
  S('ST1', 'Ava Brooks', '7A', 'jo.brooks@mail.example', 'sam.brooks@mail.example'),
  S('ST2', 'Leo Brooks', '9C', 'Jo.Brooks@mail.example'),
  S('ST3', 'Maya Singh', '7A', 'r.singh@mail.example'),
  S('ST4', 'Omar Haddad', '8B', 'haddad.family@mail.example'),
  S('ST5', 'Zoe Clarke', '9C', ''),
  G('ST2', 'Lab report: pendulums', 'Missing', past(6)),
  G('ST1', 'Poetry analysis', 'late', past(2)),
  G('ST3', 'Map skills', 'Submitted', past(4)),
].map(json => ({ json }));`),
    merge('Combine school data', 4),
    code('Build one digest per family', `
// Rows are told apart by their columns. Family = the set of parent emails, compared
// lower-case, so siblings entered with different capitalisation still merge.
const cfg = $('config').first().json;
const rows = $input.all().map(i => i.json);
const assignments = rows.filter(r => r.Title && r.Due && r.Class);
const students = rows.filter(r => r['Student ID'] && 'Parent email' in r);
const grades = rows.filter(r => r['Student ID'] && r.Status);
const today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');
const toMon = (8 - today.getUTCDay()) % 7 || 7;
const iso = t => new Date(t).toISOString().slice(0, 10);
const from = iso(today.getTime() + toMon * 864e5), to = iso(today.getTime() + (toMon + 6) * 864e5);
const outstanding = cfg.outstanding_statuses.map(s => s.toLowerCase());
const dayName = s => new Date(s + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const families = new Map(), held = [];
for (const s of students) {
  const emails = [s['Parent email'], s['Second parent email']].map(e => String(e || '').trim().toLowerCase()).filter(e => e.includes('@'));
  if (!emails.length) { held.push({ student: s['Student name'], reason: 'no parent email' }); continue; }
  const key = emails[0];
  const fam = families.get(key) || { emails: new Set(), children: [] };
  emails.forEach(e => fam.emails.add(e));
  const due = assignments.filter(a => String(a.Class).trim() === String(s.Class).trim() && String(a.Due).slice(0, 10) >= from && String(a.Due).slice(0, 10) <= to)
    .sort((a, b) => String(a.Due).localeCompare(String(b.Due)));
  const owed = grades.filter(g => g['Student ID'] === s['Student ID'] && outstanding.includes(String(g.Status).trim().toLowerCase()))
    .map(g => ({ title: g.Assignment, status: String(g.Status).toLowerCase(), days: Math.max(0, Math.floor((today - new Date(String(g.Due).slice(0, 10) + 'T00:00:00Z')) / 864e5)) }));
  fam.children.push({ name: s['Student name'], first: String(s['Student name']).split(' ')[0], cls: s.Class, due, owed });
  families.set(key, fam);
}
const digests = [];
for (const [key, fam] of families) {
  const items = fam.children.reduce((n, c) => n + c.due.length + c.owed.length, 0);
  if (!items && !cfg.send_empty) { held.push({ student: fam.children.map(c => c.name).join(' & '), reason: 'nothing due next week' }); continue; }
  const lines = ['Hello,', '', 'Here is the homework for ' + fam.children.map(c => c.first).join(' and ') + ' for the week of ' + dayName(from) + '.', ''];
  for (const c of fam.children) {
    lines.push(c.name.toUpperCase() + ' (class ' + c.cls + ')');
    if (!c.due.length) lines.push('- Nothing due next week.');
    for (const a of c.due) lines.push('- ' + dayName(String(a.Due).slice(0, 10)) + ': ' + a.Subject + ', ' + a.Title);
    for (const o of c.owed) lines.push('- OUTSTANDING (' + o.status + ', ' + o.days + ' days): ' + o.title);
    lines.push('');
  }
  lines.push('Reply to this email with any questions.', cfg.reply_to_name, cfg.school_name);
  const to = [...fam.emails];
  digests.push({ family: key, to: to.join(','), children: fam.children.map(c => c.name), due: fam.children.reduce((n, c) => n + c.due.length, 0),
    outstanding: fam.children.reduce((n, c) => n + c.owed.length, 0),
    subject: 'Homework for the week of ' + dayName(from) + ': ' + fam.children.map(c => c.first).join(', '), body: lines.join('\\n'),
    send_to: cfg.mode === 'test' ? cfg.test_email : to.join(',') });
}
for (const d of digests.slice(cfg.max_emails)) held.push({ student: d.children.join(' & '), reason: 'over MAX_EMAILS' });
return [{ json: { digests: digests.slice(0, cfg.max_emails), held, week: from + ' to ' + to } }];`),
    code('Split into family emails', `
// One item per family email.
return $input.first().json.digests.map(json => ({ json }));`),
    code('Summarise the run', `
// Execution log: digests built and students held back.
const cfg = $('config').first().json;
const r = $input.first().json;
const text = ['Homework digests (' + cfg.mode + ') for ' + r.week + ': ' + r.digests.length + ' families.',
  ...r.digests.map(d => '- ' + d.children.join(' & ') + ': ' + d.due + ' due, ' + d.outstanding + ' outstanding'),
  ...r.held.map(h => '- held ' + h.student + ': ' + h.reason)].join('\\n');
return [{ json: { text, families: r.digests.length, held: r.held.length } }];`),
    ifTrue('Sending switched on?', cfg('sends_enabled')),
    stop('STOP: preview - nothing sent'),
    gmail.send('Email the family digest', { to: '$json.send_to', subject: "($('config').first().json.mode === 'test' ? '[TEST to ' + $json.to + '] ' : '') + $json.subject", message: '$json.body' }),
  ],
  edges: [
    ['Run manually', 'config'], ['Every Sunday at 17:00', 'config'],
    ['config', 'School sheet set?'],
    ['School sheet set?', 0, 'Read the Assignments tab'], ['School sheet set?', 0, 'Read the Students tab'], ['School sheet set?', 0, 'Read the Grades tab'],
    ['School sheet set?', 1, 'Load sample school data'],
    ['Read the Assignments tab', 'Combine school data'], ['Read the Students tab', 0, 'Combine school data', 1],
    ['Read the Grades tab', 0, 'Combine school data', 2], ['Load sample school data', 0, 'Combine school data', 3],
    ['Combine school data', 'Build one digest per family'],
    ['Build one digest per family', 'Split into family emails'],
    ['Build one digest per family', 'Summarise the run'],
    ['Split into family emails', 'Sending switched on?'],
    ['Sending switched on?', 0, 'Email the family digest'], ['Sending switched on?', 1, 'STOP: preview - nothing sent'],
  ],
  groups: [
    { title: 'Start and settings', why: 'Runs every Sunday at 17:00 so the digest is in inboxes before the school week. School name, the outstanding statuses and the empty-week rule live in `config`.', nodes: ['Run manually', 'Every Sunday at 17:00', 'config'] },
    { title: 'Read the three tabs', why: 'Assignments, Students and Grades are read in parallel into one merge. Rows are told apart by their columns, so `Load sample school data` can stand in for all three with one node.', nodes: ['School sheet set?', 'Read the Assignments tab', 'Read the Students tab', 'Read the Grades tab', 'Load sample school data', 'Combine school data'] },
    { title: 'Build family digests', why: 'Grouping by parent email rather than by student means two siblings produce one email, not two. Outstanding work is listed under each child with days overdue, so parents see what to chase first.', nodes: ['Build one digest per family', 'Split into family emails', 'Summarise the run'] },
    { title: 'Email parents', why: 'Nothing is sent while `TEST_RUN` is true and `TEST_EMAIL` is blank. In test mode every digest goes to you with the real parent addresses in the subject.', nodes: ['Sending switched on?', 'STOP: preview - nothing sent', 'Email the family digest'] },
  ],
  scenarios: [
    {
      name: 'shipped config (preview)', start: 'Run manually',
      expect: { reached: ['Load sample school data', 'STOP: preview - nothing sent', 'Summarise the run'], outward: 'none' },
      check: out => {
        const r = out['Build one digest per family'][0];
        const f: string[] = [];
        if (r.digests.length !== 2) f.push(`expected 2 family digests, got ${r.digests.length}`);
        const brooks = r.digests.find((d: any) => d.children.length === 2);
        if (!brooks) f.push('Ava and Leo Brooks should share one digest');
        else {
          if (brooks.to !== 'jo.brooks@mail.example,sam.brooks@mail.example') f.push(`Brooks digest should go to both parents, got ${brooks.to}`);
          if (brooks.due !== 4) f.push(`Brooks should have 4 due next week (2 for 7A, 2 for 9C), got ${brooks.due}`);
          if (brooks.outstanding !== 2) f.push('Brooks should have 2 outstanding items');
          if (brooks.body.includes('Algebra homework 12')) f.push('work due the week after must not be listed');
        }
        const reason = (s: string) => r.held.find((h: any) => h.student.includes(s))?.reason;
        if (reason('Zoe') !== 'no parent email') f.push('Zoe has no parent email');
        if (reason('Omar') !== 'nothing due next week') f.push('Omar (8B) has nothing due');
        return f;
      },
    },
    {
      name: 'live send from the sheet', start: 'Every Sunday at 17:00',
      overrides: { SCHOOL_SHEET_ID: '1SchoolSheetExample', TEST_RUN: false },
      mocks: {
        'Read the Assignments tab': () => {
          const now = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');
          const mon = new Date(now.getTime() + (((8 - now.getUTCDay()) % 7) || 7) * 864e5).toISOString().slice(0, 10);
          return [{ row_number: 2, Class: '5B', Subject: 'Spelling', Title: 'List 7', Due: mon }];
        },
        'Read the Students tab': [{ row_number: 2, 'Student ID': 'Q1', 'Student name': 'Eli Ward', Class: '5B', 'Parent email': 'ward@mail.example', 'Second parent email': '' }],
        'Read the Grades tab': [{ row_number: 2, 'Student ID': 'Q1', Assignment: 'Reading log', Status: 'Submitted', Due: '2026-09-01' }],
        'Email the family digest': [{ id: 'msg-1', labelIds: ['SENT'] }],
      },
      expect: { reached: ['Email the family digest'], notReached: ['Load sample school data'], outward: 'some' },
      check: out => {
        const d = out['Split into family emails'];
        const f: string[] = [];
        if (d.length !== 1 || d[0].send_to !== 'ward@mail.example') f.push('one digest to the parent');
        if (d[0]?.outstanding !== 0) f.push('submitted work is not outstanding');
        return f;
      },
    },
  ],
});
