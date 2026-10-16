import { defineSpec } from '../_kit/spec';
import { trigger, code, ifTrue, ifWhen, merge, stop, splitOut, sheets, gmail } from '../_kit/n';

const cfg = (k: string) => `$('config').first().json.${k}`;

export default defineSpec({
  slug: 'webinar-registration-reminders',
  title: 'Send webinar reminders and replay emails from registrations in Google Sheets',
  summary: 'Every 15 minutes, works out which registrants in a Google Sheets tab are due a 24-hour reminder, a 1-hour reminder, or after the event a replay (no-shows) or thank-you (attendees) email, sends each once through Gmail and stamps the sent column.',
  category: 'Marketing and content',
  description: {
    who: 'Marketers and founders who run webinars with a registration form that writes to Google Sheets, and who would rather not pay for a webinar tool just for reminder emails.',
    how: [
      'Every 15 minutes it reads the Registrants tab, or sample registrations for three sample events until the sheet is connected.',
      'For each registrant and event it picks at most one email: the 24-hour reminder (24 to 2 hours before), the 1-hour reminder (the last hour), or after the event a replay email for no-shows and a thank-you for attendees.',
      'A filled sent column, an opt-out, a bad email or a sign-up less than an hour old holds the email back with a reason. At most 150 emails go out per run.',
      'Each email goes out through Gmail and the matching sent column is stamped with the time, so nothing is sent twice.',
    ],
    setup: [
      'Run it once as imported. It works through the sample events and stops at `STOP: preview - nothing sent`.',
      'Add your webinar to `EVENTS` with its id, start time (ISO, with timezone), length, join link and replay link.',
      'Connect Google Sheets and set `REGISTRANTS_SHEET_ID`. The tab needs id, event_id, email, name, registered_at, attended, opted_out, reminder_24h_sent, reminder_1h_sent and replay_sent.',
      'Put your address in `TEST_EMAIL` to receive every email yourself, then set `TEST_RUN = false`.',
    ],
    requirements: ['A Google Sheet of registrations', 'A Gmail account'],
    customize: [
      '`REPLAY_DELAY_HOURS` sets how long after the end the replay goes out.',
      '`SEND_THANKS` false skips the attendee thank-you.',
      '`MAX_PER_RUN` limits how many emails one run can send.',
    ],
  },
  config: {
    intro: ['REGISTRANTS_SHEET_ID blank -> SAMPLE registrations for three SAMPLE events.', 'Sent columns are stamped only on a live run.'],
    consts: [
      { name: 'REGISTRANTS_SHEET_ID', value: '', note: 'Google Sheets id with a Registrants tab; blank uses the sample' },
      { name: 'EVENTS', value: [{ id: 'nov-demo', title: 'Live demo: expense approvals in 15 minutes', start: '2026-11-05T16:00:00Z', duration_min: 45,
        join_url: 'https://meet.yourcompany.example/nov-demo', replay_url: 'https://www.yourcompany.example/webinars/nov-demo' }], note: 'webinars: id matches the event_id column; start is ISO with timezone' },
      { name: 'REPLAY_DELAY_HOURS', value: 2, note: 'hours after the end before replay and thank-you emails go out' },
      { name: 'REPLAY_WINDOW_DAYS', value: 7, note: 'replay emails stop this many days after the event' },
      { name: 'SEND_THANKS', value: true, note: 'attendees get a thank-you with the replay link' },
      { name: 'MAX_PER_RUN', value: 150, note: 'hard ceiling on emails per run' },
      { name: 'HOST_NAME', value: 'The Tallyroom team', note: 'sign-off on every email' },
    ],
    flags: { sheet_enabled: "REGISTRANTS_SHEET_ID.trim() !== ''" },
    safety: 'test_run',
  },
  nodes: [
    trigger.manual(),
    trigger.schedule('Every 15 minutes', '*/15 * * * *'),
    ifTrue('Registrants sheet set?', cfg('sheet_enabled')),
    sheets.read('Read registrants', cfg('registrants_sheet_id'), 'Registrants'),
    code('Attach the event schedule', `
// Sheet rows + EVENTS from config, in the shape the picker reads.
return [{ json: { events: $('config').first().json.events, registrants: $input.all().map(i => i.json).filter(r => r.email) } }];`),
    code('Load sample registrations', `
// Used until REGISTRANTS_SHEET_ID is set. Three sample events placed around now so
// every email type is due: one tomorrow, one within the hour, one that just ended.
const at = h => new Date(Date.now() + h * 3600e3).toISOString();
const events = [
  { id: 'ev-tomorrow', title: 'Expense policies that people follow', start: at(20), duration_min: 45, join_url: 'https://meet.yourcompany.example/ev1', replay_url: 'https://www.yourcompany.example/webinars/ev1' },
  { id: 'ev-soon', title: 'Month-end close in one afternoon', start: at(0.6), duration_min: 30, join_url: 'https://meet.yourcompany.example/ev2', replay_url: 'https://www.yourcompany.example/webinars/ev2' },
  { id: 'ev-done', title: 'Receipts without the shoebox', start: at(-4), duration_min: 60, join_url: 'https://meet.yourcompany.example/ev3', replay_url: 'https://www.yourcompany.example/webinars/ev3' },
];
const r = (id, event_id, name, email, regH, extra = {}) => ({ id, event_id, name, email, registered_at: at(regH), attended: '', opted_out: '', reminder_24h_sent: '', reminder_1h_sent: '', replay_sent: '', ...extra });
const registrants = [
  r('R1', 'ev-tomorrow', 'Alma Price', 'alma@northwind-labs.example', -72),
  r('R2', 'ev-tomorrow', 'Ben Cho', 'ben@harbourdesign.example', -0.3),
  r('R3', 'ev-tomorrow', 'Cora Diaz', 'cora@pineco.example', -50, { reminder_24h_sent: at(-1) }),
  r('R4', 'ev-soon', 'Dev Patel', 'dev@lumenphysio.example', -30),
  r('R5', 'ev-soon', 'Eli Grant', 'eli@orchardlane.example', -30, { reminder_1h_sent: at(-0.1) }),
  r('R6', 'ev-done', 'Fay Moss', 'fay@northfield.example', -100, { attended: 'FALSE' }),
  r('R7', 'ev-done', 'Gus Lind', 'gus@harbour-dental.example', -100, { attended: 'TRUE' }),
  r('R8', 'ev-done', 'Hana Ito', 'hana@studio.example', -100, { replay_sent: at(-0.5) }),
  r('R9', 'ev-tomorrow', 'Ivo Kerr', 'ivo@mailbox.example', -60, { opted_out: 'yes' }),
  r('R10', 'ev-tomorrow', 'Jo Park', 'jo-at-inbox.example', -60),
];
return [{ json: { events, registrants } }];`),
    merge('Combine registration sources'),
    code('Pick emails due now', `
// At most one email per registrant per run. The stage comes from where "now"
// sits relative to the event; the matching sent column must be empty.
const cfg = $('config').first().json;
const { events, registrants } = $input.first().json;
const byId = Object.fromEntries(events.map(e => [e.id, e]));
const truthy = v => ['true', 'yes', '1', 'y', 'x'].includes(String(v).trim().toLowerCase());
const now = Date.now();
const due = [], held = [];
for (const r of registrants) {
  const ev = byId[r.event_id];
  const who = r.name || r.email;
  if (!ev) { held.push({ who, reason: 'unknown event_id ' + r.event_id }); continue; }
  const start = new Date(ev.start).getTime(), end = start + ev.duration_min * 60e3;
  const toStart = (start - now) / 3600e3, sinceEnd = (now - end) / 3600e3;
  let stage = null, column = null;
  if (toStart <= 24 && toStart > 2) { stage = 'reminder_24h'; column = 'reminder_24h_sent'; }
  else if (toStart <= 1 && toStart > 0) { stage = 'reminder_1h'; column = 'reminder_1h_sent'; }
  else if (sinceEnd >= cfg.replay_delay_hours && sinceEnd <= cfg.replay_window_days * 24) { stage = truthy(r.attended) ? 'thanks' : 'replay'; column = 'replay_sent'; }
  if (!stage) continue;
  const reason =
    truthy(r.opted_out) ? 'opted out' :
    !/^[^\\s@]+@[^\\s@]+\\.[a-z]{2,}$/i.test(String(r.email).trim()) ? 'invalid email' :
    String(r[column] || '').trim() ? column + ' already filled' :
    stage === 'thanks' && !cfg.send_thanks ? 'SEND_THANKS is off' :
    stage.startsWith('reminder') && (now - new Date(r.registered_at).getTime()) < 3600e3 ? 'registered under an hour ago' : '';
  if (reason) { held.push({ who, stage, reason }); continue; }
  due.push({ id: r.id, name: r.name, email: String(r.email).trim(), stage, column, event: ev });
}
for (const d of due.slice(cfg.max_per_run)) held.push({ who: d.name, stage: d.stage, reason: 'over MAX_PER_RUN, next run' });
return [{ json: { emails: due.slice(0, cfg.max_per_run), held } }];`),
    ifWhen('Any emails due?', [['$json.emails.length', 'gt', 0]]),
    stop('STOP: nothing due right now'),
    splitOut('One item per email', 'emails'),
    code('Write each email', `
// Wording per stage. Times are shown in UTC with the date, so nobody misreads a time zone.
const cfg = $('config').first().json;
const when = iso => new Date(iso).toUTCString().replace(':00 GMT', ' UTC');
return $input.all().map(({ json: e }) => {
  const first = (e.name || '').split(' ')[0] || 'there';
  const ev = e.event;
  const copy = {
    reminder_24h: ['Tomorrow: ' + ev.title, 'A reminder that "' + ev.title + '" starts ' + when(ev.start) + ' and runs ' + ev.duration_min + ' minutes.\\n\\nJoin here: ' + ev.join_url + '\\n\\nBring a question; the last 10 minutes are open Q&A.'],
    reminder_1h: ['Starting in an hour: ' + ev.title, '"' + ev.title + '" starts at ' + when(ev.start) + '.\\n\\nJoin link: ' + ev.join_url],
    replay: ['The replay of ' + ev.title + ' is ready', 'Sorry we missed you. The full recording is here: ' + ev.replay_url + '\\n\\nIt is ' + ev.duration_min + ' minutes, and the chapters let you jump to the part you need.'],
    thanks: ['Thanks for joining ' + ev.title, 'Thanks for coming. The recording and slides are here if you want to look back: ' + ev.replay_url],
  }[e.stage];
  return { json: { ...e, subject: copy[0], body: 'Hi ' + first + ',\\n\\n' + copy[1] + '\\n\\n' + cfg.host_name, send_to: cfg.mode === 'test' ? cfg.test_email : e.email } };
});`),
    ifTrue('Sending switched on?', cfg('sends_enabled')),
    stop('STOP: preview - nothing sent'),
    gmail.send('Email the registrant', { to: '$json.send_to', subject: "($('config').first().json.mode === 'test' ? '[TEST to ' + $json.email + '] ' : '') + $json.subject", message: '$json.body' }),
    ifWhen('Live with a sheet?', [[cfg('live'), 'true'], [cfg('sheet_enabled'), 'true']]),
    stop('STOP: test send - sheet untouched'),
    code('Stamp the sent column', `
// One update per sent email: the row id and the stage's column set to now.
const sent = $('Write each email').all();
const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
return $input.all().map((_, i) => ({ json: { id: sent[i].json.id, [sent[i].json.column]: stamp } }));`),
    sheets.update('Mark sent in the sheet', cfg('registrants_sheet_id'), 'Registrants', 'id'),
  ],
  edges: [
    ['Run manually', 'config'], ['Every 15 minutes', 'config'],
    ['config', 'Registrants sheet set?'],
    ['Registrants sheet set?', 0, 'Read registrants'], ['Registrants sheet set?', 1, 'Load sample registrations'],
    ['Read registrants', 'Attach the event schedule'],
    ['Attach the event schedule', 'Combine registration sources'], ['Load sample registrations', 0, 'Combine registration sources', 1],
    ['Combine registration sources', 'Pick emails due now'],
    ['Pick emails due now', 'Any emails due?'],
    ['Any emails due?', 0, 'One item per email'], ['Any emails due?', 1, 'STOP: nothing due right now'],
    ['One item per email', 'Write each email'],
    ['Write each email', 'Sending switched on?'],
    ['Sending switched on?', 0, 'Email the registrant'], ['Sending switched on?', 1, 'STOP: preview - nothing sent'],
    ['Email the registrant', 'Live with a sheet?'],
    ['Live with a sheet?', 0, 'Stamp the sent column'], ['Live with a sheet?', 1, 'STOP: test send - sheet untouched'],
    ['Stamp the sent column', 'Mark sent in the sheet'],
  ],
  groups: [
    { title: 'Start and settings', why: 'Runs every 15 minutes, which is tight enough for the 1-hour reminder. Events, delays and the per-run cap are constants in `config`.', nodes: ['Run manually', 'Every 15 minutes', 'config'] },
    { title: 'Read registrations', why: 'Registrations come from the sheet your form already writes to. `Load sample registrations` brings its own three events placed around the current time, so every email type shows up in a preview.', nodes: ['Registrants sheet set?', 'Read registrants', 'Attach the event schedule', 'Load sample registrations', 'Combine registration sources'] },
    { title: 'Decide who gets what', why: 'Stages are time windows, not exact times, so a run that is late by 10 minutes still sends. The sent column is the only memory, which makes the sheet the record of what went out.', nodes: ['Pick emails due now', 'Any emails due?', 'STOP: nothing due right now', 'One item per email', 'Write each email'] },
    { title: 'Send and stamp', why: 'Nothing is sent in preview, and a test send goes to `TEST_EMAIL` without touching the sheet. Only a live send stamps the column, which is what stops the next run from repeating it.', nodes: ['Sending switched on?', 'STOP: preview - nothing sent', 'Email the registrant', 'Live with a sheet?', 'STOP: test send - sheet untouched', 'Stamp the sent column', 'Mark sent in the sheet'] },
  ],
  scenarios: [
    {
      name: 'shipped config (preview)', start: 'Run manually',
      expect: { reached: ['Load sample registrations', 'STOP: preview - nothing sent'], notReached: ['Email the registrant'], outward: 'none' },
      check: out => {
        const f: string[] = [];
        const p = out['Pick emails due now'][0];
        const got = p.emails.map((e: any) => e.id + ':' + e.stage).sort().join();
        if (got !== 'R1:reminder_24h,R4:reminder_1h,R6:replay,R7:thanks') f.push(`emails wrong: ${got}`);
        const reasons = p.held.map((h: any) => h.reason);
        for (const r of ['registered under an hour ago', 'reminder_24h_sent already filled', 'reminder_1h_sent already filled', 'replay_sent already filled', 'opted out', 'invalid email'])
          if (!reasons.includes(r)) f.push(`missing held reason: ${r}`);
        return f;
      },
    },
    {
      name: 'test send to TEST_EMAIL', start: 'Run manually', overrides: { TEST_EMAIL: 'you@example.com' },
      mocks: { 'Email the registrant': (items: any[]) => items.map(() => ({ id: 'msg', labelIds: ['SENT'] })) },
      expect: { reached: ['Email the registrant', 'STOP: test send - sheet untouched'], notReached: ['Mark sent in the sheet'], outward: 'some' },
      check: out => out['Write each email'].every((e: any) => e.send_to === 'you@example.com') ? [] : ['test sends not redirected'],
    },
    {
      name: 'live with the sheet', start: 'Every 15 minutes',
      overrides: { REGISTRANTS_SHEET_ID: '1RegSheet', TEST_RUN: false,
        EVENTS: [{ id: 'live-ev', title: 'Q&A hour', start: new Date(Date.now() + 30 * 60e3).toISOString(), duration_min: 60, join_url: 'https://meet.example/q', replay_url: 'https://www.example.com/r' }] },
      mocks: {
        'Read registrants': [{ id: 'L1', event_id: 'live-ev', name: 'Kai Lee', email: 'kai@mailbox.example', registered_at: new Date(Date.now() - 864e5).toISOString(), attended: '', opted_out: '', reminder_24h_sent: '', reminder_1h_sent: '', replay_sent: '' }],
        'Email the registrant': [{ id: 'msg-9', labelIds: ['SENT'] }],
        'Mark sent in the sheet': (items: any[]) => items,
      },
      expect: { reached: ['Email the registrant', 'Mark sent in the sheet'], outward: 'some' },
      check: out => {
        const u = out['Stamp the sent column'][0];
        return u?.id === 'L1' && u.reminder_1h_sent ? [] : [`expected reminder_1h_sent stamped on L1: ${JSON.stringify(u)}`];
      },
    },
  ],
});
