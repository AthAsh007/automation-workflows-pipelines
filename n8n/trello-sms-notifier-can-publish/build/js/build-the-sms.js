// Build the SMS body from the template in config and the card fields. This node runs
// whether or not Twilio is configured — the message is constructed the same way either
// way, so the preview shows exactly what would be sent.

const cfg = $('config').first().json;
const lead = $json;

// Simple {{key}} substitution. Unknown keys are left as-is so the gap is visible.
function render(tpl, fields) {
  return tpl.replace(/\{\{(\w+)\}\}/g, (m, key) => {
    const v = fields[key];
    return (v !== undefined && v !== null && v !== '') ? String(v) : m;
  });
}

const fields = {
  contact_name:  lead.contact_name || 'there',
  card_name:     lead.card_name || '',
  company:       lead.company || '',
  budget:        lead.budget || '',
  timeline:      lead.timeline || '',
  url:           lead.card_url || '',
  phone:         lead.phone || ''
};

const body = render(cfg.sms_template, fields);

// In DRY_RUN mode and a trench phone is set, that is WHERE the SMS would go — so the
// operator can see a real message land on their own device. Otherwise the body is shown
// on the STOP node.
const to = (cfg.dry_run && cfg.trench_phone) ? cfg.trench_phone : (lead.phone || '');

return [{
  json: {
    _sms_to: to,
    _sms_body: body,
    _sms_from: cfg.twilio_from_number,
    contact_name: lead.contact_name,
    card_name: lead.card_name,
    phone: lead.phone,
    company: lead.company,
    summary: lead.summary
  }
}];
