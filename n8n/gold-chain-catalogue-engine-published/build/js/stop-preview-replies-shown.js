// Sending is off (TEST_RUN is true with TEST_WHATSAPP blank, or no Twilio sender). Nothing
// was sent. This node IS the result: each message, how it was read, and the exact reply and
// owner alert it would have produced.
const cfg = $('config').first().json;
return $input.all().map((i) => ({ json: {
  _outcome: 'preview: not sent',
  _reason: cfg.twilio_whatsapp_from ? 'mode is ' + cfg.mode : 'no TWILIO_WHATSAPP_FROM, preview only',
  kind: i.json.kind,
  to: i.json.kind === 'owner' ? 'the owner' : i.json.customer + ' ' + i.json.to,
  they_said: i.json.message,
  read_by: i.json.read_by || '',
  would_send: i.json.body
} }));
