import { defineSpec } from '../_kit/spec';
import { trigger, code, ifTrue, merge, stop, http, gmail } from '../_kit/n';

const cfg = (k: string) => `$('config').first().json.${k}`;

export default defineSpec({
  slug: 'interview-reminders-calendar',
  title: 'Send interview reminders to candidates from Google Calendar with Gmail',
  summary: 'Finds interview events on a Google Calendar 24 hours and 2 hours ahead, picks the external candidate from the attendees, pulls the meeting link or address, adds prep notes for the interview type and emails one reminder per step.',
  category: 'HR and people',
  description: {
    who: 'Recruiters and hiring managers who book interviews in Google Calendar and lose candidates to no-shows. Candidates get a short, specific reminder with the link and what to prepare, without anyone writing it.',
    how: [
      'Every hour it lists events on `CALENDAR_ID` that match `EVENT_KEYWORD` and start within the next 27 hours, or sample events until Calendar is connected.',
      'A reminder is due when an event starts inside an hour of a step in `REMINDERS` (24 hours and 2 hours by default) and that step was not sent for that event.',
      'The candidate is the attendee outside `COMPANY_DOMAINS` who has not declined. Cancelled events, internal-only events and events with no link or address are held back with a reason.',
      'The meeting link comes from Google Meet, conference data or a Zoom or Teams URL in the description. Prep notes come from `INTERVIEW_TYPES` by keyword in the title.',
    ],
    setup: [
      'Run it once as imported. It plans reminders for sample events and stops at `STOP: preview - nothing sent`.',
      'Add a Google Calendar credential to `Fetch interview events`, set `CALENDAR_ID` and `USE_CALENDAR = true`.',
      'Connect Gmail and list your email domains in `COMPANY_DOMAINS` so interviewers are never mistaken for candidates.',
      'Put your address in `TEST_EMAIL` to receive every reminder yourself, then set `TEST_RUN = false`.',
    ],
    requirements: ['A Google Calendar with interview events', 'A Gmail account'],
    customize: [
      '`REMINDERS` sets the steps, in hours before the start.',
      '`INTERVIEW_TYPES` maps title keywords to prep notes and what to bring.',
      '`EVENT_KEYWORD` limits the search to events with that word, for example Interview.',
    ],
  },
  config: {
    intro: ['USE_CALENDAR false -> SAMPLE events, so the run works before any credential exists.', 'Reminders already sent are remembered per event and step in workflow static data.'],
    consts: [
      { name: 'USE_CALENDAR', value: false, note: 'set true after adding the Google Calendar credential' },
      { name: 'CALENDAR_ID', value: 'primary', note: "calendar to read; 'primary' or a shared calendar id" },
      { name: 'EVENT_KEYWORD', value: 'Interview', note: 'only events whose text contains this word' },
      { name: 'COMPANY_DOMAINS', value: ['northwind.example'], note: 'attendees on these domains are interviewers, never candidates' },
      { name: 'REMINDERS', value: [{ hours: 24, label: 'tomorrow' }, { hours: 2, label: 'in 2 hours' }], note: 'reminder steps in hours before the start; each fires once per event' },
      { name: 'INTERVIEW_TYPES', value: {
        'phone screen': { prep: 'A 30-minute conversation about your background and what you are looking for.', bring: 'Nothing to prepare beyond questions you have for us.' },
        technical: { prep: 'A practical session with two engineers. You will share your screen and work through a small problem together.', bring: 'A laptop with your usual editor and a working microphone.' },
        onsite: { prep: 'You will meet 3 people across the team over about 2 hours, with a break.', bring: 'Photo ID for reception.' },
        final: { prep: 'A conversation with a founder about how you like to work and the first 90 days in the role.', bring: 'Any questions about the offer or the team.' },
      }, note: 'title keyword -> prep note and what to bring' },
      { name: 'RECRUITER_NAME', value: 'Maya at Northwind', note: 'sign-off on every reminder' },
      { name: 'DAILY_CAP', value: 40, note: 'hard ceiling on reminders per run' },
    ],
    safety: 'test_run',
  },
  nodes: [
    trigger.manual(),
    trigger.schedule('Every hour', '5 * * * *'),
    ifTrue('Calendar connected?', cfg('use_calendar')),
    http('Fetch interview events', {
      url: `={{ 'https://www.googleapis.com/calendar/v3/calendars/' + encodeURIComponent(${cfg('calendar_id')}) + '/events' }}`,
      auth: 'googleCalendarOAuth2Api',
      query: {
        timeMin: '={{ new Date().toISOString() }}',
        timeMax: `={{ new Date(Date.now() + (Math.max(...${cfg('reminders')}.map(r => r.hours)) + 3) * 36e5).toISOString() }}`,
        singleEvents: 'true', orderBy: 'startTime', maxResults: '250', q: `={{ ${cfg('event_keyword')} }}`,
      },
    }),
    code('Load sample events', `
// Used until USE_CALENDAR is true. Same shape as the Calendar events list, times relative to now.
const at = h => new Date(Date.now() + h * 36e5).toISOString();
const ev = (id, h, summary, attendees, extra = {}) => ({ id, status: 'confirmed', summary, start: { dateTime: at(h) }, end: { dateTime: at(h + 1) }, attendees, ...extra });
const cand = (email, name, rs = 'accepted') => ({ email, displayName: name, responseStatus: rs });
const staff = (email, name) => ({ email, displayName: name, responseStatus: 'accepted' });
return [{ json: { kind: 'calendar#events', items: [
  ev('evt_tech', 24.4, 'Technical interview: Jonas Berg', [staff('ravi@northwind.example', 'Ravi Shah'), staff('lucy@northwind.example', 'Lucy Grant'), cand('jonas.berg@mailbox.example', 'Jonas Berg')],
    { description: 'Join: https://us02web.zoom.us/j/81234567890?pwd=abc123 (passcode 4411)' }),
  ev('evt_screen', 23.7, 'Phone screen - Aisha Rahman (Interview)', [staff('maya@northwind.example', 'Maya Torres'), cand('aisha.r@mailbox.example', 'Aisha Rahman', 'needsAction')],
    { hangoutLink: 'https://meet.google.com/abc-defg-hij' }),
  ev('evt_onsite', 1.6, 'Onsite interview: Pedro Alves', [staff('maya@northwind.example', 'Maya Torres'), cand('pedro.alves@mailbox.example', 'Pedro Alves')],
    { location: 'Northwind, 4 Harbour Street, Lisbon' }),
  ev('evt_declined', 24.2, 'Final interview: Wen Li', [staff('ceo@northwind.example', 'Sara Holm'), cand('wen.li@mailbox.example', 'Wen Li', 'declined')], { hangoutLink: 'https://meet.google.com/xyz-abcd-efg' }),
  ev('evt_internal', 24.0, 'Interview debrief: backend role', [staff('ravi@northwind.example', 'Ravi Shah'), staff('maya@northwind.example', 'Maya Torres')], { hangoutLink: 'https://meet.google.com/int-erna-lll' }),
  ev('evt_nolink', 2.3, 'Interview: Omar Haddad', [staff('lucy@northwind.example', 'Lucy Grant'), cand('omar.h@mailbox.example', 'Omar Haddad')]),
  ev('evt_later', 10, 'Technical interview: Kim Park', [staff('ravi@northwind.example', 'Ravi Shah'), cand('kim.park@mailbox.example', 'Kim Park')], { hangoutLink: 'https://meet.google.com/kim-park-xyz' }),
  ev('evt_cancel', 24.5, 'Interview: Leo Marsh', [cand('leo.marsh@mailbox.example', 'Leo Marsh')], { status: 'cancelled' }),
] } }];`),
    merge('Combine event sources'),
    code('Pick reminders due', `
// A step is due when the event starts within 1 hour either side of the step's hours,
// so an hourly schedule catches every event once per step. Sent steps are remembered
// as eventId|hours, which also covers events moved inside the window.
const cfg = $('config').first().json;
const store = $getWorkflowStaticData('global');
const sent = store.sent || {};
const domains = cfg.company_domains.map(d => d.toLowerCase());
const external = a => !a.resource && !a.self && !domains.some(d => (a.email || '').toLowerCase().endsWith('@' + d));
const linkIn = s => (String(s || '').match(/https:\\/\\/[^\\s<>"]*(zoom\\.us\\/j|teams\\.microsoft\\.com\\/l\\/meetup-join|meet\\.google\\.com)[^\\s<>"]*/i) || [])[0] || '';
const due = [], held = [];
for (const page of $input.all()) for (const e of page.json.items || []) {
  const start = new Date(e.start?.dateTime || e.start?.date);
  const hoursTo = (start - Date.now()) / 36e5;
  const step = cfg.reminders.find(r => Math.abs(hoursTo - r.hours) <= 1);
  if (!step) continue;
  const name = e.summary || e.id;
  const key = e.id + '|' + step.hours;
  if (e.status === 'cancelled') { held.push({ event: name, reason: 'event cancelled' }); continue; }
  if (sent[key]) { held.push({ event: name, reason: 'step ' + step.label + ' already sent' }); continue; }
  const cands = (e.attendees || []).filter(external);
  if (!cands.length) { held.push({ event: name, reason: 'no external attendee' }); continue; }
  const link = e.hangoutLink || (e.conferenceData?.entryPoints || []).find(p => p.entryPointType === 'video')?.uri || linkIn(e.description) || linkIn(e.location);
  const where = link ? '' : (e.location || '');
  if (!link && !where) { held.push({ event: name, reason: 'no meeting link or address' }); continue; }
  const title = (e.summary || '').toLowerCase();
  const typeKey = Object.keys(cfg.interview_types).find(k => title.includes(k)) || '';
  const interviewers = (e.attendees || []).filter(a => !external(a) && !a.resource).map(a => a.displayName || a.email.split('@')[0]);
  for (const c of cands) {
    if (c.responseStatus === 'declined') { held.push({ event: name, reason: c.email + ' declined' }); continue; }
    due.push({ key, event_id: e.id, title: e.summary, step: step.label, hours: step.hours, start: start.toISOString(),
      candidate_email: c.email, candidate_name: c.displayName || '', link, where, type: typeKey, interviewers,
      unconfirmed: c.responseStatus === 'needsAction' });
  }
}
due.sort((a, b) => a.start.localeCompare(b.start));
for (const x of due.slice(cfg.daily_cap)) held.push({ event: x.title, reason: 'over DAILY_CAP, next run' });
return [{ json: { reminders: due.slice(0, cfg.daily_cap), held } }];`),
    code('Write each reminder', `
// Facts from the event, prep from INTERVIEW_TYPES. Times are shown in UTC with the date,
// because the candidate's time zone is not on the event.
const cfg = $('config').first().json;
const fmt = iso => new Date(iso).toUTCString().replace(/:00 GMT$/, ' UTC');
return $input.first().json.reminders.map(r => {
  const t = cfg.interview_types[r.type] || { prep: 'A conversation with the team about the role.', bring: 'Questions you have for us.' };
  const first = (r.candidate_name || '').split(' ')[0] || 'there';
  const body = [
    'Hi ' + first + ',', '',
    'A reminder that your interview is ' + r.step + ': ' + fmt(r.start) + '.',
    r.link ? 'Join here: ' + r.link : 'Address: ' + r.where,
    r.interviewers.length ? 'You will meet: ' + r.interviewers.join(', ') + '.' : '', '',
    t.prep, 'Please bring: ' + t.bring, '',
    r.unconfirmed ? 'You have not accepted the calendar invite yet. Reply to this email if the time no longer works.' : 'If the time no longer works, reply to this email and we will find another slot.', '',
    cfg.recruiter_name,
  ].filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\\n');
  return { json: { ...r, subject: 'Your interview ' + r.step + ': ' + r.title, body, send_to: cfg.mode === 'test' ? cfg.test_email : r.candidate_email } };
});`),
    ifTrue('Sending switched on?', cfg('sends_enabled')),
    stop('STOP: preview - nothing sent'),
    gmail.send('Email the reminder', { to: '$json.send_to', subject: "($('config').first().json.mode === 'test' ? '[TEST to ' + $json.candidate_email + '] ' : '') + $json.subject", message: '$json.body' }),
    ifTrue('Live run?', cfg('live')),
    stop('STOP: test send - steps not recorded'),
    code('Remember sent steps', `
// Live only, so test sends can be repeated. Keys older than 3 days are dropped.
const store = $getWorkflowStaticData('global');
const sent = store.sent || {};
for (const r of $('Write each reminder').all()) sent[r.json.key] = Date.now();
for (const [k, t] of Object.entries(sent)) if (Date.now() - t > 3 * 864e5) delete sent[k];
store.sent = sent;
return [{ json: { remembered: Object.keys(sent).length } }];`),
  ],
  edges: [
    ['Run manually', 'config'], ['Every hour', 'config'],
    ['config', 'Calendar connected?'],
    ['Calendar connected?', 0, 'Fetch interview events'], ['Calendar connected?', 1, 'Load sample events'],
    ['Fetch interview events', 'Combine event sources'], ['Load sample events', 0, 'Combine event sources', 1],
    ['Combine event sources', 'Pick reminders due'],
    ['Pick reminders due', 'Write each reminder'],
    ['Write each reminder', 'Sending switched on?'],
    ['Sending switched on?', 0, 'Email the reminder'], ['Sending switched on?', 1, 'STOP: preview - nothing sent'],
    ['Email the reminder', 'Live run?'],
    ['Live run?', 0, 'Remember sent steps'], ['Live run?', 1, 'STOP: test send - steps not recorded'],
  ],
  groups: [
    { title: 'Start and settings', why: 'Runs at 5 past every hour or by hand. The reminder steps, company domains and prep notes live in `config`, so adding a 1-hour nudge is one more line in `REMINDERS`.', nodes: ['Run manually', 'Every hour', 'config'] },
    { title: 'Read upcoming interviews', why: '`Fetch interview events` expands recurring events and filters on `EVENT_KEYWORD` server side. `Load sample events` returns the same events-list shape, so the parser in the next step is exercised either way.', nodes: ['Calendar connected?', 'Fetch interview events', 'Load sample events', 'Combine event sources'] },
    { title: 'Find the candidate and the link', why: 'The candidate is whoever is outside `COMPANY_DOMAINS`, so interviewers never get the reminder. Events with no link or address are held instead of sending a reminder that cannot be acted on.', nodes: ['Pick reminders due', 'Write each reminder'] },
    { title: 'Send and remember', why: 'In test mode reminders go to `TEST_EMAIL` and nothing is recorded, so you can repeat the test. A live send records the event and step, which is what stops the next hourly run from sending it again.', nodes: ['Sending switched on?', 'STOP: preview - nothing sent', 'Email the reminder', 'Live run?', 'STOP: test send - steps not recorded', 'Remember sent steps'] },
  ],
  scenarios: [
    {
      name: 'shipped config (sample events, preview)', start: 'Run manually',
      expect: { reached: ['Load sample events', 'STOP: preview - nothing sent'], outward: 'none' },
      check: out => {
        const p = out['Pick reminders due'][0];
        const f: string[] = [];
        const ids = p.reminders.map((r: any) => r.event_id).sort().join();
        if (ids !== 'evt_onsite,evt_screen,evt_tech') f.push(`expected tech, screen and onsite reminders, got ${ids}`);
        const tech = p.reminders.find((r: any) => r.event_id === 'evt_tech');
        if (!tech?.link.startsWith('https://us02web.zoom.us/j/81234567890')) f.push(`zoom link not pulled from the description: ${tech?.link}`);
        if (tech?.interviewers.join() !== 'Ravi Shah,Lucy Grant') f.push('interviewers should be the two staff attendees');
        const onsite = p.reminders.find((r: any) => r.event_id === 'evt_onsite');
        if (onsite?.hours !== 2 || !onsite?.where.includes('Harbour Street')) f.push('onsite should be on the 2-hour step with an address');
        const reasons = p.held.map((h: any) => h.reason).join('|');
        for (const r of ['declined', 'no external attendee', 'no meeting link or address', 'event cancelled']) if (!reasons.includes(r)) f.push(`missing held reason: ${r}`);
        if (p.reminders.some((r: any) => r.event_id === 'evt_later')) f.push('event 10 hours out matches no step');
        const screen = out['Write each reminder'].find((r: any) => r.event_id === 'evt_screen');
        if (!screen?.body.includes('not accepted the calendar invite')) f.push('unconfirmed candidate should be asked to confirm');
        return f;
      },
    },
    {
      name: 'live with Calendar', start: 'Every hour',
      overrides: { USE_CALENDAR: true, TEST_RUN: false },
      mocks: {
        'Fetch interview events': [{ kind: 'calendar#events', items: [
          { id: 'g1', status: 'confirmed', summary: 'Final interview with Nadia Popescu', start: { dateTime: new Date(Date.now() + 24.3 * 36e5).toISOString() },
            attendees: [{ email: 'maya@northwind.example', displayName: 'Maya Torres', responseStatus: 'accepted', self: true }, { email: 'room-2@resource.calendar.google.com', resource: true }, { email: 'nadia.p@mailbox.example', displayName: 'Nadia Popescu', responseStatus: 'accepted' }],
            conferenceData: { entryPoints: [{ entryPointType: 'video', uri: 'https://meet.google.com/fin-alin-ter' }, { entryPointType: 'phone', uri: 'tel:+1-555-0100' }] } },
        ] }],
        'Email the reminder': [{ id: 'msg_1', labelIds: ['SENT'] }],
      },
      expect: { reached: ['Email the reminder', 'Remember sent steps'], notReached: ['Load sample events'], outward: 'some' },
      check: out => {
        const r = out['Write each reminder'][0];
        const f: string[] = [];
        if (r?.send_to !== 'nadia.p@mailbox.example') f.push('reminder should go to the candidate, not the room or Maya');
        if (r?.link !== 'https://meet.google.com/fin-alin-ter') f.push('video entry point should be the link');
        if (!r?.body.includes('a founder')) f.push('final interview prep note missing');
        return f;
      },
    },
  ],
});
