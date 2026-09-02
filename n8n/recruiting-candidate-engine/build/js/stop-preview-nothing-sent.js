// Preview. The queue was read, the ladder was walked, quiet hours were applied and every
// message was rendered — and nothing was sent.
//
// This is the node to have open on a screen-share. It shows the exact text each candidate
// would receive, at their local time, with the segment count next to it.
const cfg = $('config').first().json;
const items = $input.all().map((i) => i.json).filter((i) => i && i._has_work);
const first = items[0] || {};

const sms = items.filter((i) => i.channel === 'sms');
const voice = items.filter((i) => i.channel === 'voice');

return [{
  json: {
    _outcome: 'preview - nothing sent',
    _why: cfg.demo_mode
      ? 'DEMO_MODE is on. It forces preview whatever TEST_RUN says, because a fabricated '
        + 'Twilio response must never be able to reach a real phone.'
      : 'TEST_RUN is true with no TEST_PHONE set.',

    would_send: items.length,
    sms_count: sms.length,
    voice_count: voice.length,
    segments_total: sms.reduce((n, i) => n + (i.segments || 0), 0),
    deferred: (first._deferred || []).length,
    deferred_by_reason: first._deferred_by_reason || {},

    messages: sms.map((i) => ({
      to: i.real_to,
      name: i.candidate_name,
      step: i.step,
      local_time: i.local_hour + ':00 ' + i.timezone,
      segments: i.segments,
      unicode: i._has_unicode,
      body: i.body
    })),

    calls: voice.map((i) => ({
      to: i.real_to,
      name: i.candidate_name,
      step: i.step,
      local_time: i.local_hour + ':00 ' + i.timezone,
      agent: cfg.retell_agent || '(no agent id set)',
      brief: i.agent_note,
      variables_given_to_the_agent: i.retell_vars
    })),

    deferrals: first._deferred || [],

    warnings: [].concat(
      sms.filter((i) => i._long_sms).map((i) =>
        i.candidate_name + ': ' + i.segments + ' segments — you are paying ' + i.segments
          + 'x for this message'),
      sms.filter((i) => i._has_unicode).map((i) =>
        i.candidate_name + ': the template contains a non-ASCII character, which cuts the '
          + 'segment size from 153 to 67'),
      items.filter((i) => i._tz_error).map((i) =>
        i.candidate_name + ': unknown timezone "' + i._tz_error + '", quiet hours fell back to UTC')
    ),

    _next_step: 'Set DEMO_MODE = false, then put your own mobile in TEST_PHONE. Messages '
      + 'really send, to you, prefixed with the number they would have gone to. '
      + 'TEST_RUN = false is the separate, deliberate act that goes live.'
  }
}];
