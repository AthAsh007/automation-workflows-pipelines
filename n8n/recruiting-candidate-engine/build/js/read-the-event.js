// One endpoint, three kinds of event. This node normalises all of them into the same
// object so nothing downstream has to know which provider it came from.
//
//   twilio_sms      a candidate replied to a text
//   twilio_status   a delivery receipt (delivered / undelivered / failed)
//   retell_call     an AI screening call finished and was analysed
//
// It also decides the INTENT of an inbound message, and the order of those checks is the
// part that matters. Opt-out is tested first, on the raw text, before any AI is involved —
// because "stop calling me, I already told the last guy" contains both an opt-out and a
// sentence a classifier could easily read as engagement.
const cfg = $('config').first().json;
const v = $input.first().json || {};
const b = v.body || {};

const str = (x) => (x === null || x === undefined ? '' : String(x).trim());
const norm = (s) => str(s).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

function toE164(value) {
  const raw = str(value);
  const cleaned = raw.replace(/[\s()-]/g, '');
  if (/^\+[1-9]\d{7,14}$/.test(cleaned)) return cleaned;
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 11 && digits[0] === '1') return '+' + digits;
  if (digits.length === 10) return '+1' + digits;
  return null;
}

let out = {
  _understood: false,
  source: v._source || 'unknown',
  event_type: '',
  provider_event_id: '',
  from_number: null,
  body_text: '',
  intent: 'unclear',
  _signature_verified: v._verified === true,
  _unverified_but_allowed: v._unverified_but_allowed === true
};

// ---------------------------------------------------------------- Twilio
if (b.MessageSid || b.SmsSid || b.MessageStatus || b.SmsStatus) {
  const status = str(b.MessageStatus || b.SmsStatus).toLowerCase();
  const hasText = b.Body !== undefined;

  if (hasText && !status) {
    out.source = 'twilio_sms';
    out.event_type = 'inbound_sms';
    out.provider_event_id = str(b.MessageSid || b.SmsSid);
    out.from_number = toE164(b.From);
    out.body_text = str(b.Body);
    out._understood = !!out.from_number;
  } else {
    out.source = 'twilio_status';
    out.event_type = status || 'status';
    out.provider_event_id = str(b.MessageSid || b.SmsSid) + ':' + status;
    out.from_number = toE164(b.To);
    out.delivery_status = status;
    out.error_code = str(b.ErrorCode) || null;
    // A delivery receipt is bookkeeping, not a reply. It updates the attempt row and
    // stops. The one exception is a hard failure, which retires the number.
    out._is_delivery_failure = ['undelivered', 'failed'].indexOf(status) !== -1;
    out._understood = true;
  }
}

// ---------------------------------------------------------------- Retell
else if (b.event || b.call || b.call_id) {
  const call = b.call || b;
  const ev = str(b.event || 'call_analyzed');
  out.source = 'retell_call';
  out.event_type = ev;
  out.provider_event_id = str(call.call_id || b.call_id);
  out.from_number = toE164(call.to_number || call.to || b.to_number);
  out.call_status = str(call.call_status || b.call_status);
  out.disconnect_reason = str(call.disconnection_reason || '');
  out.duration_seconds = Number(call.duration_ms ? call.duration_ms / 1000
    : (call.duration_seconds || 0)) || 0;
  out.transcript = str(call.transcript).slice(0, 8000);
  out.recording_url = str(call.recording_url);

  // The structured answers. This is the ONLY part of the call the engine makes a decision
  // from — the transcript is stored for a human, and the summary is stored for a human,
  // and neither is parsed. An LLM that writes prose into a decision path is a bug.
  const analysis = call.call_analysis || b.call_analysis || {};
  out.call_summary = str(analysis.call_summary).slice(0, 2000);
  out.answers = analysis.custom_analysis_data || analysis.extracted || {};
  out.agent_sentiment = str(analysis.user_sentiment);

  // Only a call that was actually analysed carries answers. `call_started` and
  // `call_ended` arrive first and must not be mistaken for a screening result.
  out._is_final = ev === 'call_analyzed';
  out._no_answer = ['no-answer', 'voicemail', 'dial_no_answer', 'dial_busy', 'dial_failed']
    .indexOf(out.disconnect_reason) !== -1
    || ['no_answer', 'busy', 'failed'].indexOf(out.call_status) !== -1;
  out._understood = !!out.provider_event_id;
}

// ---------------------------------------------------------------- Intent
// Only inbound text gets an intent. Word-boundary matching, so "not interested" is not
// read as "interested" and a message containing "stopping by" is not an opt-out.
if (out.source === 'twilio_sms') {
  const text = norm(out.body_text);
  const words = text.split(' ');
  const containsPhrase = (list) => list.some((p) => {
    const phrase = norm(p);
    if (!phrase) return false;
    if (phrase.indexOf(' ') !== -1) return text.indexOf(phrase) !== -1;
    return words.indexOf(phrase) !== -1;
  });

  if (containsPhrase(cfg.opt_out_keywords)) out.intent = 'opt_out';
  else if (containsPhrase(cfg.negative_keywords)) out.intent = 'not_interested';
  else if (containsPhrase(cfg.positive_keywords)) out.intent = 'interested';
  else if (text.indexOf('?') !== -1 || out.body_text.indexOf('?') !== -1) out.intent = 'question';
  else out.intent = 'unclear';

  // Whatever the intent, an inbound message stops the sequence. Someone who wrote back is
  // a conversation, and a robot texting over the top of a human reply is the single most
  // visible way this kind of system embarrasses an agency.
  out._stop_sequence = true;
}

if (out.source === 'retell_call') {
  out._stop_sequence = out._is_final && !out._no_answer;
}

out.client_id = cfg.client_id || null;
out.received_at = new Date().toISOString();
out._raw = b;

return [{ json: out }];
