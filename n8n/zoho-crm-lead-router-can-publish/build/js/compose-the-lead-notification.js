// The notification that goes out when a lead is routed — their third named automation.
//
// It is composed from the routing decision, not from the Zoho response, on purpose: the team
// should be told who owns a lead even on a run where the Zoho write later fails. A
// notification that only fires on success is a notification that goes silent exactly when
// somebody needs to know.
const cfg = $('config').first().json;

const leads = $input.all().map((i) => i.json || {});
const lines = leads.map((l) => [
  'New lead — ' + (l.full_name || l.last_name || 'unnamed'),
  '  via ' + l.source + (l.company ? ' · ' + l.company : ''),
  '  owner: ' + (l.owner || 'unassigned') + ' · status: ' + l.status,
  '  matched: ' + l._routed_by,
  '  ' + (l.email || l.phone || 'no contact detail')
].join('\n'));

const text = lines.join('\n\n');

return [{
  json: {
    _outcome: 'notification composed',
    _count: leads.length,
    _send: cfg.notify_enabled && cfg.notify_on_new_lead,
    text,
    _notify: { url: cfg.notify_webhook_url, body: { text } }
  }
}];
