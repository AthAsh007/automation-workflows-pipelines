// Preview mode, no SUPPORT_TEAM_EMAIL, or over the test cap: the escalation alert is built in
// full and shown here, and nothing is sent. In every case the customer's email is left
// unanswered for a person.
const cfg = $('config').first().json;
return $input.all().map((i) => ({ json: {
  outcome: i.json.held_by_cap ? 'held: over the test cap'
    : (cfg.mode === 'preview' ? 'preview: escalation not sent' : 'no SUPPORT_TEAM_EMAIL: escalation not sent'),
  reason: i.json.escalation_reason,
  would_alert: i.json.alert_to || '(nobody configured)',
  alert_subject: i.json.alert_subject,
  alert_body: i.json.alert_body
} }));
