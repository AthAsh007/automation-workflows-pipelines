// Read the whole tracker once and work out two things: what has gone quiet and needs
// a nudge, and what the board looks like this morning.
const cfg = $('config').first().json;
const C = cfg.columns;
const rows = $input.all().map((i) => i.json);

const val = (row, key) => String(row[C[key]] ?? '').trim();
const openStages = (cfg.open_stages || []).map((s) => s.toLowerCase());

// This one function decides whether anything ever gets chased, so it has to cope with
// every shape a date can arrive in: what we write, what a human types, and what Sheets
// turns a cell into if someone reformats it. A date it cannot read means an enquiry that
// is never chased and nothing to say why - so unreadable is worth being loud about.
const parseWhen = (s) => {
  const raw = String(s ?? '').trim();
  if (!raw) return null;

  // "2026-08-31 09:14" or "2026-08-31" - what this workflow writes.
  const isoish = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
  if (isoish) {
    return new Date(Date.UTC(+isoish[1], +isoish[2] - 1, +isoish[3],
                             +(isoish[4] || 0), +(isoish[5] || 0)));
  }

  // "31/08/2026 09:14" or "31-08-2026" - a person typed it, or Sheets reformatted it.
  // Day-first unless the first number cannot be a day, because this is a UK sheet.
  const slashed = raw.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})(?:[ T](\d{1,2}):(\d{2}))?/);
  if (slashed) {
    let day = +slashed[1], month = +slashed[2];
    if (day > 12 && month <= 12) { /* unambiguous day-first */ }
    else if (month > 12 && day <= 12) { const t = day; day = month; month = t; }
    return new Date(Date.UTC(+slashed[3], month - 1, day, +(slashed[4] || 0), +(slashed[5] || 0)));
  }

  // A bare Google Sheets serial number, whose epoch is 30 Dec 1899.
  if (/^\d+(\.\d+)?$/.test(raw)) {
    const serial = Number(raw);
    if (serial > 20000 && serial < 90000) {
      return new Date(Date.UTC(1899, 11, 30) + Math.round(serial * 86400000));
    }
  }

  const loose = new Date(raw);
  return isNaN(loose.getTime()) ? null : loose;
};

const now = Date.now();
const cutoffMs = (cfg.chase_after_hours || 48) * 3600 * 1000;

const board = {};
const stalled = [];
const noOwnerEmail = [];
let open = 0;

for (let i = 0; i < rows.length; i++) {
  const row = rows[i];
  const ref = val(row, 'ref');
  if (!ref) continue;

  const stage = val(row, 'stage') || 'New';
  board[stage] = (board[stage] || 0) + 1;

  if (!openStages.includes(stage.toLowerCase())) continue;
  open++;

  const touched = parseWhen(val(row, 'last_touch')) || parseWhen(val(row, 'received'));
  const quietFor = touched ? now - touched.getTime() : null;
  const chases = Number(val(row, 'chases_sent')) || 0;

  if (quietFor === null || quietFor < cutoffMs) continue;
  if (cfg.chase_max > 0 && chases >= cfg.chase_max) continue;

  const entry = {
    _row_number: i + 2,
    ref,
    stage,
    owner: val(row, 'owner') || 'Office',
    owner_email: val(row, 'owner_email'),
    company: val(row, 'company') || val(row, 'contact') || val(row, 'email'),
    contact: val(row, 'contact'),
    email: val(row, 'email'),
    phone: val(row, 'phone'),
    area: val(row, 'area'),
    postcode: val(row, 'postcode'),
    next_action: val(row, 'next_action'),
    chases_sent: chases,
    quiet_hours: Math.floor(quietFor / 3600000),
    notes: val(row, 'notes')
  };

  if (entry.owner_email) stalled.push(entry);
  else noOwnerEmail.push(entry);
}

// One email per owner, listing everything of theirs that has gone quiet, rather than
// one email per enquiry. Nobody wants six separate nudges.
const byOwner = {};
for (const s of stalled) {
  const key = s.owner_email.toLowerCase();
  if (!byOwner[key]) byOwner[key] = { owner: s.owner, owner_email: s.owner_email, items: [] };
  byOwner[key].items.push(s);
}
for (const group of Object.values(byOwner)) {
  group.items.sort((a, b) => b.quiet_hours - a.quiet_hours);
}

const groups = Object.values(byOwner);

return [{
  json: {
    _has_stalled: groups.length > 0,
    groups,
    stalled_count: stalled.length,
    no_owner_email: noOwnerEmail,
    board,
    open_count: open,
    rows_read: rows.length,
    cutoff_hours: cfg.chase_after_hours
  }
}];
