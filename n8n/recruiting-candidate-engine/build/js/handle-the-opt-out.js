// Somebody said stop. This node builds everything that has to happen, and the important
// property is that it is ONE database call — `stop_all_outreach(client_id, phone)` — not a
// sequence of four that could half-succeed.
//
// Inside that function, in one transaction: the number goes on the opt-out list, and every
// enrollment for that number in any campaign has its next_attempt_at set to null. There is
// no window in which the opt-out is recorded but the queue still holds a scheduled text.
//
// Keyed on the PHONE, not the candidate. One human with three ATS records opts out once.
const cfg = $('config').first().json;
const ev = $input.first().json || {};

const phone = ev.from_number;

// The reply. Legally you may send exactly one confirmation to someone who opted out, and
// nothing after it. It is deliberately plain text with no link and no question.
const confirmation = 'You have been unsubscribed and will not receive further messages '
  + 'from ' + (cfg.client_name || 'us') + '. No further action is needed.';

return [{
  json: {
    _outcome: 'opt-out',
    phone_e164: phone,
    client_id: cfg.client_id || null,
    reason: ev.source === 'retell_call' ? 'asked to stop on a call' : 'SMS keyword',
    matched_text: (ev.body_text || '').slice(0, 200),

    // The single RPC call the next node makes.
    rpc: {
      p_client_id: cfg.client_id || null,
      p_phone: phone,
      p_reason: ev.source === 'retell_call' ? 'voice' : 'sms_keyword'
    },

    // Twilio auto-replies to STOP itself for standard keywords on a US long code, so
    // sending our own confirmation would double-text them. It is only sent for the
    // non-standard phrases Twilio does not catch ("take me off", "remove me").
    _send_confirmation: !/^(stop|stopall|unsubscribe|cancel|end|quit)$/i
      .test(String(ev.body_text || '').trim()),
    confirmation_text: confirmation,

    // Queued for the ATS so the recruiter sees it in the place they actually work, rather
    // than only in a database they never open.
    ats_note: {
      action: 'add_note',
      payload: {
        action: 'Opt-out',
        comments: 'Candidate opted out of SMS/voice outreach on '
          + new Date().toISOString().slice(0, 10)
          + (ev.body_text ? (' — replied: "' + String(ev.body_text).slice(0, 120) + '"') : '')
          + '. All automated outreach for this number has been stopped across every '
          + 'campaign. Do not re-add manually.'
      }
    },

    _next_step: 'Nothing else in the engine can contact this number. The queue view filters '
      + 'on the opt-out table, so even a campaign launched tomorrow will exclude them.'
  }
}];
