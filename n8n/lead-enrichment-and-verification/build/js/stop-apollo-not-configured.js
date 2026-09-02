// No Apollo key. Rather than fail, fall back to whatever contact details the raw list
// already carries — scraped staff pages and county directories usually give a name, a title
// and an address, which is enough to score and verify. This is also the branch the whole
// workflow runs on during a demo, before any account exists.
const cfg = $('config').first().json;
const col = cfg.org_columns;

return $input.all().map((item) => {
  const org = item.json;
  const row = org._row || {};

  const email = String(row[col.contact_email] || '').trim().toLowerCase();
  const name = String(row[col.contact] || '').trim();
  const title = String(row[col.contact_title] || '').trim();

  if (!email) {
    return {
      json: Object.assign({}, org, {
        _no_contact: true,
        _hold_reason: 'no contact on the row (Apollo not configured)',
        _from: 'sheet'
      })
    };
  }

  return {
    json: Object.assign({}, org, {
      _no_contact: false,
      contact_id: org.org_id + '-1',
      full_name: name,
      first_name: name.split(/\s+/)[0] || '',
      title: title,
      email: email,
      contact_phone: String(row[col.phone] || '').trim(),
      linkedin: '',
      // Nothing from a scrape is treated as verified. That is the verifier's job.
      provider_email_status: '',
      _from: 'sheet'
    })
  };
});
