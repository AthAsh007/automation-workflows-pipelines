// Reads the sending platform's answer to each push and turns it into one honest line.
//
// A lead the campaign rejected is NOT recorded as sent. The brief's own words are "log
// every pitch, reply and booked deal in the student's dashboard — accurate and same day",
// and a log that quietly upgrades a 4xx into a send is the thing that makes a student's
// dashboard a lie.
const p = $('payload for the campaign').item.json;
const resp = $json || {};

// Instantly v2 answers with the created lead. A rejection comes back with an error or with
// nothing usable. `a && b` returns b, so the boolean coercion is deliberate.
const ok = !!(resp && !resp.error && (resp.id || resp.lead_id ||
  (resp.data && resp.data.id)));

return [{
  json: Object.assign({}, p, {
    sent: ok,
    lead_id: ok ? (resp.id || resp.lead_id || resp.data.id) : null,
    send_state: ok ? 'sent' : 'failed',
    send_reason: ok ? '' : (
      (resp.error && (resp.error.message || resp.error)) || 'no lead id returned'),
    sent_at: new Date().toISOString(),
    logged_at: new Date().toISOString()
  })
}];
