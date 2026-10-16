import { defineSpec } from '../_kit/spec';
import { trigger, code, ifTrue, ifWhen, merge, stop, http, gmail } from '../_kit/n';

const cfg = (k: string) => `$('config').first().json.${k}`;
const Q_HOURS = 'Can you work at least 4 hours overlapping 10:00-16:00 UK time?';
const Q_ONSITE = 'Can you join an on-site week in Lisbon once a quarter?';

export default defineSpec({
  slug: 'job-application-knockout-screen',
  title: 'Screen job applications from a form with knockout questions into Airtable',
  summary: 'Checks each application against must-have answers, right to work, salary band and notice period, scores the rest out of 100, files every candidate in Airtable with the reason and sends an email that matches the outcome.',
  category: 'HR and people',
  description: {
    who: 'Founders and hiring managers at small companies who get 50 to 300 applications per role and read every one, including the ones that fail a basic requirement. The knockouts are applied the same way every time, and every candidate hears back.',
    how: [
      'A candidate applies through the n8n form. A manual run uses four sample applications.',
      'Knockouts come first: a must-have answered No, no right to work, sponsorship the role cannot offer, too little experience, salary over the band plus `SALARY_STRETCH_PCT`, or a notice period over the limit.',
      'Applications that pass get a weighted score out of 100 from experience, salary fit, notice, nice-to-haves and a portfolio link. `SHORTLIST_SCORE` and above goes to review, the rest to hold.',
      'The candidate gets an email for their outcome, then a record with score, reasons and answers is created in Airtable.',
    ],
    setup: [
      'Run it once as imported. It scores the sample applications and stops at `STOP: preview - nothing sent`.',
      'Create an Airtable table with Name, Email, Role, Outcome, Score, Reasons and Answers fields, add an Airtable token credential to `Create candidate in Airtable`, and set `AIRTABLE_BASE_ID` and `AIRTABLE_TABLE`.',
      'Connect Gmail, edit `ROLES` for your open positions and activate the workflow to publish the form.',
      'Put your address in `TEST_EMAIL` to read each candidate email yourself, then set `TEST_RUN = false`.',
    ],
    requirements: ['An Airtable base', 'A Gmail account', 'An n8n instance that can serve a public form'],
    customize: [
      '`ROLES` sets the salary band, minimum years, maximum notice, sponsorship and nice-to-haves per role.',
      '`WEIGHTS` changes how the 100 points are split; `SHORTLIST_SCORE` moves the review line.',
      '`REJECTION_TEXT` maps each knockout to the sentence the candidate reads.',
    ],
  },
  config: {
    intro: ['A manual run screens SAMPLE applications; the form trigger screens real ones.', 'AIRTABLE_BASE_ID blank -> no record is created.'],
    consts: [
      { name: 'ROLES', value: {
        'Senior Backend Engineer': { salary_min: 70000, salary_max: 95000, min_years: 5, max_notice_weeks: 12, sponsorship: false, nice_to_have: ['Postgres', 'Kubernetes', 'TypeScript'] },
        'Customer Support Lead': { salary_min: 42000, salary_max: 52000, min_years: 3, max_notice_weeks: 8, sponsorship: true, nice_to_have: ['Zendesk', 'SaaS', 'team lead'] },
      }, note: 'one entry per open role; salaries are yearly in your currency' },
      { name: 'MUST_HAVE', value: { [Q_HOURS]: 'Yes', [Q_ONSITE]: 'Yes' }, note: 'form question -> the only answer that passes' },
      { name: 'SALARY_STRETCH_PCT', value: 10, note: 'an ask this far above the band is scored low but not rejected' },
      { name: 'YEARS_GRACE', value: 1, note: 'candidates this many years under the minimum still pass the knockout' },
      { name: 'WEIGHTS', value: { experience: 30, salary: 25, notice: 15, nice_to_have: 20, portfolio: 10 }, note: 'points per factor; should add up to 100' },
      { name: 'SHORTLIST_SCORE', value: 70, note: 'scores at or above this go to review' },
      { name: 'REJECTION_TEXT', value: {
        must_have: 'the role needs {question}',
        right_to_work: 'the role needs the right to work in the country without a visa',
        sponsorship: 'we are not able to sponsor a visa for this role',
        experience: 'we are looking for at least {years} years in a similar role',
        salary: 'your expected salary is above the range we have for this role',
        notice: 'we need someone who can start within {weeks} weeks',
      }, note: 'what the candidate reads for each knockout' },
      { name: 'AIRTABLE_BASE_ID', value: '', note: 'Airtable base id (starts with app); blank skips the record' },
      { name: 'AIRTABLE_TABLE', value: 'Candidates', note: 'table name or id inside the base' },
      { name: 'COMPANY_NAME', value: 'Northwind', note: 'used in candidate emails' },
    ],
    flags: { airtable_enabled: "AIRTABLE_BASE_ID.trim() !== ''", from_form: 'FROM_FORM' },
    safety: 'test_run',
    extra: `// The form trigger's item carries formMode; a manual run does not.
const FROM_FORM = Boolean($input.first() && ($input.first().json.formMode || $input.first().json.submittedAt));`,
  },
  nodes: [
    trigger.manual(),
    trigger.form('Job application form', 'Apply to Northwind', 'Takes about 3 minutes. Every applicant hears back by email.', [
      { label: 'Full name', required: true },
      { label: 'Email', type: 'email', required: true },
      { label: 'Role', type: 'dropdown', options: ['Senior Backend Engineer', 'Customer Support Lead'], required: true },
      { label: 'Right to work', type: 'dropdown', options: ['Yes', 'Need sponsorship', 'No'], required: true },
      { label: 'Years in a similar role', type: 'number', required: true },
      { label: 'Expected yearly salary', type: 'number', required: true },
      { label: 'Notice period in weeks', type: 'number', required: true },
      { label: Q_HOURS, type: 'dropdown', options: ['Yes', 'No'], required: true },
      { label: Q_ONSITE, type: 'dropdown', options: ['Yes', 'No'], required: true },
      { label: 'Portfolio, GitHub or LinkedIn link' },
      { label: 'Anything else we should know?', type: 'textarea' },
    ]),
    ifTrue('Came from the form?', cfg('from_form')),
    code('Read the form answers', `
// Form labels -> the application shape the screen reads.
const cfg = $('config').first().json;
const f = $('Job application form').first().json;
return [{ json: {
  name: String(f['Full name'] || '').trim(), email: String(f['Email'] || '').trim().toLowerCase(), role: f['Role'] || '',
  right_to_work: f['Right to work'] || '', years: Number(f['Years in a similar role'] || 0),
  salary: Number(f['Expected yearly salary'] || 0), notice_weeks: Number(f['Notice period in weeks'] || 0),
  must_have: Object.fromEntries(Object.keys(cfg.must_have).map(q => [q, f[q] || ''])),
  link: String(f['Portfolio, GitHub or LinkedIn link'] || '').trim(), note: f['Anything else we should know?'] || '',
  submitted_at: f.submittedAt || new Date().toISOString(),
} }];`),
    code('Load sample applications', `
// Manual run: one strong candidate, one knockout per kind of rule, one middling.
const cfg = $('config').first().json;
const [qHours, qOnsite] = Object.keys(cfg.must_have);
const yes = { [qHours]: 'Yes', [qOnsite]: 'Yes' };
return [
  { name: 'Noor Haddad', email: 'noor.haddad@mailbox.example', role: 'Senior Backend Engineer', right_to_work: 'Yes', years: 7, salary: 88000, notice_weeks: 4,
    must_have: yes, link: 'https://github.example/noorh', note: 'Ran Postgres and Kubernetes for a payments team; TypeScript daily.' },
  { name: 'Tariq Bell', email: 'tariq.bell@mailbox.example', role: 'Senior Backend Engineer', right_to_work: 'Need sponsorship', years: 9, salary: 90000, notice_weeks: 8,
    must_have: yes, link: '', note: '' },
  { name: 'Ines Duarte', email: 'ines.duarte@mailbox.example', role: 'Customer Support Lead', right_to_work: 'Yes', years: 4, salary: 50000, notice_weeks: 12,
    must_have: { [qHours]: 'Yes', [qOnsite]: 'No' }, link: '', note: 'Zendesk admin for 3 years.' },
  { name: 'Marta Lind', email: 'marta.lind@mailbox.example', role: 'Customer Support Lead', right_to_work: 'Yes', years: 2, salary: 54000, notice_weeks: 6,
    must_have: yes, link: '', note: 'Support at a SaaS startup.' },
].map(json => ({ json: { ...json, submitted_at: new Date().toISOString() } }));`),
    merge('Combine applications'),
    code('Screen and score', `
// Knockouts first: any one ends the screen with a reason the candidate can read.
// Survivors get WEIGHTS points: experience (to 2x the minimum), salary fit, notice,
// nice-to-have keywords in the note, and a portfolio link.
const cfg = $('config').first().json;
const W = cfg.weights;
const store = $getWorkflowStaticData('global');
const seen = store.applied || {};
const out = [];
for (const { json: a } of $input.all()) {
  const role = cfg.roles[a.role];
  const knock = [];
  const say = (k, vars = {}) => Object.entries(vars).reduce((s, [x, v]) => s.replace('{' + x + '}', v), cfg.rejection_text[k]);
  if (!role) { out.push({ ...a, outcome: 'hold', score: 0, reasons: ['role not in ROLES'], candidate_reason: '' }); continue; }
  const key = a.email + '|' + a.role;
  if (seen[key] && Date.now() - seen[key] < 90 * 864e5) { out.push({ ...a, outcome: 'duplicate', score: 0, reasons: ['applied to this role in the last 90 days'], candidate_reason: '' }); continue; }
  for (const [q, want] of Object.entries(cfg.must_have)) if ((a.must_have[q] || '') !== want) knock.push(['must_have', say('must_have', { question: q.replace(/^(Can|Do) you /i, 'someone who can ').replace(/\\?$/, '').toLowerCase() })]);
  if (a.right_to_work === 'No') knock.push(['right_to_work', say('right_to_work')]);
  if (a.right_to_work === 'Need sponsorship' && !role.sponsorship) knock.push(['sponsorship', say('sponsorship')]);
  if (a.years < role.min_years - cfg.years_grace) knock.push(['experience', say('experience', { years: role.min_years })]);
  if (a.salary > role.salary_max * (1 + cfg.salary_stretch_pct / 100)) knock.push(['salary', say('salary')]);
  if (a.notice_weeks > role.max_notice_weeks) knock.push(['notice', say('notice', { weeks: role.max_notice_weeks })]);
  if (knock.length) {
    out.push({ ...a, outcome: 'reject', score: 0, reasons: knock.map(k => k[0]), candidate_reason: knock[0][1] });
    continue;
  }
  const exp = Math.min(1, a.years / (role.min_years * 2));
  const sal = a.salary <= role.salary_max ? (a.salary >= role.salary_min ? 1 : 0.8) : 0.4;
  const notice = a.notice_weeks <= 4 ? 1 : 1 - (a.notice_weeks - 4) / Math.max(1, role.max_notice_weeks - 4) * 0.6;
  const text = (a.note || '').toLowerCase();
  const hits = role.nice_to_have.filter(k => text.includes(k.toLowerCase()));
  const nice = role.nice_to_have.length ? hits.length / role.nice_to_have.length : 0;
  const parts = { experience: exp * W.experience, salary: sal * W.salary, notice: notice * W.notice, nice_to_have: nice * W.nice_to_have, portfolio: a.link ? W.portfolio : 0 };
  const score = Math.round(Object.values(parts).reduce((x, y) => x + y, 0));
  out.push({ ...a, outcome: score >= cfg.shortlist_score ? 'review' : 'hold', score, reasons: [
    'experience ' + Math.round(parts.experience) + '/' + W.experience, 'salary ' + Math.round(parts.salary) + '/' + W.salary,
    'notice ' + Math.round(parts.notice) + '/' + W.notice, 'nice-to-have ' + hits.join('+') + ' ' + Math.round(parts.nice_to_have) + '/' + W.nice_to_have,
    'portfolio ' + parts.portfolio + '/' + W.portfolio], candidate_reason: '' });
}
return out.map(json => ({ json }));`),
    code('Write the candidate email', `
// One email per outcome. Rejections give the first knockout reason in plain words.
const cfg = $('config').first().json;
const first = n => (n || '').split(' ')[0] || 'there';
const bodies = {
  review: a => 'Thanks for applying for ' + a.role + '. Your application is with the hiring team now and you will hear from us within 5 working days.',
  hold: a => 'Thanks for applying for ' + a.role + '. We are reviewing applications in batches and will let you know either way within 2 weeks.',
  reject: a => 'Thanks for applying for ' + a.role + '. We are not taking your application further, because ' + a.candidate_reason + '. We will keep your details for 6 months in case another role fits.',
};
return $input.all().filter(i => bodies[i.json.outcome]).map(({ json: a }) => ({ json: { ...a,
  send_to: cfg.mode === 'test' ? cfg.test_email : a.email,
  subject: (a.outcome === 'reject' ? 'Your application for ' : 'We received your application for ') + a.role,
  body: 'Hi ' + first(a.name) + ',\\n\\n' + bodies[a.outcome](a) + '\\n\\n' + cfg.company_name + ' hiring team',
} }));`),
    ifTrue('Sending switched on?', cfg('sends_enabled')),
    stop('STOP: preview - nothing sent'),
    gmail.send('Email the candidate', { to: '$json.send_to', subject: "($('config').first().json.mode === 'test' ? '[TEST to ' + $json.email + '] ' : '') + $json.subject", message: '$json.body' }),
    ifWhen('Live with Airtable?', [[cfg('live'), 'true'], [cfg('airtable_enabled'), 'true']]),
    stop('STOP: test send or no Airtable base'),
    http('Create candidate in Airtable', {
      method: 'POST', auth: 'airtableTokenApi',
      url: `={{ 'https://api.airtable.com/v0/' + ${cfg('airtable_base_id')} + '/' + encodeURIComponent(${cfg('airtable_table')}) }}`,
      jsonBody: `JSON.stringify({ typecast: true, fields: (a => ({ Name: a.name, Email: a.email, Role: a.role, Outcome: a.outcome, Score: a.score, Reasons: a.reasons.join('; '), Answers: 'Right to work: ' + a.right_to_work + '; years: ' + a.years + '; salary: ' + a.salary + '; notice: ' + a.notice_weeks + ' weeks; link: ' + (a.link || 'none'), Applied: a.submitted_at.slice(0, 10) }))($('Write the candidate email').item.json) })`,
    }),
    code('Remember applicants', `
// Records email+role so a second application inside 90 days is marked duplicate.
const store = $getWorkflowStaticData('global');
store.applied = store.applied || {};
const recs = $input.all();
$('Write the candidate email').all().forEach((a, i) => { if (recs[i]?.json.id) store.applied[a.json.email + '|' + a.json.role] = Date.now(); });
return [{ json: { remembered: Object.keys(store.applied).length } }];`),
  ],
  edges: [
    ['Run manually', 'config'], ['Job application form', 'config'],
    ['config', 'Came from the form?'],
    ['Came from the form?', 0, 'Read the form answers'], ['Came from the form?', 1, 'Load sample applications'],
    ['Read the form answers', 'Combine applications'], ['Load sample applications', 0, 'Combine applications', 1],
    ['Combine applications', 'Screen and score'],
    ['Screen and score', 'Write the candidate email'],
    ['Write the candidate email', 'Sending switched on?'],
    ['Sending switched on?', 0, 'Email the candidate'], ['Sending switched on?', 1, 'STOP: preview - nothing sent'],
    ['Email the candidate', 'Live with Airtable?'],
    ['Live with Airtable?', 0, 'Create candidate in Airtable'], ['Live with Airtable?', 1, 'STOP: test send or no Airtable base'],
    ['Create candidate in Airtable', 'Remember applicants'],
  ],
  groups: [
    { title: 'Start and settings', why: 'The form is the real entry point; a manual run takes the sample path. Roles, must-have answers, weights and rejection wording all sit in `config`, so a new opening is one more entry in `ROLES`.', nodes: ['Run manually', 'Job application form', 'config'] },
    { title: 'Read the application', why: '`config` records whether the form fired, and `Came from the form?` reads the answers or loads four sample applications that cover a shortlist, a sponsorship knockout, a must-have knockout and a borderline case.', nodes: ['Came from the form?', 'Read the form answers', 'Load sample applications', 'Combine applications'] },
    { title: 'Knock out, then score', why: 'Knockouts run before any scoring, so a strong score can never hide a hard requirement. Every outcome carries its reasons, and `Write the candidate email` uses the first knockout reason in words a candidate can act on.', nodes: ['Screen and score', 'Write the candidate email'] },
    { title: 'Email and file', why: 'In test mode the email goes to `TEST_EMAIL` and Airtable is left alone. Only a live run with `AIRTABLE_BASE_ID` set creates the record, and `Remember applicants` stores email and role only after Airtable returns an id.', nodes: ['Sending switched on?', 'STOP: preview - nothing sent', 'Email the candidate', 'Live with Airtable?', 'STOP: test send or no Airtable base', 'Create candidate in Airtable', 'Remember applicants'] },
  ],
  scenarios: [
    {
      name: 'shipped config (sample applications, preview)', start: 'Run manually',
      expect: { reached: ['Load sample applications', 'STOP: preview - nothing sent'], notReached: ['Read the form answers'], outward: 'none' },
      check: out => {
        const s = out['Screen and score'];
        const by = (n: string) => s.find((a: any) => a.name === n);
        const f: string[] = [];
        if (by('Noor Haddad')?.outcome !== 'review') f.push(`Noor should go to review, got ${by('Noor Haddad')?.outcome} (${by('Noor Haddad')?.score})`);
        if (by('Noor Haddad')?.score !== 91) f.push(`Noor: 21 experience + 25 salary + 15 notice + 20 nice-to-have + 10 portfolio = 91, got ${by('Noor Haddad')?.score}`);
        if (by('Tariq Bell')?.reasons[0] !== 'sponsorship') f.push('Tariq needs sponsorship the backend role cannot give');
        if (by('Ines Duarte')?.reasons.join() !== 'must_have,notice') f.push(`Ines fails on-site and notice, got ${by('Ines Duarte')?.reasons}`);
        const marta = by('Marta Lind');
        if (marta?.outcome !== 'hold') f.push(`Marta passes knockouts (grace year, salary within stretch) but scores low, got ${marta?.outcome} ${marta?.score}`);
        const mail = out['Write the candidate email'].find((a: any) => a.name === 'Ines Duarte');
        if (!mail?.body.includes('someone who can join an on-site week')) f.push('Ines should read the on-site reason');
        return f;
      },
    },
    {
      name: 'form application, live with Airtable', start: 'Job application form',
      input: [{ 'Full name': 'Rosa Vidal', Email: 'Rosa.Vidal@mailbox.example', Role: 'Customer Support Lead', 'Right to work': 'Need sponsorship', 'Years in a similar role': 5, 'Expected yearly salary': 47000, 'Notice period in weeks': 4, [Q_HOURS]: 'Yes', [Q_ONSITE]: 'Yes', 'Portfolio, GitHub or LinkedIn link': 'https://linkedin.example/rosav', 'Anything else we should know?': 'Led a Zendesk team of 6 at a SaaS company.', submittedAt: new Date().toISOString(), formMode: 'production' }],
      overrides: { TEST_RUN: false, AIRTABLE_BASE_ID: 'appExample123' },
      mocks: {
        'Email the candidate': [{ id: 'msg_1', labelIds: ['SENT'] }],
        'Create candidate in Airtable': [{ id: 'recA1b2C3', createdTime: new Date().toISOString(), fields: {} }],
      },
      expect: { reached: ['Read the form answers', 'Email the candidate', 'Create candidate in Airtable', 'Remember applicants'], notReached: ['Load sample applications'], outward: 'some' },
      check: out => {
        const a = out['Screen and score'][0];
        const f: string[] = [];
        if (a.outcome !== 'review' || a.score !== 88) f.push(`Rosa (sponsorship allowed for this role) should score 25 + 25 + 15 + 13 + 10 = 88 and go to review, got ${a.outcome} ${a.score}`);
        if (out['Write the candidate email'][0].send_to !== 'rosa.vidal@mailbox.example') f.push('live email goes to the candidate, lowercased');
        return f;
      },
    },
  ],
});
