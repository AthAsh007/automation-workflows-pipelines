// The request was not signed by anyone we trust. It is refused, logged, and answered with
// a 403 — and nothing downstream of this node ever sees it.
//
// This branch existing is the point. A public webhook that can opt a candidate out and
// write into a client's ATS has to be able to say no, and it has to say no by default when
// a secret is missing rather than when a secret is wrong.
const cfg = $('config').first().json;
const v = $input.first().json || {};

return [{
  json: {
    _outcome: 'signature rejected',
    source: v._source,
    reason: v._reason,
    signature_headers_present: v.headers_seen || [],
    signed_url_we_used: v._signed_url || '(n/a)',
    mode: cfg.mode,
    _http_status: 403,
    _next_step: v._source === 'twilio'
      ? 'Almost always the URL. Twilio signs the exact public URL it posted to, so behind '
        + 'a reverse proxy n8n sees the internal one and the HMAC will never match. Set '
        + 'TWILIO_STATUS_CALLBACK in config to the exact URL in the Twilio console.'
      : (v._source === 'retell'
        ? 'Check RETELL_WEBHOOK_SECRET matches the signing secret in the Retell dashboard.'
        : 'No signature header arrived at all. If this was a manual curl, that is expected '
          + '— set DEMO_MODE or TEST_RUN so preview lets unsigned requests through.')
  }
}];
