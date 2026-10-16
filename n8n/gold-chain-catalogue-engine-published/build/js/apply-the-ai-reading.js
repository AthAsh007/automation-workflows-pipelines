// Merges the model's reading over the keyword read, field by field. A field the model left
// empty keeps the keyword value; an answer that does not parse keeps the keyword read whole.
// A style the model returns that is not in STYLES is ignored rather than trusted.
const cfg = $('config').first().json;
const asked = $('build the AI request').all();
return $input.all().map((resp, idx) => {
  const base = (asked[idx] || asked[0]).json;
  const out = Object.assign({}, base);
  delete out._ai_body;
  let ai = null;
  try { ai = JSON.parse(resp.json.choices[0].message.content); } catch (e) { ai = null; }
  if (!ai || typeof ai !== 'object') return { json: Object.assign(out, { read_by: 'keyword rules (AI answer did not parse)' }) };
  const want = Object.assign({}, base.want);
  if (ai.style && cfg.styles[ai.style]) want.style = ai.style;
  for (const f of ['purity_k', 'length_in', 'qty']) if (Number(ai[f]) > 0) want[f] = Number(ai[f]);
  return { json: Object.assign(out, {
    want,
    handoff_word: base.handoff_word || (ai.needs_person === true ? 'AI: ' + (ai.reason || 'needs a person') : ''),
    read_by: 'AI (' + cfg.ai_model + ')'
  }) };
});
