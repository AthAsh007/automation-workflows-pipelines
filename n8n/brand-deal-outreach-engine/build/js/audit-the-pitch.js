// The personalisation gate. Their third hard gate, made checkable.
//
// > Sharp written English — pitches read human and personal from line one. Never templated.
// > NOT A FIT: your own application reads copy-paste.
//
// Five checks, and a pitch that fails any of them is HELD, not softened and sent:
//
//   1. enough facts    at least MIN_FACTS specific details drawn from the records, of
//                      which at least MIN_BRAND_FACTS must be about the BRAND. A pitch
//                      made mostly of the creator's own numbers is a CV, not outreach.
//   2. no template tells   nothing from BANNED_PHRASES survives.
//   3. length          inside MIN_WORDS..MAX_WORDS.
//   4. real recipient  not a role mailbox, not suppressed, a plausible address.
//   5. no invention    every number in the body appears in the facts. A model that
//                      rounds 84,000 up to "nearly 100k" has fabricated a media kit.
//
// Held pitches are not failures of the run. They are the run doing its job, and every one
// of them is listed with the reason.
const cfg = $('config').first().json;
const p = $json;

const holds = [];
const body = String(p.body || '');
const subject = String(p.subject || '');
const lower = (subject + ' ' + body).toLowerCase();

// 1. facts
if (Number(p.fact_count || 0) < Number(cfg.min_facts || 0)) {
  holds.push('only ' + (p.fact_count || 0) + ' usable facts, needs ' + cfg.min_facts +
    ' — the brand record is too thin to say anything specific');
}
if (Number(p.brand_fact_count || 0) < Number(cfg.min_brand_facts || 1)) {
  holds.push('only ' + (p.brand_fact_count || 0) + ' fact(s) about the brand itself, needs ' +
    cfg.min_brand_facts + ' — this reads as a CV, not as outreach');
}

// 2. template tells
const tells = (cfg.banned_phrases || []).filter(function (phrase) {
  return lower.indexOf(phrase) !== -1;
});
if (tells.length) holds.push('template tell: "' + tells.join('", "') + '"');

// 3. length
const words = body.split(/\s+/).filter(Boolean).length;
if (words < Number(cfg.min_words || 0)) holds.push(words + ' words, under the ' +
  cfg.min_words + '-word floor');
if (words > Number(cfg.max_words || 9999)) holds.push(words + ' words, over the ' +
  cfg.max_words + '-word ceiling');

// 4. recipient
const email = String(p.email || '').toLowerCase().trim();
const localPart = email.split('@')[0] || '';
const domain = email.split('@')[1] || '';
if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(email)) {
  holds.push('not a plausible address: "' + email + '"');
} else if ((cfg.role_prefixes || []).indexOf(localPart) !== -1) {
  holds.push('role mailbox (' + localPart + '@) — nobody owns it, and it is where bounce ' +
    'rates come from');
} else if ((cfg.suppression || []).indexOf(email) !== -1 ||
           (cfg.suppression || []).indexOf(domain) !== -1) {
  holds.push('suppressed');
}

// 5. no invention. Every number in the body has to be traceable to a fact or to the offer.
const known = (p.facts || []).map(function (f) { return String(f.value); })
  .concat([String(p.rate_card || ''), String(p.min_rate || ''), String(p.followers || ''),
           String(p.avg_views || '')])
  .join(' ').replace(/[,\s]/g, '');
const invented = (body.match(/\d[\d,.]*k?/gi) || []).filter(function (raw) {
  const n = raw.replace(/[,\s]/g, '');
  if (n.length < 3) return false;               // years, small counts, "2 stories"
  return known.indexOf(n.replace(/k$/i, '')) === -1 && known.indexOf(n) === -1;
});
if (invented.length) {
  holds.push('numbers not in the record: ' + invented.join(', ') +
    ' — a rounded-up follower count is a fabricated media kit');
}

// The skeleton is honest but stiff, and stiff is what the brief calls templated.
if (p.written_by === 'skeleton' && !holds.length) {
  holds.push('unwritten skeleton — reads as a template, needs a writer or a human');
}

return [{
  json: Object.assign({}, p, {
    word_count: words,
    audit_holds: holds,
    audit_passed: holds.length === 0,
    hold_reason: holds.join(' · ')
  })
}];
