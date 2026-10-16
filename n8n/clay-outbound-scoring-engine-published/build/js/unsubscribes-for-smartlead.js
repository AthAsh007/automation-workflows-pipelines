// Every unsubscribe, as a Smartlead call: POST /leads/{lead_id}/unsubscribe takes the lead out
// of every campaign, not just the one they replied to. A reply with no lead id cannot be
// matched, and is listed for a person to remove by hand rather than skipped silently.
const cfg = $('config').first().json;
const unsubs = $input.all().map((i) => i.json).filter((r) => r._suppress);
if (!unsubs.length) return [{ json: { _none: true, _reason: 'no unsubscribes in this batch' } }];
return unsubs.map((r) => ({
  json: {
    email: r.lead_email,
    lead_id: r.lead_id,
    _url: r.lead_id ? cfg.smartlead_api_base + '/leads/' + encodeURIComponent(r.lead_id) + '/unsubscribe' : '',
    _reason: r.lead_id ? '' : 'no Smartlead lead id on the webhook: remove this lead by hand'
  }
}));
