// The model is asked ONE thing: what does this customer want? It returns style, karat, length,
// quantity and whether a person should answer. It is never shown a price or a stock level and
// is never asked to write the reply, so it cannot quote a wrong price or promise stock.
const cfg = $('config').first().json;
return $input.all().map((i) => {
  const styles = Object.keys(cfg.styles).join(', ');
  const body = {
    model: cfg.ai_model,
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content:
        'You read WhatsApp messages sent to a gold chain wholesaler. Return JSON only: ' +
        '{"style": one of [' + styles + '] or "", "purity_k": number or null, ' +
        '"length_in": number or null, "qty": number or null, ' +
        '"needs_person": true if they want to order, negotiate, discuss payment, a custom piece, ' +
        'a repair or a complaint, else false, "reason": a few words}. ' +
        'Never invent a value the message does not state.' },
      { role: 'user', content: i.json.text }
    ]
  };
  return { json: Object.assign({}, i.json, { _ai_body: body }) };
});
