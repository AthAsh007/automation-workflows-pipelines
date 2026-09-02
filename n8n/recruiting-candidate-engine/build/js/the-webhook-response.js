// What Twilio and Retell get back, and how fast.
//
// Twilio gives a webhook 15 seconds and Retell about 10. An ATS write-back behind a slow
// OAuth refresh can take longer than that on its own, and a timed-out webhook is retried —
// which is how one candidate reply becomes four identical ATS notes.
//
// So this responds immediately with the minimum the provider needs. Everything slow
// downstream of it is already done by the time this node runs in the happy path, and where
// it is not, the queue in `ats_writebacks` carries it.
const j = $input.first().json || {};
const status = Number(j._http_status) || 200;

// Empty TwiML: acknowledged, no auto-reply. Any reply we do want to send goes out through
// the API instead, so it is logged as an attempt like every other outbound message rather
// than vanishing into a webhook response nothing records.
const twiml = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

const isTwilio = String(j.source || '').indexOf('twilio') === 0;

return [{
  json: {
    _http_status: status,
    _content_type: isTwilio ? 'text/xml' : 'application/json',
    body: isTwilio ? twiml : JSON.stringify({
      ok: status < 400,
      outcome: j._outcome || 'processed',
      handled_at: new Date().toISOString()
    }),
    // Echoed so the execution list shows what was decided without opening three nodes.
    _summary: [j.source, j._outcome, j.headline || j.why || j.reason]
      .filter(Boolean).join(' · ')
  }
}];
