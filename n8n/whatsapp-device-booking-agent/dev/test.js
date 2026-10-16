// Runs the code-node sources against the dummy sheets with a mocked n8n runtime.
// usage: bun test.js <dummy-sheets dir>
const fs = require('fs');
const path = require('path');
const { DateTime, Settings } = require('luxon');
const DIR = process.argv[2];
const csv = (f) => {
  const [head, ...rows] = fs.readFileSync(path.join(DIR, f), 'utf8').trim().split(/\r?\n/);
  const keys = head.split(',');
  return rows.map((r) => Object.fromEntries(r.split(',').map((v, i) => [keys[i], v])));
};
const devices = csv('Devices.csv');
const bookings = csv('Bookings.csv');
// Fixed clock: Thu 8 Oct 2026, 08:20 school time
const NOW = DateTime.fromISO('2026-10-08T08:20:00', { zone: 'Asia/Kolkata' });
Settings.now = () => NOW.toMillis();
const CFG = { TIMEZONE: 'Asia/Kolkata', SCHOOL_OPEN: '07:00', SCHOOL_CLOSE: '12:00', CLOSED_WEEKDAYS: [7], MAX_DEVICES_PER_BOOKING: 10, MAX_DAYS_AHEAD: 60, SCAN_DAYS: 7, DEFAULT_MINUTES: 60, DEFAULT_DEVICES: 1, WEBHOOK_TOKEN: 'test-token-0123456789', ALLOWED_PHONES: [] };
const code = (file) => fs.readFileSync(path.join(__dirname, 'src', file), 'utf8');
const mock = (data) => (n) => {
  if (!data[n]) throw new Error('no node ' + n);
  return { first: () => ({ json: data[n][0] }), item: { json: data[n][0] }, all: () => data[n].map((json) => ({ json })) };
};

function run(file, req, nodes, cfg = CFG) {
  const data = Object.assign({ Config: [Object.assign({}, req, { _cfg: cfg })] }, nodes);
  return new Function('$', '$now', 'DateTime', code(file))(mock(data), DateTime.now().setZone('UTC'), DateTime)[0].json;
}
let fails = 0;
const check = (label, got, test) => {
  let ok = false;
  try { ok = test(got); } catch (e) { ok = false; }
  if (!ok) fails++;
  console.log(ok ? 'PASS' : 'FAIL', label, '->', JSON.stringify(got && got.reply !== undefined ? got.reply : got));
};

