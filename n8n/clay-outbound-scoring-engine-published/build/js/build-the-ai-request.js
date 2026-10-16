// The OpenAI request, one per reply. The model gets the subject and the reply text and nothing
// else, and must answer in a fixed JSON schema: one class from REPLY_CLASSES, a confidence, and
// a referral email only if the reply names one. It decides nothing downstream; the class does.
const cfg = $('config').first().json;
const classes = cfg.reply_classes || [];

const system = 'You classify replies to a B2B sales email. Answer with one class:\n' +
  '- interested: wants a call, a demo, pricing or more detail\n' +
  '- not_now: not interested yet, or asks to be contacted later\n' +
  '- referral: says someone else is the right person\n' +
  '- unsubscribe: asks not to be contacted again\n' +
  '- out_of_office: an automatic reply\n' +
  '- needs_human: anything else, including hostile or unclear replies\n' +
  'Only set referral_email if the reply contains that address. Never invent one.';

return $input.all().map((item) => {
  const r = item.json;
  return {
    json: Object.assign({}, r, {
      _ai_body: {
        model: cfg.openai_model,
        temperature: 0,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: 'Subject: ' + r.subject + '\n\n' + r.text.slice(0, 4000) }
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'reply_class',
            strict: true,
            schema: {
              type: 'object',
              additionalProperties: false,
              required: ['class', 'confidence', 'referral_email'],
              properties: {
                class: { type: 'string', enum: classes },
                confidence: { type: 'number' },
                referral_email: { type: 'string' }
              }
            }
          }
        }
      }
    })
  };
});
