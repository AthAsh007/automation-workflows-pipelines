// Reads Apollo's people/match answer back onto the prospect it was asked about.
//
// A failed call, an empty match or a locked email comes back as "not found", never as a
// guess: a pattern-built first.last@domain is exactly the address that bounces and burns the
// sending domain. The credit was still spent, and the summary counts it.
const src = $('worth a credit?');
const replies = $input.all();

const prospectFor = (i) => {
  try { return src.itemMatching(i).json; } catch (e) { /* fall through */ }
  return (src.all(0)[i] || { json: {} }).json;
};

return replies.map((reply, i) => {
  const p = Object.assign({}, prospectFor(i));
  const body = reply.json || {};
  const person = body.person || {};
  const email = String(person.email || '').toLowerCase();
  const locked = !email || /not_unlocked|email_not_unlocked/.test(email);

  if (!locked) p.email = email;
  const phone = (person.phone_numbers && person.phone_numbers[0] && person.phone_numbers[0].sanitized_number) || '';
  if (!p.phone && phone) p.phone = phone;
  if (!p.linkedin_url && person.linkedin_url) p.linkedin_url = person.linkedin_url;

  p._enriched = true;
  p._enriched_by = 'Apollo people/match';
  p._enrich_result = locked
    ? (body.error ? 'call failed: ' + String(body.error.message || body.error).slice(0, 120) : 'no verified email found')
    : 'email found';
  delete p._enrich_body;
  return { json: p };
});
