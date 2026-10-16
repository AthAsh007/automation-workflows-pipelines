// The keyword rules, in order. First match wins, so the order is the policy: an unsubscribe
// beats everything, and an auto-reply is never mistaken for interest.
//
// Only the reply's own text is read, never the subject line: a reply's subject is "Re:" plus
// OUR subject, and a word in our own copy ("your Q4 pipeline") must not decide what the
// prospect meant. The one exception is the auto-reply check, where "Automatic reply:" in the
// subject is the strongest signal there is.
function keywordClass(subject, text) {
  const t = String(text || '').toLowerCase();
  const subj = String(subject || '').toLowerCase();
  const email = (String(text || '').match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i) || [''])[0].toLowerCase();
  const ooo = /(out of (the )?office|automatic reply|auto-?reply|on (annual )?leave|limited access to email|away until)/;
  const rules = [
    ['unsubscribe', (x) => /(unsubscribe|remove me|take me off|stop (emailing|contacting)|do not (email|contact)|opt(-| )?out)/.test(x)],
    ['out_of_office', (x) => ooo.test(x) || ooo.test(subj)],
    ['referral', (x) => /(not the right person|wrong person|loop in|reach out to|speak (to|with) (our|my)|better contact)/.test(x)],
    ['not_now', (x) => /(not (a )?priority|not right now|not now|circle back|next (quarter|year)|\bq[1-4]\b|later this year|not interested)/.test(x)],
    ['interested', (x) => /(interested|sounds good|let'?s (talk|chat|meet)|book|slots?|call|demo|pricing|how much|send (me )?(more|details)|timing is (actually )?good)/.test(x)]
  ];
  for (const [cls, test] of rules) {
    if (test(t)) {
      if (cls === 'referral' && !email) return { class: 'referral', confidence: 0.6, referral_email: '' };
      return { class: cls, confidence: 0.75, referral_email: cls === 'referral' ? email : '' };
    }
  }
  return { class: 'needs_human', confidence: 0.5, referral_email: '' };
}
