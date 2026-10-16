// Pairs each OpenAI answer back to its email and checks it is the shape that was asked for.
// Anything else (the call failed after its retries, the JSON does not parse, a category or
// intent outside the allowed list) falls back to the keyword rules for that email, and the
// fallback is written on the item so it is visible, not silent.
//@include lib-classify.js

const cfg = $('config').first().json;
const INTENTS = ['question', 'access', 'billing', 'complaint', 'refund', 'legal', 'cancellation', 'other'];

return $input.all().map((item, idx) => {
  const email = Object.assign({}, $('build the classification request').itemMatching(idx).json);
  delete email._body;
  const res = item.json || {};

  let c = null;
  let why = '';
  if (res.error) why = 'AI call failed: ' + String(res.error.message || res.error).slice(0, 160);
  else {
    try {
      const raw = res.choices && res.choices[0] && res.choices[0].message && res.choices[0].message.content;
      const p = JSON.parse(raw);
      const conf = Number(p.confidence);
      if (!['support', 'not_support'].includes(p.category)) why = 'AI answer had no valid category';
      else if (!(conf >= 0 && conf <= 1)) why = 'AI answer had no valid confidence';
      else c = { category: p.category, intent: INTENTS.includes(p.intent) ? p.intent : 'other',
        handoff: p.handoff === true, confidence: Math.round(conf * 100) / 100,
        reason: String(p.reason || '').slice(0, 200) };
    } catch (e) { why = 'AI answer did not parse'; }
  }

  const by = c ? 'AI (' + cfg.openai_chat_model + ')' : 'keyword rules (' + why + ')';
  if (!c) c = keywordClassify(email, cfg);
  return { json: Object.assign(email, c, decideRoute(c, cfg), { classified_by: by }) };
});
