import { defineSpec } from '../_kit/spec';
import { trigger, code, ifTrue, merge, stop, sheets, gmail } from '../_kit/n';

const cfg = (k: string) => `$('config').first().json.${k}`;

export default defineSpec({
  slug: 'rental-viewing-slot-offers',
  title: 'Offer rental viewing slots by email from form requests',
  summary: 'Takes a viewing request from an n8n form, finds the three best free slots for that property in Google Sheets by day and time preference, holds them for 24 hours and emails the choices, or adds the person to a waitlist and alerts the agent when nothing is free.',
  category: 'Local business and services',
  description: {
    who: 'Letting agents and landlords who run group or back-to-back viewings and spend the morning swapping emails to find a time. A prospect fills in one form and gets three real options within a minute.',
    how: [
      'A prospect submits the form with the property, preferred days and preferred time of day. A manual run uses a sample request.',
      'Viewing slots and current holds are read from the Slots and Holds tabs. Free places = capacity minus bookings minus holds that have not expired.',
      'Slots at least `MIN_NOTICE_HOURS` ahead and within `LOOKAHEAD_DAYS` are scored: +2 for the preferred days, +2 for the preferred time. The best 3 are picked, one per day first so the choices are spread out.',
      'The offered slots are written to the Holds tab with a 24-hour expiry and the prospect gets an email listing them.',
      'With no free slot, the request goes to the Waitlist tab and the agent gets an email.',
    ],
    setup: [
      'Run it once as imported. It matches the sample request and stops at `STOP: preview - nothing sent`.',
      'Create a sheet with Slots (Slot ID, Property, Start, Capacity, Booked), Holds (Hold ID, Slot ID, Email, Expires) and Waitlist tabs, connect Google Sheets and set `SLOTS_SHEET_ID`.',
      'Connect Gmail and set `AGENT_EMAIL` and `AGENCY_NAME`. Edit the Property options on the form to match your Slot sheet.',
      'Put your address in `TEST_EMAIL` to receive the offers yourself, then set `TEST_RUN = false`.',
    ],
    requirements: ['A Google Sheet with Slots, Holds and Waitlist tabs', 'A Gmail account'],
    customize: [
      '`HOLD_HOURS` sets how long offered slots stay reserved.',
      '`OFFER_COUNT` and `LOOKAHEAD_DAYS` change how many choices are offered and how far ahead.',
      '`TIMEZONE` must match the times written in the Start column.',
    ],
  },
  config: {
    intro: ['SLOTS_SHEET_ID blank -> SAMPLE slots and holds so the run works before any credential exists.', 'Only a live run writes holds or waitlist rows; test mode emails TEST_EMAIL only.'],
    consts: [
      { name: 'SLOTS_SHEET_ID', value: '', note: 'Google Sheets id with Slots, Holds and Waitlist tabs; blank uses sample data' },
      { name: 'TIMEZONE', value: 'Europe/London', note: "timezone of the 'YYYY-MM-DD HH:mm' times in the Start column" },
      { name: 'OFFER_COUNT', value: 3, note: 'slots offered per request' },
      { name: 'HOLD_HOURS', value: 24, note: 'offered slots are reserved for this long' },
      { name: 'MIN_NOTICE_HOURS', value: 12, note: 'never offer a slot sooner than this' },
      { name: 'LOOKAHEAD_DAYS', value: 14, note: 'never offer a slot further out than this' },
      { name: 'AGENCY_NAME', value: 'Harbour Lettings', note: 'sign-off on the offer email' },
      { name: 'AGENT_EMAIL', value: 'lettings@harbour-lettings.example', note: 'gets an alert when a request lands on the waitlist' },
    ],
    flags: { sheets_enabled: "SLOTS_SHEET_ID.trim() !== ''" },
    safety: 'test_run',
  },
  nodes: [
    trigger.manual(),
    trigger.form('Viewing request form', 'Book a viewing', 'Tell us which property and when suits you. We will email you three times to choose from.', [
      { label: 'Full name', required: true },
      { label: 'Email', type: 'email', required: true },
      { label: 'Phone' },
      { label: 'Property', type: 'dropdown', options: ['FLAT-12', 'HSE-7', 'FLAT-30'], required: true },
      { label: 'Preferred days', type: 'dropdown', options: ['Any day', 'Weekdays', 'Weekends'] },
      { label: 'Preferred time', type: 'dropdown', options: ['Any time', 'Morning', 'Afternoon', 'Evening'] },
    ]),
    code('Read the viewing request', `
// Form submission when there is one; an empty marker on a manual run.
let f = null;
try { f = $('Viewing request form').first().json; } catch (e) { f = null; }
if (!f || !f['Email']) return [{ json: { has_request: false } }];
return [{ json: { has_request: true, name: String(f['Full name'] || '').trim(), email: String(f['Email']).trim().toLowerCase(),
  phone: f['Phone'] || '', property: f['Property'], days: f['Preferred days'] || 'Any day', time: f['Preferred time'] || 'Any time',
  submitted_at: f.submittedAt || new Date().toISOString() } }];`),
    ifTrue('Request from the form?', '$json.has_request'),
    code('Load sample request', `
// Used on a manual run: someone who can only do weekday evenings.
return [{ json: { has_request: true, name: 'Sam Patel', email: 'sam.patel@mail.example', phone: '(212) 555-0142',
  property: 'FLAT-12', days: 'Weekdays', time: 'Evening', submitted_at: new Date().toISOString() } }];`),
    merge('Combine request sources'),
    ifTrue('Slots sheet set?', cfg('sheets_enabled')),
    sheets.read('Read viewing slots', cfg('slots_sheet_id'), 'Slots'),
    sheets.read('Read active holds', cfg('slots_sheet_id'), 'Holds'),
    code('Load sample slots and holds', `
// Used until SLOTS_SHEET_ID is set. Built on the next weekdays and weekend in TIMEZONE so
// the expected offer is the same whatever day it runs.
const cfg = $('config').first().json;
const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: cfg.timezone, year: 'numeric', month: '2-digit', day: '2-digit' })
  .formatToParts(new Date()).map(x => [x.type, x.value]));
const base = Date.UTC(+p.year, +p.month - 1, +p.day);
const wk = [], we = [];
for (let i = 1; wk.length < 6 || we.length < 2; i++) {
  const d = new Date(base + i * 864e5);
  ([0, 6].includes(d.getUTCDay()) ? we : wk).push(d.toISOString().slice(0, 10));
}
const slot = (id, property, date, time, cap, booked) => ({ 'Slot ID': id, Property: property, Start: date + ' ' + time, Capacity: cap, Booked: booked });
const inHours = h => new Date(Date.now() + h * 36e5).toISOString();
return [
  slot('S1', 'FLAT-12', wk[0], '18:00', 1, 1),
  slot('S2', 'FLAT-12', wk[1], '18:00', 2, 0),
  slot('S3', 'FLAT-12', wk[1], '10:00', 4, 1),
  slot('S4', 'FLAT-12', wk[2], '18:30', 4, 2),
  slot('S5', 'FLAT-12', wk[3], '17:30', 2, 0),
  slot('S6', 'FLAT-12', wk[4], '18:00', 3, 1),
  slot('S7', 'FLAT-12', we[0], '11:00', 6, 0),
  slot('S8', 'FLAT-12', wk[2], '19:00', 2, 0),
  slot('S9', 'HSE-7', wk[0], '18:00', 2, 0),
  { 'Hold ID': 'H-1', 'Slot ID': 'S2', Email: 'a@mail.example', Expires: inHours(5) },
  { 'Hold ID': 'H-2', 'Slot ID': 'S2', Email: 'b@mail.example', Expires: inHours(20) },
  { 'Hold ID': 'H-3', 'Slot ID': 'S4', Email: 'c@mail.example', Expires: inHours(-3) },
].map(json => ({ json }));`),
    merge('Combine slot sources', 3),
    code('Match the request to open slots', `
// Free = Capacity - Booked - holds still in date. Times are wall-clock in TIMEZONE,
// so 'now' is turned into the same wall clock before comparing.
const cfg = $('config').first().json;
const req = $('Combine request sources').first().json;
const rows = $input.all().map(i => i.json);
const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: cfg.timezone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  .formatToParts(new Date()).map(x => [x.type, x.value]));
const nowWall = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute);
const holds = {};
for (const h of rows.filter(r => r['Hold ID'])) if (new Date(h.Expires).getTime() > Date.now()) holds[h['Slot ID']] = (holds[h['Slot ID']] || 0) + 1;
const timeOf = hr => hr < 12 ? 'Morning' : hr < 17 ? 'Afternoon' : 'Evening';
const open = [];
for (const s of rows.filter(r => r['Slot ID'] && r.Property !== undefined && !r['Hold ID'])) {
  if (String(s.Property).trim() !== req.property) continue;
  const at = Date.parse(String(s.Start).trim().replace(' ', 'T') + ':00Z');
  if (!at) continue;
  const hours = (at - nowWall) / 36e5;
  if (hours < cfg.min_notice_hours || hours > cfg.lookahead_days * 24) continue;
  const free = Number(s.Capacity || 0) - Number(s.Booked || 0) - (holds[s['Slot ID']] || 0);
  if (free <= 0) continue;
  const d = new Date(at);
  const weekend = [0, 6].includes(d.getUTCDay());
  const score = (req.days === 'Any day' || (req.days === 'Weekends') === weekend ? 2 : 0) + (req.time === 'Any time' || timeOf(d.getUTCHours()) === req.time ? 2 : 0);
  open.push({ slot_id: s['Slot ID'], start: s.Start, day: String(s.Start).slice(0, 10), at, free, score,
    label: d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }) + ' at ' + String(s.Start).slice(11, 16) });
}
open.sort((a, b) => b.score - a.score || a.at - b.at);
// Spread: best slot per day first, then fill from what is left.
const offers = [], days = new Set();
for (const s of open) if (offers.length < cfg.offer_count && !days.has(s.day)) { offers.push(s); days.add(s.day); }
for (const s of open) if (offers.length < cfg.offer_count && !offers.includes(s)) offers.push(s);
offers.sort((a, b) => a.at - b.at);
const expires = new Date(Date.now() + cfg.hold_hours * 36e5).toISOString();
return [{ json: { request: req, offers, open_count: open.length, expires } }];`),
    ifTrue('Any slot free?', '$json.offers.length > 0'),
    code('Write the waitlist alert', `
// Nothing free: one row for the Waitlist tab and one email for the agent.
const cfg = $('config').first().json;
const { request: r } = $input.first().json;
const row = { Added: new Date().toISOString().slice(0, 10), Name: r.name, Email: r.email, Phone: r.phone, Property: r.property, 'Preferred days': r.days, 'Preferred time': r.time };
const body = ['No free viewing slot for ' + r.property + ' in the next ' + cfg.lookahead_days + ' days.', '',
  'Name: ' + r.name, 'Email: ' + r.email, 'Phone: ' + (r.phone || 'not given'), 'Prefers: ' + r.days + ', ' + r.time, '',
  'They have been added to the Waitlist tab. Add slots or call them back.'].join('\\n');
return [{ json: { row, subject: 'Waitlist: ' + r.name + ' for ' + r.property, body,
  send_to: cfg.mode === 'test' ? cfg.test_email : cfg.agent_email } }];`),
    ifTrue('Alert switched on?', cfg('sends_enabled')),
    stop('STOP: preview - no alert sent'),
    gmail.send('Alert the letting agent', { to: '$json.send_to', subject: "($('config').first().json.mode === 'test' ? '[TEST] ' : '') + $json.subject", message: '$json.body' }),
    ifTrue('Live waitlist write?', cfg('live')),
    stop('STOP: test - waitlist untouched'),
    code('Shape the waitlist row', `
// Only the sheet columns, so the append maps cleanly.
return [{ json: $('Write the waitlist alert').first().json.row }];`),
    sheets.append('Add to the waitlist', cfg('slots_sheet_id'), 'Waitlist'),
    code('Write the offer email', `
// Numbered choices so a one-character reply is enough to confirm.
const cfg = $('config').first().json;
const { request: r, offers, expires } = $input.first().json;
const until = new Date(expires).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: cfg.timezone });
const body = [
  'Hi ' + (r.name.split(' ')[0] || 'there') + ',', '',
  'Thanks for asking to view ' + r.property + '. These times are free:', '',
  ...offers.map((o, i) => (i + 1) + '. ' + o.label),
  '', 'Reply with 1, 2 or 3 to confirm. We are holding these for you until ' + until + '.', '',
  cfg.agency_name,
].join('\\n');
return [{ json: { ...r, offers, expires, subject: 'Viewing times for ' + r.property, body, send_to: cfg.mode === 'test' ? cfg.test_email : r.email } }];`),
    ifTrue('Sending switched on?', cfg('sends_enabled')),
    stop('STOP: preview - nothing sent'),
    gmail.send('Email the viewing choices', { to: '$json.send_to', subject: "($('config').first().json.mode === 'test' ? '[TEST to ' + $('Write the offer email').first().json.email + '] ' : '') + $json.subject", message: '$json.body' }),
    ifTrue('Live run?', cfg('live')),
    stop('STOP: test send - slots not held'),
    code('Split into hold rows', `
// One Holds row per offered slot, expiring after HOLD_HOURS.
const o = $('Write the offer email').first().json;
return o.offers.map(s => ({ json: { 'Hold ID': 'H-' + s.slot_id + '-' + Date.now().toString(36), 'Slot ID': s.slot_id, Email: o.email, Expires: o.expires } }));`),
    sheets.append('Hold the offered slots', cfg('slots_sheet_id'), 'Holds'),
  ],
  edges: [
    ['Run manually', 'config'], ['Viewing request form', 'config'],
    ['config', 'Read the viewing request'],
    ['Read the viewing request', 'Request from the form?'],
    ['Request from the form?', 0, 'Combine request sources'], ['Request from the form?', 1, 'Load sample request'],
    ['Load sample request', 0, 'Combine request sources', 1],
    ['Combine request sources', 'Slots sheet set?'],
    ['Slots sheet set?', 0, 'Read viewing slots'], ['Slots sheet set?', 0, 'Read active holds'], ['Slots sheet set?', 1, 'Load sample slots and holds'],
    ['Read viewing slots', 'Combine slot sources'], ['Read active holds', 0, 'Combine slot sources', 1], ['Load sample slots and holds', 0, 'Combine slot sources', 2],
    ['Combine slot sources', 'Match the request to open slots'],
    ['Match the request to open slots', 'Any slot free?'],
    ['Any slot free?', 0, 'Write the offer email'], ['Any slot free?', 1, 'Write the waitlist alert'],
    ['Write the waitlist alert', 'Alert switched on?'],
    ['Alert switched on?', 0, 'Alert the letting agent'], ['Alert switched on?', 1, 'STOP: preview - no alert sent'],
    ['Alert the letting agent', 'Live waitlist write?'],
    ['Live waitlist write?', 0, 'Shape the waitlist row'], ['Live waitlist write?', 1, 'STOP: test - waitlist untouched'],
    ['Shape the waitlist row', 'Add to the waitlist'],
    ['Write the offer email', 'Sending switched on?'],
    ['Sending switched on?', 0, 'Email the viewing choices'], ['Sending switched on?', 1, 'STOP: preview - nothing sent'],
    ['Email the viewing choices', 'Live run?'],
    ['Live run?', 0, 'Split into hold rows'], ['Live run?', 1, 'STOP: test send - slots not held'],
    ['Split into hold rows', 'Hold the offered slots'],
  ],
  groups: [
    { title: 'Start and settings', why: 'Prospects submit `Viewing request form`; `Run manually` replays a sample request. Hold length, notice period and lookahead all live in `config`.', nodes: ['Run manually', 'Viewing request form', 'config'] },
    { title: 'Read the request', why: '`Read the viewing request` lower-cases the email and fills missing preferences with Any, so the matcher never sees a blank. A manual run uses `Load sample request`.', nodes: ['Read the viewing request', 'Request from the form?', 'Load sample request', 'Combine request sources'] },
    { title: 'Read slots and holds', why: 'Slots and holds are read in parallel and merged, so free places can be counted in one place. Expired holds are ignored there, which is why nothing ever needs to delete a row from the Holds tab.', nodes: ['Slots sheet set?', 'Read viewing slots', 'Read active holds', 'Load sample slots and holds', 'Combine slot sources'] },
    { title: 'Match or waitlist', why: 'Scoring favours preferred days and times, then the earliest slot, with one slot per day picked first. With nothing free the prospect goes on the Waitlist tab and the agent is told, rather than the form silently failing.', nodes: ['Match the request to open slots', 'Any slot free?', 'Write the waitlist alert', 'Alert switched on?', 'STOP: preview - no alert sent', 'Alert the letting agent', 'Live waitlist write?', 'STOP: test - waitlist untouched', 'Shape the waitlist row', 'Add to the waitlist'] },
    { title: 'Email the choices and hold them', why: 'Nothing is emailed while `TEST_RUN` is true and `TEST_EMAIL` is blank. Only a live run writes holds, so a test offer never blocks a real slot for the next 24 hours.', nodes: ['Write the offer email', 'Sending switched on?', 'STOP: preview - nothing sent', 'Email the viewing choices', 'Live run?', 'STOP: test send - slots not held', 'Split into hold rows', 'Hold the offered slots'] },
  ],
  scenarios: [
    {
      name: 'shipped config (preview)', start: 'Run manually',
      expect: { reached: ['Load sample request', 'Load sample slots and holds', 'STOP: preview - nothing sent'], notReached: ['Write the waitlist alert'], outward: 'none' },
      check: out => {
        const m = out['Match the request to open slots'][0];
        const f: string[] = [];
        const ids = m.offers.map((o: any) => o.slot_id).join(',');
        if (ids !== 'S4,S5,S6') f.push(`expected S4,S5,S6 (weekday evenings, one per day), got ${ids}`);
        if (m.offers.some((o: any) => ['S1', 'S2'].includes(o.slot_id))) f.push('full or fully held slots must not be offered');
        if (m.offers.find((o: any) => o.slot_id === 'S4')?.free !== 2) f.push('expired hold on S4 should not count');
        if (!out['Write the offer email'][0].body.includes('3. ')) f.push('email should list three numbered choices');
        return f;
      },
    },
    {
      name: 'form request with no free slot (test mode)', start: 'Viewing request form', overrides: { TEST_EMAIL: 'you@example.com' },
      input: [{ 'Full name': 'Rosa Diaz', Email: 'Rosa@Mail.example', Phone: '', Property: 'FLAT-30', 'Preferred days': 'Weekends', 'Preferred time': 'Morning', submittedAt: new Date().toISOString(), formMode: 'production' }],
      mocks: { 'Alert the letting agent': [{ id: 'msg-1', labelIds: ['SENT'] }] },
      expect: { reached: ['Alert the letting agent', 'STOP: test - waitlist untouched'], notReached: ['Load sample request', 'Write the offer email', 'Add to the waitlist'], outward: 'some' },
      check: out => {
        const a = out['Write the waitlist alert'][0];
        const f: string[] = [];
        if (a.send_to !== 'you@example.com') f.push('test alert should go to TEST_EMAIL');
        if (a.row.Email !== 'rosa@mail.example') f.push('email should be lower-cased');
        return f;
      },
    },
    {
      name: 'live offer with holds written', start: 'Viewing request form',
      overrides: { SLOTS_SHEET_ID: '1SlotsSheetExample', TEST_RUN: false, TIMEZONE: 'UTC' },
      input: [{ 'Full name': 'Lee Chen', Email: 'lee@mail.example', Phone: '', Property: 'HSE-7', 'Preferred days': 'Any day', 'Preferred time': 'Any time', submittedAt: new Date().toISOString(), formMode: 'production' }],
      mocks: {
        'Read viewing slots': () => {
          const d = (n: number) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
          return [
            { row_number: 2, 'Slot ID': 'A1', Property: 'HSE-7', Start: d(2) + ' 10:00', Capacity: 1, Booked: 0 },
            { row_number: 3, 'Slot ID': 'A2', Property: 'HSE-7', Start: d(3) + ' 10:00', Capacity: 1, Booked: 0 },
            { row_number: 4, 'Slot ID': 'A3', Property: 'HSE-7', Start: d(30) + ' 10:00', Capacity: 1, Booked: 0 },
          ];
        },
        'Read active holds': [{ row_number: 2, 'Hold ID': 'H-x', 'Slot ID': 'A1', Email: 'x@mail.example', Expires: new Date(Date.now() + 36e5).toISOString() }],
        'Email the viewing choices': [{ id: 'msg-2', labelIds: ['SENT'] }],
        'Hold the offered slots': (items: any[]) => items,
      },
      expect: { reached: ['Email the viewing choices', 'Hold the offered slots'], notReached: ['Load sample slots and holds'], outward: 'some' },
      check: out => {
        const holds = out['Split into hold rows'];
        const f: string[] = [];
        if (holds.length !== 1 || holds[0]['Slot ID'] !== 'A2') f.push('only A2 is free inside the lookahead (A1 held, A3 too far)');
        return f;
      },
    },
  ],
});
