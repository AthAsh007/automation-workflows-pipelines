import { defineSpec } from '../_kit/spec';
import { trigger, code, ifTrue, ifWhen, switchOn, merge, stop, sheets, slack } from '../_kit/n';

const cfg = (k: string) => `$('config').first().json.${k}`;
const localDate = (tz: string, offsetDays = 0) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(Date.now() + offsetDays * 864e5));

export default defineSpec({
  slug: 'async-standup-form-digest',
  title: 'Collect async standups with an n8n form and post a digest to Slack',
  summary: 'One workflow with two triggers: an n8n form saves each person\'s standup to Google Sheets, and a 10:30 weekday run posts a Slack digest with every update, blockers on top (marked when they repeat from the day before) and who has not checked in.',
  category: 'Productivity and operations',
  description: {
    who: 'Remote and hybrid teams of 4 to 25 across time zones who dropped the daily call but still want one place to see progress and blockers. Each person fills a 1-minute form; the team reads one message.',
    how: [
      'Anyone on `TEAM` fills the standup form: yesterday, today and blockers. The answers are saved as a row on the Standups tab, dated in `TIMEZONE`.',
      'Every weekday at 10:30 the second trigger reads the tab (or sample rows), keeps each person\'s latest standup for today and lists everyone on `TEAM` who has not filled it in.',
      'Blockers go first. Answers like none or n/a are ignored, and a person who also reported a blocker on their previous standup is marked as blocked 2 days running.',
      'One digest is posted to Slack, with people tagged by their Slack id.',
    ],
    setup: [
      'Run it once as imported. It builds a digest from sample standups and stops at `STOP: dry run - digest not posted`.',
      'Create a Standups tab with date, email, name, yesterday, today, blockers and submitted_at columns. Connect Google Sheets and set `STANDUP_SHEET_ID`.',
      'Fill `TEAM` with emails, names and Slack ids. Connect Slack, set `SLACK_CHANNEL_ID` and share the form URL with the team.',
      'Set `DRY_RUN = false` and activate the workflow so the form saves rows and the digest posts.',
    ],
    requirements: ['A Google Sheet for standup rows', 'A Slack workspace', 'An n8n instance that can serve a form'],
    customize: [
      '`TIMEZONE` decides which calendar day a standup belongs to.',
      '`NO_BLOCKER_WORDS` lists answers that mean there is no blocker.',
      'Change the cron on `Every weekday at 10:30` to move the digest.',
    ],
  },
  config: {
    intro: ['STANDUP_SHEET_ID blank -> the digest uses SAMPLE rows and the form saves nothing.', 'ENTRY below says which trigger started this run: the form or the digest.'],
    consts: [
      { name: 'STANDUP_SHEET_ID', value: '', note: 'Google Sheets id with a Standups tab; blank uses sample rows' },
      { name: 'TEAM', value: [
        { email: 'ana@northwind.example', name: 'Ana', slack_id: 'U01ANA' },
        { email: 'ben@northwind.example', name: 'Ben', slack_id: 'U01BEN' },
        { email: 'chloe@northwind.example', name: 'Chloe', slack_id: 'U01CHLOE' },
        { email: 'dev@northwind.example', name: 'Dev', slack_id: 'U01DEV' },
        { email: 'esme@northwind.example', name: 'Esme', slack_id: 'U01ESME' },
      ], note: 'who is expected to post a standup' },
      { name: 'TIMEZONE', value: 'Europe/Berlin', note: 'the team calendar day' },
      { name: 'NO_BLOCKER_WORDS', value: ['none', 'no', 'n/a', 'na', '-', 'nothing', 'no blockers'], note: 'answers that mean no blocker' },
      { name: 'SLACK_CHANNEL_ID', value: '', note: 'channel for the digest; blank skips Slack' },
    ],
    flags: { sheets_enabled: "STANDUP_SHEET_ID.trim() !== ''", slack_enabled: "SLACK_CHANNEL_ID.trim() !== ''", entry: 'ENTRY' },
    safety: 'dry_run',
    extra: `// Which trigger started this run: the form item carries formMode; anything else builds the digest.
const TRIGGER_ITEM = $input.first() ? $input.first().json : {};
const ENTRY = TRIGGER_ITEM.formMode || TRIGGER_ITEM.submittedAt ? 'submit' : 'digest';`,
  },
  nodes: [
    trigger.manual(),
    trigger.form('Standup form', 'Daily standup', 'Takes a minute. The digest goes to Slack at 10:30.', [
      { label: 'Work email', type: 'email', required: true },
      { label: 'What did you finish yesterday?', type: 'textarea', required: true },
      { label: 'What are you doing today?', type: 'textarea', required: true },
      { label: 'Anything blocking you?', type: 'textarea' },
    ]),
    trigger.schedule('Every weekday at 10:30', '30 10 * * 1-5'),
    switchOn('Which entry point?', '$json.entry', ['digest', 'submit']),
    stop('STOP: unknown entry'),
    code('Read the standup answers', `
// Form answers -> one Standups row, dated in TIMEZONE, matched to TEAM by email.
const cfg = $('config').first().json;
const f = $('Standup form').first().json;
const email = String(f['Work email'] || '').trim().toLowerCase();
const member = cfg.team.find(t => t.email.toLowerCase() === email);
const date = new Intl.DateTimeFormat('en-CA', { timeZone: cfg.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
return [{ json: { known: !!member, row: { date, email, name: member?.name || email, yesterday: f['What did you finish yesterday?'] || '',
  today: f['What are you doing today?'] || '', blockers: f['Anything blocking you?'] || '', submitted_at: f.submittedAt || new Date().toISOString() } } }];`),
    ifTrue('On the team?', '$json.known'),
    stop('STOP: not on TEAM - not saved'),
    ifWhen('Save the standup?', [[cfg('live'), 'true'], [cfg('sheets_enabled'), 'true']]),
    stop('STOP: dry run - standup not saved'),
    code('Pick row columns', `
// Only the Standups tab columns go to Sheets.
return [{ json: $input.first().json.row }];`),
    sheets.append('Append to Standups tab', cfg('standup_sheet_id'), 'Standups'),
    ifTrue('Standup sheet set?', cfg('sheets_enabled')),
    sheets.read('Read Standups tab', cfg('standup_sheet_id'), 'Standups'),
    code('Load sample standups', `
// Used until STANDUP_SHEET_ID is set. Today and the previous working day, in TIMEZONE.
const cfg = $('config').first().json;
const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: cfg.timezone, year: 'numeric', month: '2-digit', day: '2-digit' });
const today = fmt.format(new Date()), prev = fmt.format(new Date(Date.now() - 864e5));
const row = (date, email, name, yesterday, todayText, blockers, h) => ({ date, email, name, yesterday, today: todayText, blockers, submitted_at: new Date(Date.now() - h * 36e5).toISOString() });
return [
  row(prev, 'ben@northwind.example', 'Ben', 'Payment retries', 'Payment retries tests', 'Waiting on staging DB access', 25),
  row(prev, 'ana@northwind.example', 'Ana', 'Landing page copy', 'Pricing table', 'none', 25),
  row(today, 'ana@northwind.example', 'Ana', 'Pricing table', 'Signup flow QA', 'n/a', 2),
  row(today, 'ben@northwind.example', 'Ben', 'Payment retries tests', 'Webhook alerts', 'Still no staging DB access', 1.5),
  row(today, 'chloe@northwind.example', 'Chloe', 'Customer interviews x3', 'Write up findings', 'Need sign-off on the survey from legal', 1),
  row(today, 'chloe@northwind.example', 'Chloe', 'Customer interviews x3', 'Write up findings and share', 'Need sign-off on the survey from legal', 0.5),
  row(today, 'guest@agency.example', 'Guest', 'Logo drafts', 'More drafts', '', 1),
].map(json => ({ json }));`),
    merge('Combine standup sources'),
    code('Build the digest', `
// Latest standup per TEAM member for today; blockers first, repeat blockers marked;
// everyone on TEAM without a row today is listed as missing.
const cfg = $('config').first().json;
const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: cfg.timezone, year: 'numeric', month: '2-digit', day: '2-digit' });
const today = fmt.format(new Date());
const none = new Set(cfg.no_blocker_words.map(w => w.toLowerCase()));
const isBlocker = b => { const t = String(b || '').trim().toLowerCase(); return t !== '' && !none.has(t); };
const rows = $input.all().map(i => i.json).filter(r => r.email && r.date)
  .map(r => ({ ...r, email: String(r.email).toLowerCase(), date: String(r.date).slice(0, 10) }))
  .sort((a, b) => String(a.submitted_at).localeCompare(String(b.submitted_at)));
const latest = {}, previous = {};
for (const r of rows) {
  if (r.date === today) latest[r.email] = r;
  else if (r.date < today) previous[r.email] = r;
}
const team = cfg.team.map(t => ({ ...t, email: t.email.toLowerCase() }));
const posted = team.filter(t => latest[t.email]).map(t => {
  const r = latest[t.email];
  const blocked = isBlocker(r.blockers);
  return { name: t.name, slack_id: t.slack_id, yesterday: r.yesterday, today: r.today, blockers: blocked ? r.blockers : '',
    repeat: blocked && previous[t.email] && isBlocker(previous[t.email].blockers) };
});
const missing = team.filter(t => !latest[t.email]).map(t => ({ name: t.name, slack_id: t.slack_id }));
const outsiders = Object.keys(latest).filter(e => !team.some(t => t.email === e));
return [{ json: { date: today, posted, missing, outsiders, blocked: posted.filter(p => p.blockers).length } }];`),
    code('Write the digest message', `
// Blockers block first so they get read; the rest is one line per person.
const d = $input.first().json;
const tag = p => p.slack_id ? '<@' + p.slack_id + '>' : p.name;
const lines = ['*Standup ' + d.date + '*: ' + d.posted.length + ' in, ' + d.missing.length + ' missing, ' + d.blocked + ' blocked'];
const blocked = d.posted.filter(p => p.blockers);
if (blocked.length) lines.push('', '*Blockers*', ...blocked.map(p => '- ' + tag(p) + ': ' + p.blockers + (p.repeat ? ' _(blocked 2 days running)_' : '')));
lines.push('', '*Updates*', ...d.posted.map(p => '- *' + p.name + '*: done ' + p.yesterday + '. Today: ' + p.today));
if (d.missing.length) lines.push('', 'Not in yet: ' + d.missing.map(tag).join(', '));
return [{ json: { text: lines.join('\\n') } }];`),
    ifWhen('Post the digest?', [[cfg('live'), 'true'], [cfg('slack_enabled'), 'true']]),
    stop('STOP: dry run - digest not posted'),
    slack.post('Post the digest to Slack', cfg('slack_channel_id'), '$json.text'),
  ],
  edges: [
    ['Run manually', 'config'], ['Standup form', 'config'], ['Every weekday at 10:30', 'config'],
    ['config', 'Which entry point?'],
    ['Which entry point?', 0, 'Standup sheet set?'], ['Which entry point?', 1, 'Read the standup answers'], ['Which entry point?', 2, 'STOP: unknown entry'],
    ['Read the standup answers', 'On the team?'],
    ['On the team?', 0, 'Save the standup?'], ['On the team?', 1, 'STOP: not on TEAM - not saved'],
    ['Save the standup?', 0, 'Pick row columns'], ['Save the standup?', 1, 'STOP: dry run - standup not saved'],
    ['Pick row columns', 'Append to Standups tab'],
    ['Standup sheet set?', 0, 'Read Standups tab'], ['Standup sheet set?', 1, 'Load sample standups'],
    ['Read Standups tab', 'Combine standup sources'], ['Load sample standups', 0, 'Combine standup sources', 1],
    ['Combine standup sources', 'Build the digest'],
    ['Build the digest', 'Write the digest message'],
    ['Write the digest message', 'Post the digest?'],
    ['Post the digest?', 0, 'Post the digest to Slack'], ['Post the digest?', 1, 'STOP: dry run - digest not posted'],
  ],
  groups: [
    { title: 'Two triggers and the form path', why: 'The form and the 10:30 schedule share one `config`, which records which fired. A form answer is checked against `TEAM` and appended only on a live run with a sheet; everything else goes on to the digest.', nodes: ['Run manually', 'Standup form', 'Every weekday at 10:30', 'config', 'Which entry point?', 'Read the standup answers', 'STOP: unknown entry', 'On the team?', 'STOP: not on TEAM - not saved', 'Save the standup?', 'STOP: dry run - standup not saved', 'Pick row columns', 'Append to Standups tab'] },
    { title: 'Read today\'s standups', why: '`Standup sheet set?` reads the Standups tab once `STANDUP_SHEET_ID` is filled. `Load sample standups` covers a double submission, a repeated blocker, a none answer and someone not on the team.', nodes: ['Standup sheet set?', 'Read Standups tab', 'Load sample standups', 'Combine standup sources'] },
    { title: 'Build and post the digest', why: 'Only the latest row per person counts, so resubmitting fixes a typo instead of duplicating it. The previous standup is what marks a blocker as repeated. `Post the digest?` needs a live run and a channel.', nodes: ['Build the digest', 'Write the digest message', 'Post the digest?', 'STOP: dry run - digest not posted', 'Post the digest to Slack'] },
  ],
  scenarios: [
    {
      name: 'shipped config (sample digest, dry run)', start: 'Run manually',
      expect: { reached: ['Load sample standups', 'Write the digest message', 'STOP: dry run - digest not posted'], notReached: ['Read the standup answers'], outward: 'none' },
      check: out => {
        const d = out['Build the digest'][0];
        const f: string[] = [];
        if (d.posted.map((p: any) => p.name).join() !== 'Ana,Ben,Chloe') f.push(`Ana, Ben and Chloe posted, got ${d.posted.map((p: any) => p.name)}`);
        if (d.missing.map((p: any) => p.name).join() !== 'Dev,Esme') f.push('Dev and Esme are missing');
        if (d.blocked !== 2) f.push(`Ben and Chloe are blocked, Ana said n/a; got ${d.blocked}`);
        if (!d.posted.find((p: any) => p.name === 'Ben')?.repeat) f.push('Ben was blocked yesterday too');
        if (d.posted.find((p: any) => p.name === 'Chloe')?.today !== 'Write up findings and share') f.push('the later of Chloe\'s two rows should win');
        if (d.outsiders.join() !== 'guest@agency.example') f.push('guest is not on TEAM');
        if (!out['Write the digest message'][0].text.includes('Not in yet: <@U01DEV>, <@U01ESME>')) f.push('missing line');
        return f;
      },
    },
    {
      name: 'form submission saved live', start: 'Standup form',
      input: [{ 'Work email': 'Dev@northwind.example', 'What did you finish yesterday?': 'Billing export', 'What are you doing today?': 'Refunds API', 'Anything blocking you?': 'none', submittedAt: new Date().toISOString(), formMode: 'production' }],
      overrides: { STANDUP_SHEET_ID: '1SheetIdExample', DRY_RUN: false },
      mocks: { 'Append to Standups tab': (items: any[]) => items },
      expect: { reached: ['Read the standup answers', 'Append to Standups tab'], notReached: ['Build the digest'], outward: 'some' },
      check: out => {
        const r = out['Append to Standups tab'][0];
        return r?.email === 'dev@northwind.example' && r?.name === 'Dev' && /^\d{4}-\d{2}-\d{2}$/.test(r?.date) ? [] : [`row: ${JSON.stringify(r)}`];
      },
    },
    {
      name: 'digest live from the sheet', start: 'Every weekday at 10:30',
      overrides: { STANDUP_SHEET_ID: '1SheetIdExample', DRY_RUN: false, SLACK_CHANNEL_ID: 'C0STANDUP', TEAM: [{ email: 'kim@northwind.example', name: 'Kim', slack_id: 'U1KIM' }, { email: 'lou@northwind.example', name: 'Lou', slack_id: '' }] },
      mocks: {
        'Read Standups tab': [{ row_number: 2, date: localDate('Europe/Berlin'), email: 'kim@northwind.example', name: 'Kim', yesterday: 'Docs', today: 'Tests', blockers: 'Flaky CI', submitted_at: new Date().toISOString() }],
        'Post the digest to Slack': [{ ok: true, ts: '1700000000.0010' }],
      },
      expect: { reached: ['Read Standups tab', 'Post the digest to Slack'], notReached: ['Load sample standups'], outward: 'some' },
      check: out => {
        const t = out['Write the digest message'][0].text;
        return t.includes('<@U1KIM>: Flaky CI') && t.includes('Not in yet: Lou') ? [] : [`digest: ${t}`];
      },
    },
  ],
});
