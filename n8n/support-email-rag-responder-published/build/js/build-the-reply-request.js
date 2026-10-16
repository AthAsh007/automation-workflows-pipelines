// One OpenAI chat request per email. The model is given the customer's email and the
// retrieved knowledge excerpts, and nothing else, and is told to answer only from them.
// If the excerpts do not answer the question it must say so, and `apply the AI reply` sends
// the email to a person rather than letting a guess go out.
const cfg = $('config').first().json;

const system = [
  'You write email replies for the customer support desk of ' + cfg.company_name + '.',
  'Answer ONLY from the knowledge excerpts provided. Do not use outside knowledge, and do not',
  'promise refunds, discounts, dates or prices that the excerpts do not state.',
  'If the excerpts do not contain what is needed to answer, set "escalate" to true and leave "reply" empty.',
  'Write plain text, friendly and brief (under 170 words), greet the customer by first name if known,',
  'and sign off as: ' + cfg.signature,
  'Answer with a JSON object only: {"reply": string, "used_sources": [ids of the excerpts you used],',
  '"escalate": boolean, "reason": string}'
].join('\n');

return $input.all().map((i) => {
  const excerpts = i.json.matches.filter((m) => m.score >= i.json.match_floor / 2)
    .map((m) => '[' + m.id + '] ' + m.title + '\n' + m.text).join('\n\n');
  return { json: Object.assign({}, i.json, {
    _body: {
      model: cfg.openai_chat_model,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: 'KNOWLEDGE EXCERPTS\n\n' + excerpts
          + '\n\nCUSTOMER EMAIL\nFrom: ' + (i.json.from_name || i.json.from)
          + '\nSubject: ' + i.json.subject + '\n\n' + i.json.body.slice(0, 6000) }
      ]
    }
  }) };
});
