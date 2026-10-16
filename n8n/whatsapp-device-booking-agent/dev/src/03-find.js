// CANCEL. Only the teacher's own upcoming bookings can be cancelled. With a booking_id it cancels
// exactly that one; without one it cancels only when the teacher has a single upcoming booking.
// Upcoming = not cancelled and not ended yet (a booking from earlier today that is over is not upcoming).
const cfg = $('Config').first().json._cfg;
const req = $('Config').first().json;
const bookings = $('Sheets - read the bookings').all().map((i) => i.json || {});

const now = $now.setZone(cfg.TIMEZONE);
const today = now.toFormat('yyyy-MM-dd');
const nowMin = now.hour * 60 + now.minute;
const pad = (n) => String(n).padStart(2, '0');
const digits = (v) => String(v == null ? '' : v).replace(/\D/g, '');
// 'HH:MM', ISO strings and Sheets time fractions -> minutes since midnight
function toMin(v) {
  if (v == null || v === '') return null;
  const s = String(v).trim();
  if (/^0?\.\d+$/.test(s)) return Math.round(Number(s) * 1440);
  const m = s.match(/(?:T|^)(\d{1,2})[:.](\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}
const hhmm = (v) => {
  const m = toMin(v);
  return m == null ? String(v || '') : pad(Math.floor(m / 60)) + ':' + pad(m % 60);
};
function toYMD(v) {
  if (v == null || v === '') return null;
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return DateTime.fromISO(s.slice(0, 10)).isValid ? s.slice(0, 10) : null;
  if (/^\d{5}(\.\d+)?$/.test(s)) return DateTime.fromISO('1899-12-30').plus({ days: Math.floor(Number(s)) }).toFormat('yyyy-MM-dd');
  return null;
}
const notOver = (b) => {
  const d = toYMD(b.date);
  if (!d || d < today) return false;
  if (d > today) return true;
  const end = toMin(b.end_time);
  return end == null || end > nowMin;
};
const summary = (b) => ({
  booking_id: String(b.booking_id || '').trim(),
  date: toYMD(b.date),
  start_time: hhmm(b.start_time),
  end_time: hhmm(b.end_time),
  devices: b.devices,
  line: `${String(b.booking_id || '').trim()}: ${DateTime.fromISO(toYMD(b.date)).toFormat('ccc d LLL')} ${hhmm(b.start_time)}-${hhmm(b.end_time)}, ${b.devices} iPad(s)`,
});

const phone = digits(req.phone);
const wantId = String(req.booking_id || '').trim().toUpperCase();
const mine = bookings
  .filter((b) => phone && digits(b.phone) === phone
    && String(b.status || '').trim().toLowerCase() === 'booked'
    && notOver(b))
  .map(summary)
  .sort((a, b) => (a.date + a.start_time).localeCompare(b.date + b.start_time));

if (mine.length === 0) return [{ json: { found: false, reply: 'You have no upcoming iPad bookings to cancel.' } }];

let match = null;
if (wantId) {
  match = mine.find((b) => b.booking_id.toUpperCase() === wantId);
  if (!match) {
    return [{ json: { found: false, reply: `I couldn't find an upcoming booking ${wantId} on your number. Your bookings:\n${mine.map((b) => b.line).join('\n')}`, bookings: mine } }];
  }
} else if (mine.length === 1) {
  match = mine[0];
} else {
  return [{ json: { found: false, needs_booking_id: true, reply: `Which booking should I cancel?\n${mine.map((b) => b.line).join('\n')}`, bookings: mine } }];
}

return [{ json: { found: true, booking_id: match.booking_id, booking: match, reply: `Cancelled ${match.line}` } }];
