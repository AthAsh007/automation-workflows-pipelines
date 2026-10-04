// Build one Instantly lead per safe contact, and only the safe ones.
//
// The custom variables are the reason the email can be short and specific — {{firstName}},
// {{organisation}} and {{county}} are what let one sequence read as though it were written
// for a discharge planner in Lakeshore County rather than mail-merged at 2,000 people.
const cfg = $('config').first().json;

const contacts = $('decide who is safe to email').all()
  .map((i) => i.json)
  .filter((c) => c._push === true);

return contacts.map((c) => ({
  json: {
    _body: {
      campaign: c._campaign_id || cfg.campaign_id,
      email: c.email,
      first_name: c.first_name || '',
      last_name: String(c.full_name || '').split(/\s+/).slice(1).join(' '),
      company_name: c.org_name || '',
      personalization: c.first_name || 'there',
      phone: c.contact_phone || '',
      website: c.domain || '',
      custom_variables: {
        organisation: c.org_name || '',
        county: c.county || '',
        city: c.city || '',
        segment: c.category || '',
        title: c.title || '',
        icp_score: Number(c.score || 0),
        tier: c.tier || '',
        email_status: c.email_status || '',
        org_id: c.org_id || '',
        contact_id: c.contact_id || ''
      },
      skip_if_in_workspace: true,
      verify_leads_on_import: false
    },
    _contact_id: c.contact_id,
    _email: c.email,
    _campaign_id: c._campaign_id || cfg.campaign_id,
    _mode: cfg.mode
  }
}));
