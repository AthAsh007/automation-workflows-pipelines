// One clean reply per incoming Smartlead webhook. Smartlead's payload has changed shape over
// time, so each field is read from the names it has been sent under. The quoted history below
// the reply is cut off: the classifier reads what the person wrote, not our own email back.
const str = (v) => String(v === undefined || v === null ? '' : v).trim();
const firstOf = (o, keys) => { for (const k of keys) { if (str(o[k])) return str(o[k]); } return ''; };

function stripQuoted(text) {
  const lines = str(text).replace(/\r/g, '').split('\n');
  const out = [];
  for (const l of lines) {
    if (/^\s*>/.test(l) || /^On .+wrote:\s*$/.test(l) || /^-{2,}\s*Original Message/i.test(l) || /^From: /.test(l)) break;
    out.push(l);
  }
  return out.join('\n').trim();
}

return $input.all().map((item) => {
  const j = item.json || {};
  const payload = j.incoming || j;
  const b = payload.body !== undefined ? payload.body : payload;
  const msg = b.reply_message || {};
  const raw = typeof msg === 'string' ? msg : (msg.text || str(msg.html).replace(/<[^>]+>/g, ' '));
  return {
    json: {
      lead_email: firstOf(b, ['sl_lead_email', 'lead_email', 'from_email', 'email']).toLowerCase(),
      lead_name: firstOf(b, ['to_name', 'lead_name', 'from_name']),
      lead_id: firstOf(b, ['sl_email_lead_id', 'lead_id', 'sl_lead_id']),
      campaign_id: firstOf(b, ['campaign_id']),
      campaign_name: firstOf(b, ['campaign_name']),
      subject: firstOf(b, ['subject']),
      text: stripQuoted(raw),
      received_at: str(msg.time) || new Date().toISOString(),
      _source: payload._source || 'Smartlead webhook'
    }
  };
});
