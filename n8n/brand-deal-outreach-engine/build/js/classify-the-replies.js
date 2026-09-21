// One item per reply, with a class and a route.
//
// The rules are ordered and the FIRST match wins, which is why `unsubscribe` and `bounce`
// sit above `interested`. "Please remove me, though the numbers were interesting" is an
// unsubscribe, and getting that precedence wrong is a complaint, not a missed deal.
//
// A reply that matches nothing is `unclear`, routed to a human, and never guessed at. The
// brief pays a person to work the replies; this workflow's job is to put the right ones in
// front of them fast, not to negotiate on their behalf.
const cfg = $('config').first().json;
const feed = $json;

const replies = feed.replies || [];
if (!replies.length) {
  return [{
    json: { _has_replies: false, source: feed.source, read_at: feed.read_at,
      headline: 'No new replies in this window.' }
  }];
}

function classify(text) {
  const t = String(text || '').toLowerCase();
  for (let i = 0; i < cfg.reply_rules.length; i++) {
    const rule = cfg.reply_rules[i];
    for (let w = 0; w < rule.words.length; w++) {
      if (t.indexOf(String(rule.words[w]).toLowerCase()) !== -1) {
        return { klass: rule.klass, route: rule.route, matched: rule.words[w] };
      }
    }
  }
  return { klass: 'unclear', route: 'handover', matched: '' };
}

const counts = {};
const out = replies.map(function (r) {
  const verdict = classify(r.subject + ' ' + r.text);
  counts[verdict.klass] = (counts[verdict.klass] || 0) + 1;
  return {
    json: Object.assign({}, r, {
      _has_replies: true,
      reply_class: verdict.klass,
      route: verdict.route,
      matched_on: verdict.matched,
      // An unclear reply is not a low-priority one. It is the one most likely to be a deal
      // nobody recognised, so it goes to a person with the same urgency as an obvious yes.
      urgent: verdict.route === 'handover',
      source: feed.source
    })
  };
});

out.forEach(function (o) { o.json._counts = counts; });
return out;
