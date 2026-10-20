// Reads the lead's conversation before a touch goes out, and decides one of three things:
//   send      - nothing new from them, the touch can go
//   replied   - an inbound message arrived after the last touch: stop, hand to the owner
//   opted_out - they asked to stop (OPT_OUT_KEYWORDS / OPT_OUT_PHRASES): stop for good, tag DNC
// An opt-out anywhere in the conversation wins over a reply. Live leads arrive here with the
// GoHighLevel messages (or with no conversation yet); demo leads bring their own `demo_messages`.
// It also prepares the GoHighLevel writes for a stop, so they can be sent or shown as a preview.
const cfg = $('config').first().json;
const lead = $('check the sending window and channel').first().json;
const input = $input.first().json || {};

function ms(v) {
  const s = String(v || '').trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(s)) {
    const t = Date.parse(s.replace(' ', 'T') + 'Z');
    if (!isNaN(t)) return t;
  }
  const t = Date.parse(s);
  return isNaN(t) ? null : t;
}

let messages = [];
let readFrom = 'no conversation yet';
if (lead._demo) {
  messages = lead.demo_messages || [];
  readFrom = 'the demo conversation';
} else if (input.messages) {
  const m = input.messages;
  messages = Array.isArray(m) ? m : (Array.isArray(m.messages) ? m.messages : []);
  readFrom = 'the GoHighLevel conversation';
}

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').replace(/\s+/g, ' ').trim();
const inbound = messages.filter((m) => String(m.direction || '').toLowerCase() === 'inbound');
const optOut = inbound.filter((m) => {
  const b = norm(m.body || m.message);
  return (cfg.opt_out_keywords || []).indexOf(b) >= 0 ||
    (cfg.opt_out_phrases || []).some((p) => b.indexOf(norm(p)) >= 0);
})[0];
const lastTouch = ms(lead.last_touch);
const reply = lastTouch === null ? null : inbound.filter((m) => {
  const t = ms(m.dateAdded || m.date_added || m.createdAt);
  return t !== null && t > lastTouch;
}).pop();

// The owner as a GoHighLevel user id: an OWNERS name maps to its user_id; a live lead already
// carries the assigned user id. Blank means the task is created unassigned.
function ownerId(owner) {
  const list = cfg.owners || [];
  const hit = list.filter((o) => o.owner === owner)[0];
  if (hit) return hit.user_id || '';
  return owner || '';
}
const due = new Date(Date.now() + Number(cfg.task_due_hours || 24) * 3600000).toISOString();
const excerpt = (m) => String((m && (m.body || m.message)) || '').slice(0, 280);

const out = Object.assign({}, lead, { conversation_read_from: readFrom, messages_read: messages.length });

if (optOut) {
  Object.assign(out, {
    _verdict: 'opted_out', _outcome: 'stopped', reason_key: 'opted out',
    _reason: 'opted out — "' + excerpt(optOut).slice(0, 60) + '"; tagged ' + cfg.dnc_tag,
    reply_excerpt: excerpt(optOut),
    _stop_writes: { tags: { tags: [cfg.dnc_tag] } }
  });
} else if (reply) {
  const task = {
    title: 'Reply from ' + (lead.name || 'a lead') + ': take over from the follow-up sequence',
    body: 'They replied after touch ' + lead.touches_sent + ': "' + excerpt(reply) + '"',
    dueDate: due, completed: false
  };
  const uid = ownerId(lead.owner);
  if (uid) task.assignedTo = uid;
  Object.assign(out, {
    _verdict: 'replied', _outcome: 'stopped', reason_key: 'replied',
    _reason: 'they replied in the conversation — handed to ' + (lead.owner || 'the owner'),
    reply_excerpt: excerpt(reply),
    _stop_writes: { tags: { tags: [cfg.replied_tag] }, task: task }
  });
} else {
  out._verdict = 'send';
}

return [{ json: out }];
