// The Instantly v2 POST /leads body. One lead, with the written pitch attached as custom
// variables so the campaign step can use {{subject}} and {{body}} verbatim.
//
// For Smartlead, change SEND_URL in config and the body here. Nothing else moves.
const cfg = $('config').first().json;
const p = $json;

const campaign = cfg.campaign_by_niche[p.niche] || cfg.campaign_id;

return [{
  json: Object.assign({}, p, {
    campaign: campaign,
    _body: {
      campaign: campaign,
      email: p.to,
      first_name: String(p.contact || '').split(' ')[0],
      last_name: String(p.contact || '').split(' ').slice(1).join(' '),
      company_name: p.brand,
      personalization: p.subject,
      custom_variables: {
        subject: p.subject,
        body: p.body,
        creator: p.student,
        handle: p.handle,
        niche: p.niche,
        sent_from: p.inbox,
        pitch_id: p.pitch_id
      }
    }
  })
}];
