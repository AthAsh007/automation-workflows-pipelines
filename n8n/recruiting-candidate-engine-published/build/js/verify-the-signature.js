// Webhook security. This endpoint is a public URL that can opt a candidate out, cancel a
// campaign and write into the client's ATS, so anything arriving unsigned is refused.
//
// Two providers, two algorithms, both implemented properly:
//
//   Twilio   X-Twilio-Signature — HMAC-SHA1, base64, over the full request URL with the
//            POST parameters appended in alphabetical key order. Reconstructing that from
//            the parsed form body IS the documented algorithm, not an approximation.
//
//   Retell   X-Retell-Signature — HMAC-SHA256, hex, over the JSON payload. Retell's own
//            SDK signs JSON.stringify(body), so stringifying the parsed body matches.
//
// It fails CLOSED. If no secret is configured, or the platform gives us no way to compute
// an HMAC, a live run rejects the request rather than trusting it. Only preview mode is
// allowed to wave an unverified event through, and it says so in the output.
const cfg = $('config').first().json;
const req = $input.first().json || {};
const headers = req.headers || {};
const body = req.body !== undefined ? req.body : req;
const query = req.query || {};

const lower = {};
for (const k of Object.keys(headers)) lower[String(k).toLowerCase()] = headers[k];

const twilioSig = lower['x-twilio-signature'] || '';
const retellSig = lower['x-retell-signature'] || '';
const source = twilioSig ? 'twilio' : (retellSig ? 'retell' : 'unknown');

// Web Crypto is a global in the n8n sandbox and in Node 18+, so no require() and no
// instance env var is needed for this to work on n8n Cloud.
async function hmac(algo, secret, message, encoding) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: algo }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  const bytes = new Uint8Array(sig);
  if (encoding === 'hex') {
    let out = '';
    for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, '0');
    return out;
  }
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

// Length-independent comparison. A timing attack on a webhook is unlikely; writing the
// comparison correctly costs three lines.
function safeEqual(a, b) {
  const x = String(a || '');
  const y = String(b || '');
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    diff |= (x.charCodeAt(i) || 0) ^ (y.charCodeAt(i) || 0);
  }
  return diff === 0;
}

const result = {
  _source: source,
  _verified: false,
  _reason: '',
  headers_seen: Object.keys(lower).filter((h) => h.indexOf('signature') !== -1),
  body: body,
  query: query
};

try {
  if (source === 'twilio') {
    if (!cfg.twilio_token) {
      result._reason = 'no TWILIO_AUTH_TOKEN configured — cannot verify';
    } else {
      // The URL Twilio signed. It must be the externally visible one; behind a proxy the
      // node sees http:// and the wrong host, which is the usual cause of a signature that
      // "should" match and does not.
      const url = cfg.twilio_status_callback
        || (lower['x-forwarded-proto'] || 'https') + '://' + (lower['x-forwarded-host']
            || lower.host || '') + (req.path || req.webhookUrl || '');
      const params = (body && typeof body === 'object') ? body : {};
      const signedString = Object.keys(params).sort().reduce(
        (acc, k) => acc + k + (params[k] === null || params[k] === undefined ? '' : params[k]),
        url);
      const expected = await hmac('SHA-1', cfg.twilio_token, signedString, 'base64');
      result._verified = safeEqual(expected, twilioSig);
      result._reason = result._verified ? 'twilio signature ok'
        : 'twilio signature mismatch — check that TWILIO_STATUS_CALLBACK in config is the '
          + 'exact public URL configured in the Twilio console, including https and any path';
      result._signed_url = url;
    }
  } else if (source === 'retell') {
    if (!cfg.retell_secret) {
      result._reason = 'no RETELL_WEBHOOK_SECRET configured — cannot verify';
    } else {
      const payload = typeof body === 'string' ? body : JSON.stringify(body);
      const expected = await hmac('SHA-256', cfg.retell_secret, payload, 'hex');
      const provided = String(retellSig).replace(/^v=/, '');
      result._verified = safeEqual(expected, provided);
      result._reason = result._verified ? 'retell signature ok' : 'retell signature mismatch';
    }
  } else {
    result._reason = 'no recognised signature header on the request';
  }
} catch (e) {
  result._reason = 'signature check errored: ' + String(e && e.message ? e.message : e);
}

// Preview may proceed unverified so the workflow can be demonstrated with a curl. A live
// run may not, ever.
result._allow = result._verified || (!cfg.live_send && !cfg.writeback_enabled);
result._unverified_but_allowed = result._allow && !result._verified;

return [{ json: result }];
