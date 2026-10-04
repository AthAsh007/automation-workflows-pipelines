// Turn one Apollo response per organisation into one item per person.
//
// The detail that matters: Apollo hands back placeholders like
// "email_not_unlocked@domain.com" for people whose address costs a credit to reveal. Treated
// as a real address, those are a guaranteed hard bounce. They are dropped here, and the
// organisation is written back as "No contact found" rather than silently looking enriched.
const cfg = $('config').first().json;
const src = $('Apollo configured?');
const replies = $input.all();

const orgFor = (i) => {
  try { return src.itemMatching(i).json; } catch (e) { /* fall through */ }
  return (src.all(0)[i] || src.all()[i] || { json: {} }).json;
};

const placeholder = (email) => {
  const e = String(email || '').toLowerCase();
  return e === '' || e.includes('email_not_unlocked') || e.includes('not_unlocked')
    || e.startsWith('email_') || e.includes('domain.com');
};

const out = [];

replies.forEach((reply, i) => {
  const org = orgFor(i);
  const body = reply.json || {};
  const people = [].concat(body.people || [], body.contacts || []);

  const usable = [];
  let hidden = 0;

  for (const p of people) {
    const email = String(p.email || '').trim().toLowerCase();
    if (placeholder(email)) { hidden++; continue; }
    usable.push({ p: p, email: email });
    if (usable.length >= Number(cfg.max_contacts_per_org || 3)) break;
  }

  if (!usable.length) {
    out.push({
      json: Object.assign({}, org, {
        _no_contact: true,
        _hold_reason: hidden ? 'Apollo has ' + hidden + ' people, no unlocked email' : 'no contact found',
        _apollo_people: people.length,
        _apollo_hidden: hidden,
        _apollo_error: body.error ? String(body.error) : (body.message || '')
      })
    });
    return;
  }

  usable.forEach((u, n) => {
    const p = u.p;
    const phones = [].concat(p.phone_numbers || []);
    out.push({
      json: Object.assign({}, org, {
        _no_contact: false,
        contact_id: org.org_id + '-' + (n + 1),
        full_name: String(p.name || [p.first_name, p.last_name].filter(Boolean).join(' ')).trim(),
        first_name: String(p.first_name || '').trim(),
        title: String(p.title || '').trim(),
        email: u.email,
        contact_phone: String((phones[0] && (phones[0].sanitized_number || phones[0].raw_number)) || '').trim(),
        linkedin: String(p.linkedin_url || '').trim(),
        // Apollo's own guess. Useful, but it is not verification and is never treated as such.
        provider_email_status: String(p.email_status || '').trim(),
        _apollo_people: people.length,
        _apollo_hidden: hidden,
        _from: 'apollo'
      })
    });
  });
});

return out;
