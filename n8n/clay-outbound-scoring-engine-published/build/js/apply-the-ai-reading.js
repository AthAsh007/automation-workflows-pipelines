// Reads the model's answer, and does not trust it blindly:
//   * a class outside REPLY_CLASSES, or an answer that does not parse -> the keyword rules
//   * confidence below MIN_AI_CONFIDENCE -> needs_human, a person reads it
//   * a referral email that is not in the reply text is dropped, never used
//   * an unsubscribe the keyword rules catch always wins, whatever the model said
//@include lib-reply-rules.js
const cfg = $('config').first().json;
const classes = cfg.reply_classes || [];
const src = $('build the AI request');

return $input.all().map((reply, i) => {
  let r = {};
  try { r = src.itemMatching(i).json; } catch (e) { r = (src.all()[i] || { json: {} }).json; }
  r = Object.assign({}, r);
  delete r._ai_body;
  const kw = keywordClass(r.subject, r.text);

  let ai = null;
  try {
    const content = reply.json.choices[0].message.content;
    ai = typeof content === 'string' ? JSON.parse(content) : content;
  } catch (e) { ai = null; }

  let out;
  if (!ai || !classes.includes(ai.class)) {
    out = Object.assign({}, kw, { classified_by: 'keyword rules (AI answer did not parse)' });
  } else if (Number(ai.confidence) < Number(cfg.min_ai_confidence || 0.6)) {
    out = { class: 'needs_human', confidence: Number(ai.confidence), referral_email: '',
      classified_by: 'AI (' + cfg.openai_model + '), below MIN_AI_CONFIDENCE' };
  } else {
    const ref = String(ai.referral_email || '').toLowerCase();
    out = { class: ai.class, confidence: Number(ai.confidence),
      referral_email: ref && r.text.toLowerCase().includes(ref) ? ref : '',
      classified_by: 'AI (' + cfg.openai_model + ')' };
  }
  if (kw.class === 'unsubscribe' && out.class !== 'unsubscribe') {
    out = Object.assign({}, kw, { classified_by: 'keyword rules (unsubscribe always wins)' });
  }
  return { json: Object.assign(r, out) };
});
