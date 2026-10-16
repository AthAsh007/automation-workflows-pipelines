// AVAILABILITY. With a date, start and end it reports how many iPads are free for that exact
// window. Otherwise it lists the stretches of the school morning where `devices` iPads are free
// for `hours`, on the given date or (no date) over the next SCAN_DAYS days (today included).
// Today counts from now. Closed days and past times are never reported as free.
const cfg = $('Config').first().json._cfg;
const req = $('Config').first().json;
const fleet = $('Sheets - Devices').all().map((i) => i.json || {});
const bookings = $('Sheets - Bookings').all().map((i) => i.json || {});

const STEP = 15; // minutes between candidate start times
const now = $now.setZone(cfg.TIMEZONE);
const today = now.toFormat('yyyy-MM-dd');
const nowMin = now.hour * 60 + now.minute;
const pad = (n) => String(n).padStart(2, '0');
const fmt = (m) => pad(Math.floor(m / 60)) + ':' + pad(m % 60);

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
const isClosed = (ymd) => cfg.CLOSED_WEEKDAYS.includes(DateTime.fromISO(ymd).weekday);
const fleetIds = fleet
  .filter((d) => d.device_id && String(d.status || '').trim().toLowerCase() === 'available')
  .map((d) => String(d.device_id).trim());
function freeCount(date, s, e) {
  const busy = new Set();
  for (const b of bookings) {
    if (String(b.status || '').trim().toLowerCase() === 'cancelled' || toYMD(b.date) !== date) continue;
    const bs = toMin(b.start_time), be = toMin(b.end_time);
    if (bs == null || be == null || bs >= e || be <= s) continue;
    for (const id of String(b.device_ids || '').split('|')) if (id.trim()) busy.add(id.trim());
  }
  return fleetIds.filter((id) => !busy.has(id)).length;
}
const out = (o) => [{ json: Object.assign({ total: fleetIds.length }, o) }];

const openMin = toMin(cfg.SCHOOL_OPEN), closeMin = toMin(cfg.SCHOOL_CLOSE);
const want = Number(req.devices) >= 1 ? Math.floor(Number(req.devices)) : cfg.DEFAULT_DEVICES;
const needMin = Number(req.hours) > 0 ? Math.round(Number(req.hours) * 60) : cfg.DEFAULT_MINUTES;
const date = toYMD(req.date);
const s = toMin(req.start), e = toMin(req.end);

if (req.date && !date) return out({ success: false, reply: 'I couldn\'t read that date. Please send it like 2026-10-14.' });
if (date && date < today) return out({ success: false, reply: 'That date has already passed.' });
if (date && isClosed(date)) return out({ success: false, reply: `School is closed on ${prettyDate(date)}.` });

// Exact window
if (date && s != null && e != null) {
  if (e <= s || s < openMin || e > closeMin) {
    return out({ success: false, reply: `Times must be between ${cfg.SCHOOL_OPEN} and ${cfg.SCHOOL_CLOSE}, and the end must be after the start.` });
  }
  if (date === today && s < nowMin) return out({ success: false, reply: 'That time has already passed. Please pick a later time.' });
  const free = freeCount(date, s, e);
  const label = `${prettyDate(date)} ${fmt(s)}-${fmt(e)}`;
  return out({
    success: true, mode: 'window', date, start: fmt(s), end: fmt(e), free, enough: free >= want,
    reply: free === 0 ? `No iPads are free on ${label}.` : `${free} of ${fleetIds.length} iPads are free on ${label}.`,
  });
}

// Scan for stretches. A stretch is the union of every window of `needMin` that has `want` iPads free,
// so two stretches can touch without a window across the join being free. The reply therefore
// gives start times (from .. last_start), which is never ambiguous.
const days = [];
if (date) days.push(date);
else for (let i = 0; i < cfg.SCAN_DAYS; i++) days.push(now.plus({ days: i }).toFormat('yyyy-MM-dd'));

const stretches = [];
for (const d of days) {
  if (isClosed(d)) continue;
  const from = d === today ? Math.max(openMin, Math.ceil(nowMin / STEP) * STEP) : openMin;
  let cur = null;
  for (let t = from; t + needMin <= closeMin; t += STEP) {
    if (freeCount(d, t, t + needMin) >= want) {
      if (cur && t <= cur.to) cur.to = t + needMin;
      else stretches.push((cur = { date: d, from: t, to: t + needMin }));
    } else cur = null;
  }
  if (!date && stretches.length >= 6) break;
}

const hoursLabel = needMin % 60 === 0 ? `${needMin / 60}h` : `${Math.floor(needMin / 60) ? Math.floor(needMin / 60) + 'h ' : ''}${needMin % 60}min`;
const fits = `${want} iPad${want === 1 ? '' : 's'} for ${hoursLabel}`;
if (stretches.length === 0) {
  return out({ success: true, mode: 'scan', stretches: [], reply: `No free time for ${fits} ${date ? 'on ' + prettyDate(date) : 'in the next ' + cfg.SCAN_DAYS + ' days'}.` });
}
const list = stretches.slice(0, 6).map((x) => ({ date: x.date, from: fmt(x.from), to: fmt(x.to), last_start: fmt(x.to - needMin) }));
const byDay = [];
for (const x of list) {
  const starts = x.from === x.last_start ? x.from : `any time ${x.from}-${x.last_start}`;
  const row = byDay.find((r) => r.date === x.date);
  if (row) row.starts.push(starts);
  else byDay.push({ date: x.date, starts: [starts] });
}
return out({
  success: true, mode: 'scan', devices: want, hours: needMin / 60, stretches: list,
  reply: `Start times that work for ${fits}:\n${byDay.map((r) => `${prettyDate(r.date)}: ${r.starts.join(' or ')}`).join('\n')}`,
});
