// Decides, for every lead in the pipeline, whether it is DUE the next touch, WAITING for its
// time, or STOPPED, and for a stopped one, why. One item out, carrying all three lists, so a
// single run reads as a report rather than as N separate decisions.
//
// The stop checks run in order and a lead leaves at the first one that applies: an opt-out tag
// beats everything, leaving an open stage beats replying, and both beat the counter.
// Each stopped or waiting lead carries a short `reason_key` the run report groups by.
const cfg = $('config').first().json;
const source = $input.first().json || {};
const rows = source.rows || [];
const seq = cfg.sequence || [];
const open = cfg.open_stages || [];
const maxTouches = Number(cfg.max_touches) || seq.length;
const now = Date.now();

// A timestamp the way the pipeline wrote it, tolerating the shapes a CRM or a sheet hands
// back. A date with no zone ("2026-10-20 09:00") is read as UTC. An unreadable date is treated
// as absent, never as "now": a lead we cannot date is not chased on a guess.
function ms(v) {
  const s = String(v || '').trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(s)) {
    const t = Date.parse(s.replace(' ', 'T') + 'Z');
    if (!isNaN(t)) return t;
  }
  let t = Date.parse(s);
  if (isNaN(t)) t = Date.parse(s.replace(' ', 'T'));
  return isNaN(t) ? null : t;
}

const due = [], waiting = [], stopped = [], board = {}, seen = {};

for (const r of rows) {
  board[r.stage] = (board[r.stage] || 0) + 1;

  const base = {
    contact_key: r.contact_key, name: r.name, company: r.company, owner: r.owner,
    stage: r.stage, email: r.email, phone: r.phone, contact_id: r.contact_id,
    opportunity_id: r.opportunity_id || '',
    touches_sent: Number(r.touches_sent) || 0,
    last_touch: r.last_touch || '', source: r.source || '', wants: r.wants || '',
    notes: r.notes || '', timezone: r.timezone || '', tags: r.tags || []
  };
  if (r._demo) Object.assign(base, {
    _demo: true, demo_local: r.demo_local || null, demo_messages: r.demo_messages || [] });

  const lastTouch = ms(r.last_touch);
  const lastReply = ms(r.last_reply);
  const tags = (r.tags || []).map((t) => String(t).toLowerCase());

  if (cfg.dnc_tag && tags.indexOf(cfg.dnc_tag.toLowerCase()) >= 0) {
    stopped.push(Object.assign({}, base, { reason_key: 'opted out',
      reason: 'opted out earlier (' + cfg.dnc_tag + ' tag)' }));
    continue;
  }
  if (cfg.stop_on_stage_move && open.indexOf(r.stage) < 0) {
    stopped.push(Object.assign({}, base, { reason_key: 'left the sequence',
      reason: 'left the sequence — stage is ' + (r.stage || 'blank') }));
    continue;
  }
  if (lastReply !== null && (lastTouch === null || lastReply >= lastTouch)) {
    stopped.push(Object.assign({}, base, { reason_key: 'replied',
      reason: 'they replied — a person takes it from here' }));
    continue;
  }
  if (base.touches_sent >= maxTouches) {
    stopped.push(Object.assign({}, base, { reason_key: 'finished',
      reason: 'the sequence is finished (' + base.touches_sent + ' touches)' }));
    continue;
  }

  const next = seq[base.touches_sent];
  if (!next) {
    stopped.push(Object.assign({}, base, { reason_key: 'finished',
      reason: 'no touch left in the sequence' }));
    continue;
  }

  const age = lastTouch === null ? null : (now - lastTouch) / 3600000;
  if (age === null || age >= Number(next.after_hours)) {
    // One touch per lead per run: a lead listed twice in the pipeline is touched once.
    if (seen[base.contact_key]) continue;
    seen[base.contact_key] = true;
    due.push(Object.assign({}, base, {
      touch: next.touch, channel: next.channel, label: next.label,
      is_final: next.touch >= maxTouches || base.touches_sent + 1 >= seq.length,
      quiet_hours: age === null ? null : Math.round(age)
    }));
  } else {
    waiting.push(Object.assign({}, base, { reason_key: 'not due yet',
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
