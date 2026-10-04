// A signed, valid event that this workflow deliberately does nothing with. Delivery
// receipts, `call_started`, `call_ended` and unanswered calls all land here.
//
// They are answered 200 — refusing them makes Twilio and Retell retry the same event for
// hours — recorded, and dropped. Being explicit about the ones we ignore is what keeps the
// execution list readable: a run that ends here is not a run that broke.
const ev = $input.first().json || {};

let why;
if (ev.source === 'twilio_status') {
  why = ev._is_delivery_failure
    ? 'delivery failure (' + ev.delivery_status + (ev.error_code ? ', code ' + ev.error_code : '')
      + ') — the attempt row is updated, the ladder is not advanced'
    : 'delivery receipt (' + ev.delivery_status + ') — bookkeeping only, not a reply';
} else if (ev.source === 'retell_call' && !ev._is_final) {
  why = 'Retell "' + ev.event_type + '" — the screening result arrives on call_analyzed, '
    + 'and acting on an earlier event would qualify somebody from a call still in progress';
} else if (ev._no_answer) {
  why = 'the call was not answered (' + (ev.disconnect_reason || ev.call_status)
    + ') — not a rejection. The enrollment stays on its rung and the ladder continues.';
} else if (!ev._understood) {
  why = 'the payload did not match any shape this endpoint knows';
} else {
  why = 'no action defined for intent "' + ev.intent + '"';
}

return [{
  json: {
    _outcome: 'event ignored',
    source: ev.source,
    event_type: ev.event_type,
    intent: ev.intent,
    why: why,
    provider_event_id: ev.provider_event_id,
    _http_status: 200,
    _still_logged: true,
    _next_step: 'Every event is written to inbound_events regardless, so the full history '
      + 'of what arrived is queryable even for the ones nothing was done about.'
  }
}];
