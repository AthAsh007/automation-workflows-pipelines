import { defineSpec } from '../_kit/spec';
import { trigger, code, ifTrue, merge, stop, http, twilio } from '../_kit/n';

const cfg = (k: string) => `$('config').first().json.${k}`;

export default defineSpec({
  slug: 'appointment-sms-reminders',
  title: 'Send 24-hour and 2-hour appointment reminders from Google Calendar via Twilio SMS',
  summary: 'Every 15 minutes reads the next 26 hours of a Google Calendar, finds appointments due a 24-hour or 2-hour reminder, pulls and normalises each customer phone number to E.164, respects quiet hours and an opt-out list, and texts each reminder once.',
  category: 'Local business and services',
  description: {
    who: 'Clinics, salons, tutors and repair shops that book clients into a Google Calendar and lose hours each week to no-shows. Each client gets a text the day before and again two hours before.',
    how: [
      'Every 15 minutes it reads appointments starting in the next 26 hours, or 8 sample appointments until Google Calendar is connected.',
      'Cancelled events, all-day events and blocks like Lunch are skipped. The phone number is read from a "Phone:" line in the description or from an attendee name, then normalised to E.164.',
      'An appointment 2.5 to 24 hours away is due its 24-hour reminder, one 15 minutes to 2 hours away its 2-hour reminder. Each reminder is sent once; the event id, start time and type are remembered in workflow static data.',
      'Numbers on `OPT_OUT_NUMBERS` and events marked "no sms" are skipped. During quiet hours (21:00 to 08:00 by default) reminders wait for the next run.',
    ],
    setup: [
      'Run it once as imported. It previews against sample appointments and stops at `STOP: preview - nothing sent`.',
      'Add a Google Calendar credential to `Fetch upcoming events from Google Calendar`, set `CALENDAR_ID` and set `USE_GOOGLE_CALENDAR = true`.',
      'Add a Twilio credential to `Text the reminder with Twilio` and set `TWILIO_FROM` to your Twilio number.',
      'For a test, set `TEST_EMAIL` to any address and `TEST_PHONE` to your own mobile: every text goes to you. Set `TEST_RUN = false` to text customers.',
    ],
    requirements: ['A Google Calendar with client appointments', 'A Twilio account with an SMS-capable number'],
    customize: [
      '`BUSINESS_NAME`, `CONTACT_PHONE` and `TIMEZONE` fill in the text message.',
      '`QUIET_START_HOUR` and `QUIET_END_HOUR` set when no texts go out.',
      '`DEFAULT_COUNTRY_CODE` decides how local numbers without a + are read.',
    ],
  },
  config: {
    intro: ['USE_GOOGLE_CALENDAR false -> SAMPLE appointments so the run works before any credential exists.', 'Test mode (TEST_RUN true + TEST_EMAIL set) texts TEST_PHONE instead of the customer.'],
    consts: [
      { name: 'USE_GOOGLE_CALENDAR', value: false, note: 'set true after adding the Google Calendar credential' },
      { name: 'CALENDAR_ID', value: 'primary', note: "calendar id; 'primary' is the connected account's main calendar" },
      { name: 'TIMEZONE', value: 'America/New_York', note: 'IANA timezone for quiet hours and the time shown in the text' },
      { name: 'BUSINESS_NAME', value: 'Lumen Physio', note: 'shown in every text' },
      { name: 'CONTACT_PHONE', value: '(212) 555-0100', note: 'number clients call to reschedule' },
      { name: 'TWILIO_FROM', value: '', note: 'your Twilio sending number in E.164, e.g. +15555550100' },
      { name: 'DEFAULT_COUNTRY_CODE', value: '1', note: 'country code added to numbers written without + (1 = US/Canada)' },
      { name: 'QUIET_START_HOUR', value: 21, note: 'no texts from this hour (24h clock, TIMEZONE)' },
      { name: 'QUIET_END_HOUR', value: 8, note: 'texts resume at this hour' },
      { name: 'SKIP_TITLE_WORDS', value: ['lunch', 'block', 'busy', 'admin'], note: 'events whose title contains one of these are not appointments' },
      { name: 'OPT_OUT_NUMBERS', value: ['+12125550177'], note: 'E.164 numbers that replied STOP or asked not to be texted' },
      { name: 'MAX_SMS_PER_RUN', value: 30, note: 'hard ceiling on texts per run' },
      { name: 'TEST_PHONE', value: '', note: 'test mode texts this number instead of the customer; ships blank' },
    ],
    safety: 'test_run',
  },
  nodes: [
    trigger.manual(),
    trigger.schedule('Every 15 minutes', '*/15 * * * *'),
    ifTrue('Google Calendar connected?', cfg('use_google_calendar')),
    http('Fetch upcoming events from Google Calendar', {
      url: `={{ 'https://www.googleapis.com/calendar/v3/calendars/' + encodeURIComponent(${cfg('calendar_id')}) + '/events' }}`, auth: 'googleCalendarOAuth2Api',
      query: { timeMin: '={{ new Date().toISOString() }}', timeMax: '={{ new Date(Date.now() + 26 * 36e5).toISOString() }}', singleEvents: 'true', orderBy: 'startTime', maxResults: '250', showDeleted: 'false' },
    }),
    code('Load sample appointments', `
// Used until USE_GOOGLE_CALENDAR is true. Same shape as the events.list response.
const at = h => ({ dateTime: new Date(Date.now() + h * 36e5).toISOString() });
const ev = (id, summary, h, description, extra = {}) => ({ id, status: 'confirmed', summary, description, start: at(h), end: at(h + 1), ...extra });
return [{ json: { items: [
  ev('evt1', 'Physio assessment - Sam Patel', 23.5, 'Client: Sam Patel\\nPhone: (212) 555-0142'),
  ev('evt2', 'Follow-up - Rosa Diaz', 1.5, 'Returning client', { attendees: [{ email: 'rosa@mail.example', displayName: 'Rosa Diaz 646-555-0119' }] }),
  ev('evt3', 'Sports massage - Ken Ito', 25, 'Phone: 212 555 0165'),
  ev('evt4', 'Initial consult - Mia Novak', 23, 'Booked by phone, number not taken'),
  ev('evt5', 'Physio review - Joel Grant', 20, 'Phone: 212-555-0177'),
  ev('evt6', 'Rehab session - Ana Ruiz', 22, 'Phone: 212-555-0188', { status: 'cancelled' }),
  { id: 'evt7', status: 'confirmed', summary: 'Clinic training day', start: { date: new Date().toISOString().slice(0, 10) }, end: { date: new Date().toISOString().slice(0, 10) } },
  ev('evt8', 'Lunch', 22, ''),
  ev('evt9', 'Pilates 1:1 - Lee Chen', 1, 'Phone: +1 (917) 555-0123\\nno sms please, prefers email'),
] } }];`),
    merge('Combine event sources'),
    code('Pick reminders due now', `
// Which reminder is due depends only on hours until the start:
//   24h reminder: 2.5h < start <= 24h      2h reminder: 0.25h < start <= 2h
// Each (event, start, type) is sent once; keys live in workflow static data.
const cfg = $('config').first().json;
const sent = $getWorkflowStaticData('global').sms_sent || {};
const now = Date.now();
const tz = cfg.timezone;
const hourNow = Number(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', hourCycle: 'h23' }).format(new Date(now))) % 24;
const quiet = cfg.quiet_start_hour > cfg.quiet_end_hour
  ? hourNow >= cfg.quiet_start_hour || hourNow < cfg.quiet_end_hour
  : hourNow >= cfg.quiet_start_hour && hourNow < cfg.quiet_end_hour;
const ymd = t => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(t));
const toE164 = raw => {
  if (!raw) return '';
  let s = String(raw).trim().replace(/[^\\d+]/g, '');
  if (s.startsWith('00')) s = '+' + s.slice(2);
  if (!s.startsWith('+')) {
    // North American numbers are 10 digits (or 11 with the leading 1); elsewhere a
    // single trunk 0 is dropped before the country code is added.
    const cc = String(cfg.default_country_code);
    if (cc === '1') s = s.length === 10 ? '+1' + s : s.length === 11 && s.startsWith('1') ? '+' + s : '';
    else s = '+' + cc + s.replace(/^0/, '');
  }
  return /^\\+[1-9]\\d{7,14}$/.test(s) && !(s.startsWith('+1') && s.length !== 12) ? s : '';
};
const findPhone = e => {
  const m = (e.description || '').match(/(?:phone|tel|mobile|cell)\\s*[:#]?\\s*([+()\\d][\\d ()+.-]{6,}\\d)/i);
  if (m) return m[1];
  for (const a of e.attendees || []) { const d = (a.displayName || '').match(/([+(]?\\d[\\d ()+.-]{6,}\\d)/); if (d) return d[1]; }
  return '';
};
const due = [], held = [];
let looked = 0;
for (const { json } of $input.all()) for (const e of json.items || []) {
  looked++;
  const title = e.summary || '';
  if (e.status === 'cancelled') continue;
  if (!e.start?.dateTime) continue;
  if (cfg.skip_title_words.some(w => title.toLowerCase().includes(w))) continue;
  const start = new Date(e.start.dateTime).getTime();
  const hours = (start - now) / 36e5;
  const type = hours > 2.5 && hours <= 24 ? '24h' : hours > 0.25 && hours <= 2 ? '2h' : '';
  if (!type) { held.push({ event: title, reason: 'no reminder due yet (' + hours.toFixed(1) + 'h away)' }); continue; }
  const key = e.id + '|' + e.start.dateTime + '|' + type;
  if (sent[key]) continue;
  const phone = toE164(findPhone(e));
  const client = (title.split(' - ')[1] || '').trim();
  const reason = !phone ? 'no valid phone number' :
    /no sms|no text/i.test(e.description || '') ? 'marked no sms' :
    cfg.opt_out_numbers.includes(phone) ? 'on OPT_OUT_NUMBERS' :
    quiet ? 'quiet hours, next run after ' + cfg.quiet_end_hour + ':00' : '';
  if (reason) { held.push({ event: title, reason }); continue; }
  const when = ymd(start) === ymd(now) ? 'today' : 'tomorrow';
  const time = new Date(start).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz });
  const service = title.split(' - ')[0];
  const text = 'Hi ' + (client.split(' ')[0] || 'there') + ', a reminder of your ' + service + ' at ' + cfg.business_name + ' ' + when + ' at ' + time +
    '. To reschedule call ' + cfg.contact_phone + '. Reply STOP to opt out.';
  due.push({ key, event_id: e.id, client, phone, type, hours: Number(hours.toFixed(2)), text, segments: Math.ceil(text.length / 153) || 1,
    send_to: cfg.mode === 'test' ? cfg.test_phone : phone });
}
due.sort((a, b) => a.hours - b.hours);
const ready = due.filter(d => d.send_to);
for (const d of due.filter(d => !d.send_to)) held.push({ event: d.client, reason: 'test mode needs TEST_PHONE' });
for (const d of ready.slice(cfg.max_sms_per_run)) held.push({ event: d.client, reason: 'over MAX_SMS_PER_RUN, next run' });
return [{ json: { reminders: ready.slice(0, cfg.max_sms_per_run), held, quiet, looked } }];`),
    code('Split into text messages', `
// One item per text so each Twilio call and its sent marker line up by index.
return $input.first().json.reminders.map(json => ({ json }));`),
    code('Summarise the run', `
// Execution log line: what was texted and what was held back.
const cfg = $('config').first().json;
const r = $input.first().json;
const text = [
  'Appointment reminders (' + cfg.mode + '): ' + r.looked + ' events read, ' + r.reminders.length + ' text(s)' + (r.quiet ? ', quiet hours' : '') + '.',
  ...r.reminders.map(x => '- ' + x.type + ' to ' + x.client + ' (' + x.hours + 'h before)'),
  ...r.held.map(h => '- held ' + h.event + ': ' + h.reason),
].join('\\n');
return [{ json: { text, sent: r.reminders.length, held: r.held.length } }];`),
    ifTrue('Sending switched on?', cfg('sends_enabled')),
    stop('STOP: preview - nothing sent'),
    twilio.send('Text the reminder with Twilio', { from: cfg('twilio_from'), to: '$json.send_to', message: "($('config').first().json.mode === 'test' ? '[TEST for ' + $json.phone + '] ' : '') + $json.text" }),
    ifTrue('Live run?', cfg('live')),
    stop('STOP: test send - nothing remembered'),
    code('Remember sent reminders', `
// Store the key of every text Twilio accepted, so the next run never repeats it.
// Keys older than 3 days are pruned.
const memory = $getWorkflowStaticData('global');
const sent = memory.sms_sent || {};
for (const k of Object.keys(sent)) if (sent[k] < Date.now() - 3 * 864e5) delete sent[k];
const msgs = $('Split into text messages').all();
$input.all().forEach((res, i) => { if (res.json.sid && msgs[i]) sent[msgs[i].json.key] = Date.now(); });
memory.sms_sent = sent;
return [{ json: { remembered: Object.keys(sent).length } }];`),
  ],
  edges: [
    ['Run manually', 'config'], ['Every 15 minutes', 'config'],
    ['config', 'Google Calendar connected?'],
    ['Google Calendar connected?', 0, 'Fetch upcoming events from Google Calendar'], ['Google Calendar connected?', 1, 'Load sample appointments'],
    ['Fetch upcoming events from Google Calendar', 'Combine event sources'], ['Load sample appointments', 0, 'Combine event sources', 1],
    ['Combine event sources', 'Pick reminders due now'],
    ['Pick reminders due now', 'Split into text messages'],
    ['Pick reminders due now', 'Summarise the run'],
    ['Split into text messages', 'Sending switched on?'],
    ['Sending switched on?', 0, 'Text the reminder with Twilio'], ['Sending switched on?', 1, 'STOP: preview - nothing sent'],
    ['Text the reminder with Twilio', 'Live run?'],
    ['Live run?', 0, 'Remember sent reminders'], ['Live run?', 1, 'STOP: test send - nothing remembered'],
  ],
  groups: [
    { title: 'Start and settings', why: 'Runs every 15 minutes, often enough that the 2-hour reminder lands between 1h45 and 2h before. Quiet hours, the opt-out list and the message details all live in `config`.', nodes: ['Run manually', 'Every 15 minutes', 'config'] },
    { title: 'Read the next 26 hours', why: 'One events.list call with singleEvents expands recurring bookings into real dates. `Load sample appointments` returns the same shape with start times relative to now, so each reminder rule has a case.', nodes: ['Google Calendar connected?', 'Fetch upcoming events from Google Calendar', 'Load sample appointments', 'Combine event sources'] },
    { title: 'Decide who gets a text', why: 'A number that cannot be read as E.164 is held, never guessed. Opt-outs are checked after normalising, so (212) 555-0177 and +12125550177 count as the same person. Quiet hours hold texts for the next run.', nodes: ['Pick reminders due now', 'Split into text messages', 'Summarise the run'] },
    { title: 'Send and remember', why: 'Nothing is texted while `TEST_RUN` is true and `TEST_EMAIL` is blank. A test send goes to `TEST_PHONE` and is not remembered, so the customer still gets the real reminder after going live.', nodes: ['Sending switched on?', 'STOP: preview - nothing sent', 'Text the reminder with Twilio', 'Live run?', 'STOP: test send - nothing remembered', 'Remember sent reminders'] },
  ],
  scenarios: [
    {
      name: 'shipped config (preview)', start: 'Run manually',
      expect: { reached: ['Load sample appointments', 'Summarise the run'], outward: 'none' },
      check: out => {
        const r = out['Pick reminders due now'][0];
        const f: string[] = [];
        const held = (s: string) => r.held.find((h: any) => h.event.includes(s))?.reason || '';
        if (!held('Mia Novak').startsWith('no valid phone')) f.push('Mia has no phone and should be held');
        if (held('Joel Grant') !== 'on OPT_OUT_NUMBERS') f.push('Joel (212-555-0177) should match the opt-out list after E.164');
        if (held('Lee Chen') !== 'marked no sms') f.push('Lee asked for no texts');
        if (!held('Ken Ito').startsWith('no reminder due yet')) f.push('5h away should not be due');
        if (r.looked !== 9) f.push('9 events should be read');
        if (r.quiet) {
          if (r.reminders.length) f.push('quiet hours must hold every text');
        } else {
          const types = r.reminders.map((x: any) => x.client + ':' + x.type + ':' + x.phone).join(',');
          if (types !== 'Rosa Diaz:2h:+16465550119,Sam Patel:24h:+12125550142') f.push(`expected Rosa 2h and Sam 24h, got ${types}`);
          if (!out['Split into text messages'].length) f.push('split should emit the texts');
        }
        if (!r.quiet && !out['STOP: preview - nothing sent']) f.push('preview should end at the STOP node');
        return f;
      },
    },
    {
      name: 'test send to TEST_PHONE outside quiet hours', start: 'Run manually',
      overrides: { TEST_EMAIL: 'you@example.com', TEST_PHONE: '+15555550199', TWILIO_FROM: '+15555550100', QUIET_START_HOUR: 0, QUIET_END_HOUR: 0 },
      mocks: { 'Text the reminder with Twilio': (items: any[]) => items.map((i, k) => ({ sid: 'SMtest' + k, status: 'queued', to: i.send_to })) },
      expect: { reached: ['Text the reminder with Twilio', 'STOP: test send - nothing remembered'], notReached: ['Remember sent reminders'], outward: 'some' },
      check: out => {
        const msgs = out['Split into text messages'];
        const f: string[] = [];
        if (msgs.length !== 2) f.push(`expected 2 texts (Rosa 2h, Sam 24h), got ${msgs.length}`);
        if (!msgs.every((m: any) => m.send_to === '+15555550199')) f.push('test mode must text TEST_PHONE');
        if (!msgs.every((m: any) => m.text.includes('Reply STOP'))) f.push('every text needs the opt-out line');
        return f;
      },
    },
    {
      name: 'live with Google Calendar and Twilio', start: 'Every 15 minutes',
      overrides: { USE_GOOGLE_CALENDAR: true, TEST_RUN: false, TWILIO_FROM: '+15555550100', QUIET_START_HOUR: 0, QUIET_END_HOUR: 0 },
      mocks: {
        'Fetch upcoming events from Google Calendar': [{ kind: 'calendar#events', items: [
          { id: 'g1', status: 'confirmed', summary: 'Haircut - Tom Becker', description: 'Mobile: 07700 900555', start: { dateTime: new Date(Date.now() + 1.2 * 36e5).toISOString() }, end: { dateTime: new Date(Date.now() + 2 * 36e5).toISOString() } },
          { id: 'g2', status: 'confirmed', summary: 'Colour - Dana Okafor', description: 'Phone: 001 212 555 0150', start: { dateTime: new Date(Date.now() + 10 * 36e5).toISOString() }, end: { dateTime: new Date(Date.now() + 11 * 36e5).toISOString() } },
        ] }],
        'Text the reminder with Twilio': (items: any[]) => items.map((i, k) => ({ sid: 'SM' + k, status: 'queued', to: i.send_to })),
      },
      expect: { reached: ['Text the reminder with Twilio', 'Remember sent reminders'], notReached: ['Load sample appointments'], outward: 'some' },
      check: out => {
        const r = out['Pick reminders due now'][0];
        const f: string[] = [];
        if (r.reminders.length !== 1 || r.reminders[0].phone !== '+12125550150') f.push('only Dana (00-prefixed US number) should be texted');
        if (!r.held.some((h: any) => h.event.includes('Tom Becker') && h.reason.startsWith('no valid phone'))) f.push('an 11-digit UK local number is not valid with country code 1');
        if (out['Remember sent reminders'][0]?.remembered !== 1) f.push('one key should be remembered');
        return f;
      },
    },
  ],
});
