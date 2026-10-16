// Builds one OpenAI chat request per email, asking for a typed classification and nothing
// else. The model never sees the knowledge base here and never writes a reply: it only sorts.
// The whole email rides along on the item so `apply the AI classification` can pair the
// answer back to it.
const cfg = $('config').first().json;

const system = [
  'You sort incoming email for the customer support desk of ' + cfg.company_name + '.',
  'Answer with a JSON object only, with exactly these keys:',
  '  "category": "support" or "not_support"  (support = an existing customer asking for help, reporting a problem or asking about their account; not_support = sales pitches, newsletters, partnership offers, spam, anything else)',
  '  "intent": one of "question", "access", "billing", "complaint", "refund", "legal", "cancellation", "other"',
  '  "handoff": true if a person should answer (angry, a complaint, refund, legal, cancelling), else false',
  '  "confidence": a number from 0 to 1',
  '  "reason": one short sentence',
  'Do not answer the email.'
].join('\n');

return $input.all().map((i) => ({ json: Object.assign({}, i.json, {
  _body: {
    model: cfg.openai_chat_model,
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: 'Subject: ' + i.json.subject + '\n\n' + i.json.body.slice(0, 6000) }
    ]
  }
}) }));
