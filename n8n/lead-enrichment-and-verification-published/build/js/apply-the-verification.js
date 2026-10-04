// Read the verifier's verdict back onto the contact. This node is the bounce-rate KPI.
//
// It fails closed, and that is the whole point: a call that times out, 402s on credits or
// returns something unrecognised becomes "unknown", which is held back, not sent. Every
// other outcome in a cold-email system can be fixed later; a burnt sending domain cannot.
const cfg = $('config').first().json;
const accept = cfg.accept_statuses || [];
const risky = cfg.risky_statuses || [];
const src = $('verification possible?');
const replies = $input.all();

const contactFor = (i) => {
  try { return src.itemMatching(i).json; } catch (e) { /* fall through */ }
  return (src.all(0)[i] || src.all()[i] || { json: {} }).json;
};

const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');

return replies.map((reply, i) => {
  const contact = contactFor(i);
  const body = reply.json || {};

  // MillionVerifier uses "result"; NeverBounce and ZeroBounce use "result"/"status".
  const raw = String(body.result || body.status || body.state || '').toLowerCase().trim();
  const status = raw || 'unknown';

  const verdict = accept.includes(status) ? 'accepted'
    : (risky.includes(status) ? 'risky' : 'rejected');

  return {
    json: Object.assign({}, contact, {
      email_status: status,
      _verdict: verdict,
      _verified: verdict === 'accepted',
      _verified_at: stamp,
      _verifier_role_flag: body.role === true || body.role === 'true',
      _verifier_raw: raw ? '' : JSON.stringify(body).slice(0, 200),
      _verifier_failed: raw === ''
    })
  };
});
