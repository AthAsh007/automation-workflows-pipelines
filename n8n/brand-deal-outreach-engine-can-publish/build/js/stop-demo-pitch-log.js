// STOP: no Airtable — fabricate a week of pitch log so the report is demonstrable.
//
// A week that looks like a real one: volume concentrated on weekdays, a reply rate in the
// low single digits, two booked deals, and a visible block of held pitches. The held block
// is the one worth pointing at on a call — it is what the audit and the deliverability gate
// cost you, and it is the number the client should be arguing about.
const cfg = $('config').first().json;

const DAY = 86400000;
const now = Date.now();
function iso(ms) { return new Date(ms).toISOString(); }

const STUDENTS = [
  ['ST-01', 'Nadia Osei'], ['ST-02', 'Tomas Ferreira'], ['ST-03', 'Priya Raman'],
  ['ST-04', 'Leo Hartmann'], ['ST-05', 'Amara Chike'], ['ST-06', 'Iris Vandermeer']
];
const HOLDS = [
  'only 2 usable facts, needs 3 — the brand record is too thin to say anything specific',
  'template tell: "i hope this email finds you well"',
  'role mailbox (info@) — nobody owns it, and it is where bounce rates come from',
  'every healthy inbox is at its daily ceiling — this rolls to the next run',
  'no fact about the brand itself — this reads as a CV, not as outreach'
];
const CLASSES = ['interested', 'not-interested', 'not-now', 'unsubscribe', 'auto-reply',
  'unclear'];

let seed = 20260908;
function rnd() { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }

const records = [];
let n = 0;
for (let d = Number(cfg.report_window_days || 7) - 1; d >= 0; d--) {
  const at = now - d * DAY;
  const weekday = new Date(at).getDay();
  if (weekday === 0 || weekday === 6) continue;   // nobody pitches at the weekend

  STUDENTS.forEach(function (s) {
    const planned = Number(cfg.pitches_per_student_per_day || 25);
    for (let i = 0; i < planned; i++) {
      n++;
      const held = rnd() < 0.22;
      const replied = !held && rnd() < 0.06;
      const klass = replied ? CLASSES[Math.floor(rnd() * CLASSES.length)] : '';
      const booked = klass === 'interested' && rnd() < 0.35;
      records.push({
        pitch_id: 'P-' + s[0] + '-DEMO-' + n,
        student_id: s[0],
        student: s[1],
        brand: 'Demo brand ' + n,
        state: held ? 'held' : (klass ? 'Replied — with a human' : 'sent'),
        hold_reason: held ? HOLDS[n % HOLDS.length] : '',
        sent_at: held ? '' : iso(at),
        reply_at: replied ? iso(at + 6 * 3600000) : '',
        reply_class: klass,
        booked_at: booked ? iso(at + 2 * DAY) : '',
        deal_value: booked ? [800, 1200, 1500, 2200][n % 4] : ''
      });
    }
  });
}

return [{
  json: {
    source: 'demo',
    read_at: new Date().toISOString(),
    pitches: records,
    _note: 'DEMO PITCH LOG — ' + records.length + ' fabricated rows over the last ' +
           cfg.report_window_days + ' days.'
  }
}];
