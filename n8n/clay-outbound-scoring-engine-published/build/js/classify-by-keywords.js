// No OPENAI_API_KEY, so the keyword rules classify every reply. Anything they cannot place is
// "needs_human": a person reads it, rather than a rule guessing.
//@include lib-reply-rules.js
return $input.all().map((item) => {
  const r = item.json;
  const k = keywordClass(r.subject, r.text);
  return { json: Object.assign({}, r, { class: k.class, confidence: k.confidence,
    referral_email: k.referral_email, classified_by: 'keyword rules' }) };
});
