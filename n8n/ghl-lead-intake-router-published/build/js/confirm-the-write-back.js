// The touch went out. This checks every write that followed it: the sequence fields, the tags,
// the note, and after the final touch the owner's task and the move to nurture. A write that
// failed does not undo the send; it is listed, and the run report counts it, because a counter
// that was not written back means the next run would see the old count.
const d = $('apply the guardrails').first().json;
const sent = $('[cred] GoHighLevel - send the touch').first().json || {};
const w = d._writeback || {};

const steps = [
  ['sequence fields', $('[cred] GoHighLevel - update the sequence fields').first().json],
  ['tags',            $('[cred] GoHighLevel - add the touch tags').first().json],
  ['note',            $('[cred] GoHighLevel - add a note').first().json]
];
if (w.is_final) {
  steps.push(['owner task', $('[cred] GoHighLevel - create the call task').first().json]);
  if (w.nurture_enabled) steps.push(['move to nurture', $('[cred] GoHighLevel - move to nurture').first().json]);
}

const failed = [];
for (const [label, r] of steps) {
  if (r && r.error) {
    const e = r.error;
    failed.push(label + ': ' + String((e && (e.message || e.description)) || e).slice(0, 160));
  }
}

return [{
  json: Object.assign({}, d, {
    _outcome: 'sent',
    reason_key: 'sent',
    _reason: 'touch ' + d.touch + ' sent by ' + d.channel + (w.is_final ? ', the final one' : ''),
    message_id: sent.messageId || sent.id || '',
    writes_done: steps.map((s) => s[0]),
    write_back_failed: failed.length > 0,
    write_back_errors: failed
  })
}];
