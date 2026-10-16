// Smartlead confirmed (or refused) each unsubscribe. A refusal carries the response.
const src = $('suppressing in Smartlead?');
return $input.all().map((reply, i) => {
  let u = {};
  try { u = src.itemMatching(i).json; } catch (e) { u = (src.all(0)[i] || { json: {} }).json; }
  const b = reply.json || {};
  const failed = !!(b.error || b.ok === false);
  return { json: { _outcome: failed ? 'Smartlead refused the unsubscribe' : 'unsubscribed in Smartlead',
    email: u.email, lead_id: u.lead_id, error: failed ? JSON.stringify(b.error || b).slice(0, 300) : '' } };
});
