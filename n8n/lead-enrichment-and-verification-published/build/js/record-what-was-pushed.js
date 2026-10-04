// Write back only what the sending engine actually accepted.
//
// A lead Instantly rejected — already in another campaign, blocked, malformed — must not be
// recorded as pushed, or the next run will think it is handled and the person is never
// contacted by anyone. The failure is written into the hold reason instead.
const cfg = $('config').first().json;
const C = cfg.contact_columns;
const src = $('payload for the campaign');
const replies = $input.all();
const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');

const sentFor = (i) => {
  try { return src.itemMatching(i).json; } catch (e) { /* fall through */ }
  return (src.all()[i] || { json: {} }).json;
};

return replies.map((reply, i) => {
  const sent = sentFor(i);
  const body = reply.json || {};

  // Instantly v2 returns the created lead with an id. Anything else is a failure.
  const ok = Boolean(body.id || body.lead_id || body.status === 'success');
  const error = String(body.error || body.message || (body.detail && body.detail.message) || '').slice(0, 200);

  const row = {};
  row[C.contact_id]   = sent._contact_id || '';
  row[C.email]        = sent._email || '';
  row[C.sending_list] = ok ? 'Yes' : 'No';
  row[C.campaign]     = ok ? (sent._campaign_id || '') : '';
  row[C.pushed_at]    = ok ? stamp : '';
  row[C.hold_reason]  = ok ? '' : ('campaign rejected it: ' + (error || 'unknown error'));
  row[C.updated_at]   = stamp;

  return {
    json: Object.assign({}, row, {
      _ok: ok, _email: sent._email, _error: error
    })
  };
});
