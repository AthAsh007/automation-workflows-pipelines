// Writes the template version of the touch (the SEQUENCE line with a greeting, and for SMS the
// opt-out line), and the request the AI writer would get. NOTHING is sent from here.
//
// The template text is always built: it is what goes out when the AI writer is not configured,
// fails, or writes something that breaks a guardrail. The AI request carries only the lead
// context it needs (service wanted, source, stage, notes, touch number) and the rules it must
// follow; the guardrails are still enforced in code after it.
const cfg = $('config').first().json;
const seq = cfg.sequence || [];
const d = $input.first().json || {};
const t = seq.filter((s) => s.touch === d.touch)[0] || {};
const channel = (d.channel || t.channel || 'email').toLowerCase();
const first = String(d.name || '').split(' ')[0] || 'there';
const optOutLine = cfg.sms_opt_out_line || 'Reply STOP to opt out';

const templateBody = channel === 'sms'
  ? 'Hi ' + first + ', ' + (t.line || '') + ' ' + optOutLine
  : 'Hi ' + first + ',\n\n' + (t.line || '');
const templateSubject = channel === 'email' ? (t.subject || 'Following up on your enquiry') : '';

const rules = [
  'You write one short follow-up message from a small business to a lead who has gone quiet.',
  'Plain, friendly, first person, no emojis, no signature, no placeholders in brackets.',
  'Never mention prices, costs, discounts, offers, refunds, guarantees or promises, and never invent facts.',
  'Use only the lead details you are given.',
  channel === 'sms'
    ? 'This is an SMS. Leave "subject" empty. Keep "body" under ' + cfg.sms_max_chars +
      ' characters and end it with exactly: "' + optOutLine + '"'
    : 'This is an email. Keep "subject" under ' + cfg.subject_max_chars + ' characters and "body" under ' +
      cfg.email_max_chars + ' characters. Start the body with "Hi ' + first + ',".',
  'Reply with JSON only: {"subject": "...", "body": "..."}'
].join(' ');

const context = {
  first_name: first,
  company: d.company || '',
  service_wanted: d.wants || '',
  source: d.source || '',
  stage: d.stage || '',
  notes: d.notes || '',
  touch_number: d.touch,
  touches_in_sequence: cfg.max_touches,
  purpose: t.label || '',
  channel: channel,
  example_line: t.line || ''
};

return [{
  json: Object.assign({}, d, {
    channel: channel,
    template_subject: templateSubject,
    template_body: templateBody,
    _ai_request: {
      model: cfg.ai_model,
      temperature: cfg.ai_temperature,
      messages: [
        { role: 'system', content: rules },
        { role: 'user', content: JSON.stringify(context) }
      ]
    },
    _template_ready: true
  })
}];
