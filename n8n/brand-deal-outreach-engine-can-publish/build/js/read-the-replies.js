// Normalises the sending platform's reply feed into one item shaped {replies}.
//
// Instantly's v2 GET /emails returns sent and received mail together. Only inbound is a
// reply, and only inbound from the last window is a NEW reply — re-classifying yesterday's
// is how a brand gets handed over twice and a person emails them twice.
const cfg = $('config').first().json;
const resp = $('[cred] Instantly - fetch replies').first().json || {};

const failures = [];
let rows = [];
if (resp.error || (!Array.isArray(resp.items) && !Array.isArray(resp.data))) {
  failures.push('replies: ' + ((resp.error && (resp.error.message || resp.error)) ||
    'no response'));
} else {
  rows = Array.isArray(resp.items) ? resp.items : resp.data;
}

if (failures.length) {
  throw new Error('The reply feed returned nothing usable (' + failures.join('; ') +
    '). Refusing to report a quiet inbox — a reply nobody reads is the one thing this ' +
    'workflow exists to prevent.');
}

const replies = rows.filter(function (m) {
  const dir = String(m.email_type || m.direction || '').toLowerCase();
  return dir === 'received' || dir === 'inbound' || m.is_reply === true;
}).map(function (m) {
  const vars = m.lead_data || m.custom_variables || {};
  return {
    reply_id: m.id || m.message_id || '',
    pitch_id: vars.pitch_id || '',
    from_name: m.from_name || vars.first_name || '',
    from: m.from_address_email || m.from || '',
    brand: vars.company_name || m.company_name || '',
    student: vars.creator || '',
    subject: m.subject || '',
    text: String(m.body_text || m.body || m.content || '').slice(0, 4000),
    received_at: m.timestamp_created || m.date || new Date().toISOString(),
    inbox: m.eaccount || m.to_address_email || ''
  };
});

return [{
  json: {
    source: 'instantly',
    read_at: new Date().toISOString(),
    failures: failures,
    replies: replies
  }
}];
