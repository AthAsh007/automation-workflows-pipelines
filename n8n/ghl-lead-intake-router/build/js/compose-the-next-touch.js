// Writes the words and builds the exact GoHighLevel request for each due touch — one object
// you can read and review. NOTHING is sent from here; this node is pure, and its output is
// what the send node below either sends or shows.
//
// The message is the sequence's own line with a greeting and a signature; GoHighLevel's
// conversations endpoint takes an email as {type, contactId, subject, message} and an SMS as
// {type, contactId, message}. Change the endpoint in one place here if your account differs.
const cfg = $('config').first().json;
const base = String(cfg.ghl_api_base || '').replace(/\/+$/, '');
const seq = cfg.sequence || [];

return $input.all().map((item) => {
  const d = item.json || {};
  const t = seq.filter((s) => s.touch === d.touch)[0] || {};
  const channel = (d.channel || t.channel || 'email').toLowerCase();
  const first = String(d.name || '').split(' ')[0] || 'there';

  const body = 'Hi ' + first + ',\n\n' + (t.line || '') +
    (cfg.from_name ? '\n\n— ' + cfg.from_name : '');
  const subject = t.subject || 'Following up on your enquiry';

  const ghlBody = channel === 'email'
    ? { type: 'Email', contactId: d.contact_id, subject: subject,
        message: '<p>' + body.split('\n\n').join('</p><p>').split('\n').join('<br>') + '</p>' }
    : { type: 'SMS', contactId: d.contact_id, message: body };

  return {
    json: Object.assign({}, d, {
      channel: channel,
      subject: channel === 'email' ? subject : '',
      body: body,
      _ghl: { method: 'POST', url: base + '/conversations/messages', body: ghlBody },
      _would_send: ghlBody
    })
  };
});
