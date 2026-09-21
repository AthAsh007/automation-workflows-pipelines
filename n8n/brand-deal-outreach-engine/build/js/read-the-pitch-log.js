// Normalises the Airtable pitch log into the same {pitches} shape the demo log produces,
// so the report node never knows which one it got.
const cfg = $('config').first().json;
const F = cfg.pitch_fields;
const resp = $('[cred] Airtable - the pitch log').first().json || {};

if (resp.error || !Array.isArray(resp.records)) {
  throw new Error('The pitch log returned nothing usable (' +
    ((resp.error && (resp.error.message || resp.error)) || 'no response') +
    '). A weekly report built on a failed read would show a quiet week that did not happen.');
}

return [{
  json: {
    source: 'airtable',
    read_at: new Date().toISOString(),
    pitches: resp.records.map(function (r) {
      const f = r.fields || {};
      return {
        pitch_id:    f[F.pitch_id],
        student_id:  f[F.student_id],
        student:     f[F.student],
        brand:       f[F.brand],
        state:       f[F.state],
        hold_reason: f[F.hold_reason],
        sent_at:     f[F.sent_at],
        reply_at:    f[F.reply_at],
        reply_class: f[F.reply_class],
        booked_at:   f[F.booked_at],
        deal_value:  f[F.deal_value]
      };
    })
  }
}];
