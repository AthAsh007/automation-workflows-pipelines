// Pairs each Retell response back to the voice intent that produced it.
//
// A Retell create-call response only means the call was REGISTERED. Whether anyone picked
// up, what they said and whether they qualify all arrive later on the `call_analyzed`
// webhook, which workflow 3 handles. Treating a 201 here as "the candidate was screened"
// is the mistake that makes a voice pipeline report numbers nobody can reconcile.
const intents = $('decide the next touch').all()
  .map((i) => i.json)
  .filter((i) => i && i._has_work && i.channel === 'voice');

const responses = $input.all().map((i) => i.json);

return responses.map((res, idx) => {
  const intent = intents[idx] || {};

  const callId = res && (res.call_id || res.callId || (res.data && res.data.call_id));
  const err = res && (res.error || res.message || (res.status >= 400 ? res : null));
  const status = res && (res.call_status || res.status);

  // Retell rejects a call it cannot place at all — no agent, no from-number, a number it
  // will not dial. Those are configuration, not a bad moment, and retrying them every
  // fifteen minutes just burns the log.
  const text = String((res && (res.message || res.error_message)) || '').toLowerCase();
  const isPermanent = !callId && (
    text.includes('agent') || text.includes('not found') || text.includes('invalid')
    || text.includes('unsupported') || text.includes('forbidden'));

  return {
    json: Object.assign({}, intent, {
      provider: 'retell',
      provider_sid: callId || null,
      provider_status: status || (callId ? 'registered' : null),
      outcome: callId ? 'sent' : (isPermanent ? 'permanent' : 'transient'),
      error_code: callId ? null : String((res && res.code) || 'retell_error'),
      error_message: callId ? null : String(err || 'no call_id returned').slice(0, 500),
      _carrier_opt_out: false,
      // The call is registered and the result is pending. The enrollment does NOT advance
      // to "responded" here; only the webhook can do that.
      _awaiting_webhook: !!callId,
      _raw: res
    })
  };
});
