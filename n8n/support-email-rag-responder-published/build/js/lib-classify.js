// lib-classify.js: the keyword rules and the decision that reads a classification.
// Inlined by build.js into every node that classifies, so the keyword path and the AI
// fallback can never disagree.
function keywordClassify(email, cfg) {
  const t = ' ' + (email.subject + ' ' + email.body).toLowerCase().replace(/\s+/g, ' ') + ' ';
  const hits = (list) => list.filter((w) => t.indexOf(w.toLowerCase()) !== -1);
  const sup = hits(cfg.support_words);
  const not = hits(cfg.not_support_words);
  const hand = hits(cfg.handoff_words);

  let intent = 'question';
  if (hand.some((w) => /refund|chargeback/.test(w))) intent = 'refund';
  else if (hand.some((w) => /lawyer|legal/.test(w))) intent = 'legal';
  else if (hand.some((w) => /cancel|terminate/.test(w))) intent = 'cancellation';
  else if (hand.length) intent = 'complaint';
  else if (sup.some((w) => /password|login|log in|access|reset/.test(w))) intent = 'access';
  else if (sup.some((w) => /invoice|billing|payment/.test(w))) intent = 'billing';

  if (hand.length) {
    return { category: 'support', intent, handoff: true, confidence: 0.9,
      reason: 'handoff words: ' + hand.join(', ') };
  }
  if (not.length > sup.length) {
    return { category: 'not_support', intent: 'other', handoff: false,
      confidence: Math.min(0.95, 0.6 + 0.1 * (not.length - sup.length)),
      reason: 'not-support words: ' + not.join(', ') };
  }
  if (sup.length) {
    return { category: 'support', intent, handoff: false,
      confidence: Math.min(0.95, 0.55 + 0.1 * sup.length - 0.1 * not.length),
      reason: 'support words: ' + sup.join(', ') };
  }
  return { category: 'support', intent: 'unclear', handoff: false, confidence: 0.3,
    reason: 'no rule matched' };
}

// What happens next, decided in one place from a classification.
//   route: 'not_support' | 'person' | 'answer'
function decideRoute(c, cfg) {
  if (c.category === 'not_support' && c.confidence >= cfg.min_classify_confidence) {
    return { route: 'not_support', route_reason: c.reason };
  }
  if (c.handoff || cfg.handoff_intents.includes(c.intent)) {
    return { route: 'person', route_reason: 'needs a person: ' + c.intent + ' (' + c.reason + ')' };
  }
  if (c.confidence < cfg.min_classify_confidence) {
    return { route: 'person', route_reason: 'classifier unsure (' + c.confidence + ' < '
      + cfg.min_classify_confidence + '): ' + c.reason };
  }
  return { route: 'answer', route_reason: c.reason };
}
