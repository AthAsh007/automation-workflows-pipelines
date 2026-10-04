// Decides, for every lead in the pipeline, whether it is DUE the next touch, WAITING for its
// time, or STOPPED — and for a stopped one, why. One item out, carrying all three lists, so a
// single run reads as a report rather than as N separate decisions.
//
// The stop checks run in order and a lead leaves at the first one that applies: leaving an
// open stage beats replying, and both beat the counter.
const cfg = $('config').first().json;
const source = $input.first().json || {};
const rows = source.rows || [];
const seq = cfg.sequence || [];
const open = cfg.open_stages || [];
const maxTouches = Number(cfg.max_touches) || seq.length;
const now = Date.now();

// A timestamp the way the pipeline wrote it, tolerating the shapes a CRM or a sheet hands
// back. An unreadable date is treated as absent, never as "now" — a lead we cannot date is
// not chased on a guess.
function ms(v) {
  const s = String(v || '').trim();
  if (!s) return null;
  let t = Date.parse(s);
  if (isNaN(t)) t = Date.parse(s.replace(' ', 'T'));
  if (isNaN(t)) t = Date.parse(s.replace(' ', 'T') + 'Z');
  return isNaN(t) ? null : t;
}

const due = [], waiting = [], stopped = [], board = {};

for (const r of rows) {
  board[r.stage] = (board[r.stage] || 0) + 1;

  const base = {
    contact_key: r.contact_key, name: r.name, company: r.company, owner: r.owner,
    stage: r.stage, email: r.email, phone: r.phone, contact_id: r.contact_id,
    touches_sent: Number(r.touches_sent) || 0
  };

  const lastTouch = ms(r.last_touch);
  const lastReply = ms(r.last_reply);

  if (cfg.stop_on_stage_move && open.indexOf(r.stage) < 0) {
    stopped.push(Object.assign({}, base, {
      reason: 'left the sequence — stage is ' + (r.stage || 'blank') }));
    continue;
  }
  if (lastReply !== null && (lastTouch === null || lastReply >= lastTouch)) {
    stopped.push(Object.assign({}, base, {
      reason: 'they replied — a person takes it from here' }));
    continue;
  }
  if (base.touches_sent >= maxTouches) {
    stopped.push(Object.assign({}, base, {
      reason: 'the sequence is finished (' + base.touches_sent + ' touches)' }));
    continue;
  }

  const next = seq[base.touches_sent];
  if (!next) {
    stopped.push(Object.assign({}, base, { reason: 'no touch left in the sequence' }));
    continue;
  }

  const age = lastTouch === null ? null : (now - lastTouch) / 3600000;
  if (age === null || age >= Number(next.after_hours)) {
    due.push(Object.assign({}, base, {
      touch: next.touch, channel: next.channel, label: next.label,
      quiet_hours: age === null ? null : Math.round(age)
    }));
  } else {
    waiting.push(Object.assign({}, base, {
      reason: 'not due yet — touch ' + next.touch + ' in ' +
        Math.max(0, Math.round(Number(next.after_hours) - age)) + ' h'
    }));
  }
}

return [{
  json: {
    rows_read: rows.length,
    source: source._from || 'the pipeline',
    more_pages: source.more_pages === true,
    total_available: (source.total_available === undefined) ? null : source.total_available,
    due: due,
    waiting: waiting,
    stopped: stopped,
    board: board,
    due_count: due.length,
    _has_due: due.length > 0
  }
}];
