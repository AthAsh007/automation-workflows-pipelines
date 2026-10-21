// LinkedIn is still refusing, and the channel was already told within ALERT_REPEAT_HOURS.
//
// Not silent: the run still ends here with the reason, and the execution list shows it. It just
// does not post the same alert again five minutes after the last one.
const cfg = $('config').first().json;
const s = $json;

return [{
  json: {
    _stopped: 'LinkedIn alert already sent',
    _mode: cfg.mode,
    _slug: s._slug,
    _token_problem: true,
    _reason: '[BLOCKED] ' + s._reason + ' (channel alerted ' + s._hours_since_alert
      + 'h ago; next alert after ' + cfg.alert_repeat_hours + 'h)',
    _at: new Date().toISOString()
  }
}];
