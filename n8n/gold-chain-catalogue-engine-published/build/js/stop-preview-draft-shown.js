// Sending is off (TEST_RUN is true with TEST_WHATSAPP blank, or no Twilio sender). Nothing
// was sent to anyone. This node IS the result: the catalogue, the stock list, the owner's
// approval request and every customer message, exactly as they would have gone.
const cfg = $('config').first().json;
const d = $('build the catalogue').first().json;
const p = $input.first().json;
return [{ json: {
  _outcome: 'preview: nothing sent',
  _reason: cfg.twilio_whatsapp_from ? 'mode is ' + cfg.mode : 'no TWILIO_WHATSAPP_FROM, preview only',
  rate: d.rate_24k + ' ' + d.currency + '/g 24k, ' + d.rate_source + ', ' + d.rate_note,
  counts: d.counts,
  held_back: d.held,
  catalogue: d.catalogue,
  stock_list: d.stock_list,
  stock_csv: d.stock_csv,
  owner_approval_request: p.owner_message,
  broadcast_to: p.sends.map((s) => s.name + ' ' + s.to),
  not_sent_to: p.skipped
} }];
