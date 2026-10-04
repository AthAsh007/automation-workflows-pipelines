// Pairs each Twilio response back to the intent that produced it, and classifies the
// outcome into one of three things: sent, retry later, or never again.
//
// Pairing is by position within this branch. The Twilio node runs once per item and n8n
// preserves order inside a branch, so the i-th response belongs to the i-th SMS intent.
// It is done here rather than after the merge because the merge interleaves the SMS and
// voice branches and position stops meaning anything.
const cfg = $('config').first().json;
const permanent = (cfg.permanent_sms_errors || []).map(String);

const intents = $('decide the next touch').all()
  .map((i) => i.json)
  .filter((i) => i && i._has_work && i.channel === 'sms');

const responses = $input.all().map((i) => i.json);

// Twilio statuses that mean the message is on its way. `delivered` never appears here —
// it arrives minutes later on the status callback, which workflow 3 handles.
const ACCEPTED = ['queued', 'accepted', 'sending', 'sent', 'scheduled'];

return responses.map((res, idx) => {
  const intent = intents[idx] || {};

  // The HTTP node runs with onError: continueRegularOutput, so a 4xx arrives here as data
  // rather than ending the run. Twilio puts its own code in `code`; n8n wraps transport
  // failures in `error`.
  const err = res && (res.error || (res.status >= 400 ? res : null));
  const twilioCode = res && (res.code || (res.error && res.error.code));
  const sid = res && (res.sid || res.message_sid);
  const status = res && res.status;

  const accepted = !!sid && ACCEPTED.indexOf(String(status)) !== -1;
  const isPermanent = twilioCode && permanent.indexOf(String(twilioCode)) !== -1;

  let outcome;
  if (accepted) outcome = 'sent';
  else if (isPermanent) outcome = 'permanent';
  else if (err || !sid) outcome = 'transient';
  else outcome = 'sent';

  return {
    json: Object.assign({}, intent, {
      provider: 'twilio',
      provider_sid: sid || null,
      provider_status: status || null,
      outcome: outcome,
      error_code: twilioCode ? String(twilioCode) : null,
      error_message: err
        ? String((res.message || (res.error && res.error.message) || 'unknown Twilio error')).slice(0, 500)
        : null,
      // 21610 is Twilio's own opt-out list. Somebody replied STOP directly to the carrier
      // and it never reached our webhook, so this is the only place we learn about it —
      // and it has to be treated as an opt-out, not as a delivery failure.
      _carrier_opt_out: String(twilioCode) === '21610',
      _raw: res
    })
  };
});