const B = { 'Sheets - read the devices': devices, 'Sheets - read the bookings': bookings };
const book = (r, extra = []) => run('02-plan.js', Object.assign({ phone: '12025550167', name: 'Alice' }, r), Object.assign({}, B, { 'Sheets - read the bookings': bookings.concat(extra) }));
check('book free window', book({ devices: 2, date: '2026-10-08', start: '10:00', end: '11:00' }), (o) => o.booked && /^BK-0005-[A-Z2-9]{2}$/.test(o.booking.booking_id) && o.booking.device_ids === 'IPAD-001|IPAD-002');
check('book skips busy+maintenance', book({ devices: 3, date: '2026-10-08', start: '10:30', end: '11:30' }), (o) => o.booked && !/IPAD-00[3457]/.test(o.booking.device_ids));
check('book too many', book({ devices: 6, date: '2026-10-08', start: '10:30', end: '11:30' }), (o) => !o.booked && /only 4/.test(o.reply));
check('book past time today', book({ devices: 1, date: 'today', start: '07:00', end: '08:00' }), (o) => !o.booked && /passed/.test(o.reply));
check('book outside hours', book({ devices: 1, date: 'tomorrow', start: '11:30', end: '12:30' }), (o) => !o.booked && /between/.test(o.reply));
check('book tomorrow 9am-10am text', book({ devices: 1, date: 'tomorrow', start: '9am', end: '10.00' }), (o) => o.booked && o.booking.date === '2026-10-09' && o.booking.start_time === '09:00');
check('book missing end', book({ devices: 1, date: 'tomorrow', start: '09:00', end: '' }), (o) => !o.booked && /end time/.test(o.reply));
check('book sunday', book({ devices: 1, date: '2026-10-11', start: '09:00', end: '10:00' }), (o) => !o.booked && /closed/.test(o.reply));
check('book zero devices', book({ devices: 0, date: 'tomorrow', start: '09:00', end: '10:00' }), (o) => !o.booked && /How many/.test(o.reply));
check('book empty sheets', run('02-plan.js', { phone: '1', devices: 1, date: 'tomorrow', start: '09:00', end: '10:00' }, { 'Sheets - read the devices': [{}], 'Sheets - read the bookings': [{}] }), (o) => !o.booked && /only 0/.test(o.reply));
check('book impossible date', book({ devices: 1, date: '2026-02-31', start: '09:00', end: '10:00' }), (o) => !o.booked && /couldn't read that date/.test(o.reply));
check('book month 13', book({ devices: 1, date: '2026-13-40', start: '09:00', end: '10:00' }), (o) => !o.booked && /couldn't read/.test(o.reply));
check('book too far ahead', book({ devices: 1, date: '2027-03-01', start: '09:00', end: '10:00' }), (o) => !o.booked && /60 days ahead/.test(o.reply));
check('book duplicate is not booked twice', book({ devices: 2, date: '2026-10-08', start: '09:00', end: '10:00' }), (o) => !o.booked && o.duplicate && o.booking.booking_id === 'BK-0001' && /already have/.test(o.reply));
check('book same window other teacher is not a duplicate', book({ devices: 1, date: '2026-10-08', start: '09:00', end: '10:00', phone: '12025550199' }), (o) => o.booked);
check('book id after suffixed ids', book({ devices: 1, date: 'tomorrow', start: '10:00', end: '11:00' }, [{ booking_id: 'BK-0010-AB', status: 'cancelled' }]), (o) => /^BK-0011-/.test(o.booking.booking_id));

const C = { 'Sheets - read the bookings': bookings.concat([
  { booking_id: 'BK-0009', phone: '12025550167', date: '2026-10-12', start_time: '08:00', end_time: '09:00', devices: '1', status: 'booked' },
  { booking_id: 'BK-0010-XY', phone: '12025550167', date: '2026-10-08', start_time: '07:00', end_time: '08:00', devices: '1', status: 'booked' },
]) };
check('cancel ambiguous', run('03-find.js', { phone: '12025550167', booking_id: '' }, C), (o) => !o.found && o.needs_booking_id && o.bookings.length === 2);
check('cancel by id', run('03-find.js', { phone: '12025550167', booking_id: 'bk-0009' }, C), (o) => o.found && o.booking_id === 'BK-0009');
check('cancel someone else', run('03-find.js', { phone: '12025550168', booking_id: 'BK-0009' }, C), (o) => !o.found);
check('cancel single', run('03-find.js', { phone: '+1 202 555 0169', booking_id: '' }, C), (o) => o.found && o.booking_id === 'BK-0003');
check('cancel none', run('03-find.js', { phone: '999', booking_id: '' }, C), (o) => !o.found && /no upcoming/.test(o.reply));
check('cancel ended today refused', run('03-find.js', { phone: '12025550167', booking_id: 'BK-0010-XY' }, C), (o) => !o.found);

const L = { 'Sheets - Bookings': C['Sheets - read the bookings'] };
check('list mine (ended one hidden)', run('05-list.js', { phone: '12025550167' }, L), (o) => o.count === 2 && o.bookings[0].booking_id === 'BK-0001' && !o.bookings.some((b) => b.booking_id === 'BK-0010-XY'));
check('list none', run('05-list.js', { phone: '12025550170' }, L), (o) => o.count === 0);

const A = { 'Sheets - Devices': devices, 'Sheets - Bookings': bookings };
check('avail window', run('04-scan.js', { devices: 2, date: '2026-10-08', start: '10:00', end: '11:00' }, A), (o) => o.mode === 'window' && o.free === 4 && o.total === 7);
check('avail window on sunday', run('04-scan.js', { devices: 2, date: '2026-10-11', start: '09:00', end: '10:00' }, A), (o) => o.success === false && /closed/.test(o.reply));
check('avail window already passed', run('04-scan.js', { devices: 1, date: '2026-10-08', start: '07:00', end: '08:00' }, A), (o) => o.success === false && /passed/.test(o.reply));
check('avail impossible date', run('04-scan.js', { devices: 1, date: '2026-02-31' }, A), (o) => o.success === false && /couldn't read/.test(o.reply));
check('avail scan today', run('04-scan.js', { devices: 3, hours: 1, date: '2026-10-08' }, A), (o) => o.mode === 'scan' && o.stretches[0].from === '08:30');
check('avail scan reply uses start times', run('04-scan.js', { devices: 3, hours: 1, date: '2026-10-08' }, A), (o) => /Start times that work/.test(o.reply) && o.stretches.every((x) => x.last_start <= x.to));
check('avail scan tomorrow 7 iPads', run('04-scan.js', { devices: 7, hours: 1, date: 'tomorrow' }, A), (o) => o.stretches.length === 2 && o.stretches[0].to === '08:00' && o.stretches[1].from === '09:00');
check('avail scan no date', run('04-scan.js', { devices: 1, hours: 2 }, A), (o) => o.mode === 'scan' && o.stretches.length >= 1 && !o.stretches.some((x) => x.date === '2026-10-11'));
check('avail scan covers SCAN_DAYS days', run('04-scan.js', { devices: 8, hours: 1 }, A, Object.assign({}, CFG, { SCAN_DAYS: 2 })), (o) => /next 2 days/.test(o.reply));
check('avail impossible', run('04-scan.js', { devices: 8, hours: 1, date: 'tomorrow' }, A), (o) => o.stretches.length === 0);

// ---- 01 Read message ----
const readMsg = (items, cfg = CFG, store = {}) => new Function('$', '$input', '$getWorkflowStaticData', code('01-read.js'))(
  mock({ Config: [{ _cfg: cfg }] }), { all: () => items.map((json) => ({ json })) }, () => store).map((i) => i.json);
const msg = (id, from, body, extra = {}) => Object.assign({ message: Object.assign({ id, from, type: 'text', text: { body }, kapso: { direction: 'inbound' } }, extra), conversation: { contact_name: 'T ' + from, phone_number: from } });
const hook = (body, token = CFG.WEBHOOK_TOKEN) => ({ headers: { host: 'x' }, query: token ? { token } : {}, body });
check('read: webhook without token dropped', readMsg([hook(msg('w1', '111', 'hi'), '')]), (o) => o.length === 0);
check('read: placeholder token never accepted', readMsg([hook(msg('w1', '111', 'hi'), 'PUT A LONG RANDOM TOKEN HERE')], Object.assign({}, CFG, { WEBHOOK_TOKEN: 'PUT A LONG RANDOM TOKEN HERE' })), (o) => o.length === 0);
check('read: demo item (no headers) accepted', readMsg([{ body: msg('d1', '111', 'hi') }]), (o) => o.length === 1 && o[0].text === 'hi' && o[0].reply === '');
const store = {};
check('read: first delivery', readMsg([hook(msg('w2', '111', 'book'))], CFG, store), (o) => o.length === 1);
check('read: retried delivery dropped', readMsg([hook(msg('w2', '111', 'book'))], CFG, store), (o) => o.length === 0);
check('read: batch split per teacher, same teacher merged', readMsg([hook({ batch: true, data: [msg('b1', '111', 'book 2'), msg('b2', '222', 'cancel'), msg('b3', '111', 'tomorrow 9-10')] })]),
  (o) => o.length === 2 && o[0].from === '111' && o[0].text === 'book 2\ntomorrow 9-10' && o[1].from === '222');
check('read: outbound echo skipped', readMsg([hook(msg('e1', '111', 'x', { kapso: { direction: 'outbound' } }))]), (o) => o.length === 0);
check('read: voice note gets fixed reply', readMsg([hook({ message: { id: 'v1', from: '111', type: 'audio', audio: {} }, conversation: {} })]), (o) => o.length === 1 && /only read text/.test(o[0].reply));
check('read: reaction ignored', readMsg([hook({ message: { id: 'r1', from: '111', type: 'reaction' }, conversation: {} })]), (o) => o.length === 0);
check('read: status event ignored', readMsg([hook({ conversation: { phone_number: '111' }, status: 'delivered' })]), (o) => o.length === 0);
check('read: allow-list', readMsg([hook({ batch: true, data: [msg('a1', '111', 'hi'), msg('a2', '333', 'hi')] })], Object.assign({}, CFG, { ALLOWED_PHONES: ['+1 11'] })),
  (o) => o.length === 2 && o[0].reply === '' && /not registered/.test(o[1].reply));

// ---- 01 Prepare reply ----
const prep = (json, clock) => new Function('$', '$json', code('01-reply.js'))(mock({ 'School clock': [clock] }), json).json;
check('reply: agent answer', prep({ output: 'Booked!' }, { from: '111', reply: '' }), (o) => o.to === '111' && o.text === 'Booked!');
check('reply: fixed reply wins', prep({ from: '111', reply: 'text only' }, { from: '111', reply: 'text only' }), (o) => o.text === 'text only');
check('reply: agent failed -> apology', prep({ error: { message: 'max iterations' } }, { from: '111', reply: '' }), (o) => /went wrong/.test(o.text) && o.agent_error === 'max iterations');
console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
