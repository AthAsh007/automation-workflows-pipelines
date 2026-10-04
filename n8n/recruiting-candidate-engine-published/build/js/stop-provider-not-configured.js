// The run is live, but the provider for this channel has no keys. Used on both the Twilio
// and the Retell false branches.
//
// The touches are marked TRANSIENT, not permanent. A missing key is a configuration
// problem that someone will fix this afternoon, and marking a hundred candidates
// `undeliverable` because of it would quietly retire them from a campaign that is about to
// start working. They back off and come round again instead.
const cfg = $('config').first().json;
const items = $input.all().map((i) => i.json).filter((i) => i && i.enrollment_id);

if (!items.length) return [{ json: { _outcome: 'nothing on this branch', _empty: true } }];

const channel = items[0].channel;
const which = channel === 'voice' ? 'Retell' : 'Twilio';
const missing = channel === 'voice'
  ? ['RETELL_API_KEY', 'RETELL_AGENT_ID'].filter((k) =>
      (k === 'RETELL_API_KEY' ? !cfg.retell_key : !cfg.retell_agent))
  : ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM_NUMBER or TWILIO_MESSAGING_SID']
      .filter((k) => (k === 'TWILIO_ACCOUNT_SID' ? !cfg.twilio_sid
        : (k === 'TWILIO_AUTH_TOKEN' ? !cfg.twilio_token
          : !(cfg.twilio_from || cfg.twilio_messaging_sid))));

return items.map((i) => ({
  json: Object.assign({}, i, {
    provider: channel === 'voice' ? 'retell' : 'twilio',
    provider_sid: null,
    provider_status: null,
    outcome: 'transient',
    error_code: 'not_configured',
    error_message: which + ' is not configured — missing ' + missing.join(', '),
    _carrier_opt_out: false,
    _config_problem: true
  })
}));
