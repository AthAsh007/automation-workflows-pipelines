// BOOK. No fixed slots: any start/end inside school hours can be booked. Free iPads for the window
// = available fleet minus the iPads held by active bookings that overlap it.
const cfg = $('Config').first().json._cfg;
const req = $('Config').first().json;
const fleet = $('Sheets - read the devices').all().map((i) => i.json || {});
const bookings = $('Sheets - read the bookings').all().map((i) => i.json || {});

const now = $now.setZone(cfg.TIMEZONE);
const today = now.toFormat('yyyy-MM-dd');
const nowMin = now.hour * 60 + now.minute;
const pad = (n) => String(n).padStart(2, '0');
const fmt = (m) => pad(Math.floor(m / 60)) + ':' + pad(m % 60);
const digits = (v) => String(v == null ? '' : v).replace(/\D/g, '');

// '9', '09:00', '9.30', '9am', '9:30 PM', ISO strings and Sheets time fractions -> 'HH:MM'
function toHHMM(v) {
  if (v == null || v === '') return null;
  const s = String(v).trim();
  if (/^0?\.\d+$/.test(s)) return fmt(Math.round(Number(s) * 1440));
  const iso = s.match(/T(\d{2}):(\d{2})/);
  if (iso) return iso[1] + ':' + iso[2];
  const m = s.match(/^(\d{1,2})(?:[:.](\d{2}))?\s*([ap])?\.?\s*m?\.?$/i);
  if (!m) return null;
  let h = Number(m[1]);
  const mi = m[2] ? Number(m[2]) : 0;
  const ap = (m[3] || '').toLowerCase();
  if (ap === 'p' && h < 12) h += 12;
  if (ap === 'a' && h === 12) h = 0;
  return h > 23 || mi > 59 ? null : pad(h) + ':' + pad(mi);
}
const toMin = (v) => {
  const t = toHHMM(v);
  return t == null ? null : Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
};
// 'YYYY-MM-DD', 'today', 'tomorrow' and Sheets date serials -> 'YYYY-MM-DD'. Impossible dates (2026-02-31) -> null.
function toYMD(v) {
  if (v == null || v === '') return null;
  const s = String(v).trim().toLowerCase();
  if (s === 'today') return today;
  if (s === 'tomorrow') return now.plus({ days: 1 }).toFormat('yyyy-MM-dd');
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return DateTime.fromISO(s.slice(0, 10)).isValid ? s.slice(0, 10) : null;
  if (/^\d{5}(\.\d+)?$/.test(s)) return DateTime.fromISO('1899-12-30').plus({ days: Math.floor(Number(s)) }).toFormat('yyyy-MM-dd');
  return null;
}
const prettyDate = (ymd) => DateTime.fromISO(ymd).toFormat('ccc d LLL');
const isAvailable = (d) => d.device_id && String(d.status || '').trim().toLowerCase() === 'available';
const isActive = (b) => String(b.status || '').trim().toLowerCase() === 'booked';
function busyIds(date, s, e) {
  const ids = new Set();
  for (const b of bookings) {
    if (String(b.status || '').trim().toLowerCase() === 'cancelled' || toYMD(b.date) !== date) continue;
    const bs = toMin(b.start_time), be = toMin(b.end_time);
    if (bs == null || be == null || bs >= e || be <= s) continue;
    for (const id of String(b.device_ids || '').split('|')) if (id.trim()) ids.add(id.trim());
  }
  return ids;
}
const fail = (reply, extra) => [{ json: Object.assign({ booked: false, reply }, extra) }];

const date = toYMD(req.date);
const startMin = toMin(req.start), endMin = toMin(req.end);
const openMin = toMin(cfg.SCHOOL_OPEN), closeMin = toMin(cfg.SCHOOL_CLOSE);
const want = Number(req.devices);
const lastDay = now.plus({ days: cfg.MAX_DAYS_AHEAD }).toFormat('yyyy-MM-dd');

if (req.date && !date) return fail('I couldn\'t read that date. Please send it like 2026-10-14.');
if (!date) return fail('Which date do you need the iPads for?');
if (startMin == null || endMin == null) return fail('Please give a start and end time, e.g. 09:00 to 10:00.');
if (!Number.isInteger(want) || want < 1) return fail('How many iPads do you need?');
if (want > cfg.MAX_DEVICES_PER_BOOKING) return fail(`You can book up to ${cfg.MAX_DEVICES_PER_BOOKING} iPads at once.`);
if (endMin <= startMin) return fail('The end time must be after the start time.');
if (startMin < openMin || endMin > closeMin) return fail(`iPads can only be booked between ${cfg.SCHOOL_OPEN} and ${cfg.SCHOOL_CLOSE}.`);
if (cfg.CLOSED_WEEKDAYS.includes(DateTime.fromISO(date).weekday)) return fail(`School is closed on ${prettyDate(date)}.`);
if (date < today || (date === today && startMin < nowMin)) return fail('That time has already passed. Please pick a later time.');
if (date > lastDay) return fail(`Bookings open ${cfg.MAX_DAYS_AHEAD} days ahead, so the latest date is ${prettyDate(lastDay)}.`);

// Same teacher, same window, same count, still active: a repeated "yes" or a retried call. Don't book twice.
const phone = digits(req.phone);
const same = bookings.find((b) => isActive(b) && phone && digits(b.phone) === phone && toYMD(b.date) === date
  && toMin(b.start_time) === startMin && toMin(b.end_time) === endMin && Number(b.devices) === want);
if (same) {
  const id = String(same.booking_id || '').trim();
  return fail(`You already have this booking: ${id}, ${prettyDate(date)} ${fmt(startMin)}-${fmt(endMin)}, ${want} iPad${want === 1 ? '' : 's'}.`,
    { duplicate: true, booking: { booking_id: id, date, start_time: fmt(startMin), end_time: fmt(endMin), devices: want, device_ids: same.device_ids } });
}

const busy = busyIds(date, startMin, endMin);
const free = fleet.filter((d) => isAvailable(d) && !busy.has(String(d.device_id).trim()));
if (free.length < want) {
  return fail(`Sorry, only ${free.length} iPad${free.length === 1 ? '' : 's'} free on ${prettyDate(date)} ${fmt(startMin)}-${fmt(endMin)} (you asked for ${want}).`);
}

const assigned = free.slice(0, want);
let maxNum = 0;
for (const b of bookings) {
  const m = String(b.booking_id || '').match(/^BK-(\d+)/i);
  if (m) maxNum = Math.max(maxNum, Number(m[1]));
}
// Two bookings landing at the same moment both see the same max, so a short random tag keeps the IDs unique.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const tag = ALPHABET[Math.floor(Math.random() * ALPHABET.length)] + ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
const booking = {
  booking_id: 'BK-' + String(maxNum + 1).padStart(4, '0') + '-' + tag,
  phone,
  teacher_name: req.name || '',
  date,
  start_time: fmt(startMin),
  end_time: fmt(endMin),
  device_ids: assigned.map((d) => String(d.device_id).trim()).join('|'),
  devices: want,
  status: 'booked',
  created_at: new Date().toISOString(),
};
const reply = `Booked! ${booking.booking_id}\n${prettyDate(date)}, ${booking.start_time}-${booking.end_time}\niPads: ${assigned.map((d) => d.label || d.device_id).join(', ')}`;
return [{ json: { booked: true, booking, reply } }];
