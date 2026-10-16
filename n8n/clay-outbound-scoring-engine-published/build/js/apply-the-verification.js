// Reads the verifier's verdict back onto the prospect. It fails closed: a timeout, a credit
// error or an answer it does not recognise becomes "unknown", which is held from the campaign.
// A bounced cold email costs more than a lead that waited a day.
const cfg = $('config').first().json;
const accept = (cfg.accept_statuses || []).map((s) => String(s).toLowerCase());
const src = $('verify with a key?');
const replies = $input.all();

const prospectFor = (i) => {
  try { return src.itemMatching(i).json; } catch (e) { /* fall through */ }
  return (src.all(0)[i] || { json: {} }).json;
};

return replies.map((reply, i) => {
  const p = Object.assign({}, prospectFor(i));
  const body = reply.json || {};
  const status = String(body.result || body.status || body.state || '').toLowerCase().trim() || 'unknown';
  p.email_status = status;
  p._verified = accept.includes(status);
  p._verified_by = 'verifier';
  return { json: p };
});
