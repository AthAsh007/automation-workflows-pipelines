// With USE_OPENAI = false there is no model to write the reply, so it is assembled from the
// best-matching knowledge entry with a fixed template. It is plainer than a written answer,
// and every sentence in it is from the knowledge base, which is the property that matters.
const cfg = $('config').first().json;

return $input.all().map((i) => {
  const best = i.json.matches[0];
  const first = String(i.json.from_name || '').split(/\s+/)[0] || 'there';
  const reply = [
    'Hi ' + first + ',',
    '',
    'Thanks for getting in touch. ' + best.text,
    '',
    'If that does not sort it out, just reply to this email and someone from the team will pick it up.',
    '',
    cfg.signature
  ].join('\n');
  return { json: Object.assign({}, i.json, {
    reply_text: reply,
    used_sources: [best.id],
    written_by: 'template, from the knowledge base',
    reply_ok: true,
    reply_problem: ''
  }) };
});
