// Sending is off (DRY_RUN is still true, or GoHighLevel is not connected). Nothing was sent and
// nothing was written. This node's output IS the result: the exact words, who they were for,
// whether the AI or the template wrote them, and every GoHighLevel write that would follow.
const d = $input.first().json || {};
const w = d._writeback || {};
const wouldWrite = [
  w.fields_note ? 'sequence fields: skipped, ' + w.fields_note : 'sequence fields: touch count and last-touch date',
  'tags: ' + ((w.tags && w.tags.tags) || []).join(', '),
  'note on the contact'
];
if (w.is_final) {
  wouldWrite.push('task for ' + (d.owner || 'the owner') + ': ' + w.task.title);
  wouldWrite.push(w.nurture_enabled ? 'opportunity moved to the nurture stage'
    : 'nurture move skipped: no NURTURE_STAGE id in STAGES (or no opportunity id)');
}
return [{
  json: Object.assign({}, d, {
    _outcome: 'previewed',
    reason_key: 'preview',
    _reason: 'preview — sending is off, nothing was sent or written',
    to: d.channel === 'email' ? d.email : d.phone,
    would_send: d._ghl,
    would_write: wouldWrite
  })
}];
