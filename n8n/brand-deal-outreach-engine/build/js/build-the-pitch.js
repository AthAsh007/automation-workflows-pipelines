// Assembles the FACTS in code, then asks the model to write around them.
//
// This is the whole personalisation argument. The facts — what the brand just did, what the
// creator's numbers actually are, what the deliverable is, what it costs — are read out of
// the two records and never invented. The model gets them as a list and is asked for a
// subject line and an opening line, in a named voice, with an explicit instruction not to
// add anything that is not in the list.
//
// A brand record with nothing specific in it produces FEWER facts, not a vaguer sentence.
// If it falls below MIN_FACTS the audit downstream holds the pitch. That is the difference
// between personalisation and mail-merge: mail-merge always has something to say.
const cfg = $('config').first().json;
const p = $json;

function fact(label, value) {
  const v = String(value === undefined || value === null ? '' : value).trim();
  return v ? { label: label, value: v } : null;
}

// Brand-side facts. These are the ones that prove the pitch was written for this company
// and not for a list.
const brandFacts = [
  fact('recent_signal', p.recent_signal),
  fact('product', p.product),
  fact('region', p.region),
  fact('role', p.role),
  fact('budget_band', p.budget_band)
].filter(Boolean).filter(function (f) {
  return cfg.fact_fields.indexOf(f.label) !== -1;
});

// Creator-side facts. Numbers, from the record, never rounded up by a model.
const creatorFacts = [
  fact('followers', p.followers ? Number(p.followers).toLocaleString('en-GB') + ' followers on ' +
    p.platform : ''),
  fact('avg_views', p.avg_views ? Number(p.avg_views).toLocaleString('en-GB') +
    ' average views' : ''),
  fact('proof', p.proof),
  fact('deliverables', p.deliverables)
].filter(Boolean);

const facts = brandFacts.concat(creatorFacts);

// The skeleton. This is what gets sent if there is no writer configured — it is stiff, and
// it is true, and it is held for a human rather than sent as-is.
const skeleton = [
  'Hi ' + String(p.contact || '').split(' ')[0] + ',',
  '',
  p.recent_signal
    ? 'Saw that ' + p.brand + ' ' + p.recent_signal + '.'
    : 'Writing about ' + p.brand + '.',
  '',
  'I look after partnerships for ' + p.student + ' (' + p.handle + ') — ' +
    creatorFacts.map(function (f) { return f.value; }).slice(0, 2).join(', ') + '.',
  '',
  p.deliverables + ' runs ' + (p.rate_card ? '£' + p.rate_card : 'at our standard rate') +
    '. Worth a conversation?',
  '',
  '— Northbeam, on behalf of ' + p.student
].join('\n');

const system = [
  'You write cold outreach for a creator partnerships agency.',
  '',
  'Rules, all of them hard:',
  '1. Use ONLY the facts in the list. Do not add a claim, a number, a compliment or a',
  '   detail that is not in it. If the list is thin, write a shorter email.',
  '2. First line must be about the BRAND, not about the creator and not about you.',
  '3. No greetings-filler. Never "I hope this email finds you well", "quick question",',
  '   "I came across your", "love what you are doing" or anything of that family.',
  '4. British English. Plain. No adjectives you would not say out loud.',
  '5. ' + cfg.min_words + '-' + cfg.max_words + ' words in the body.',
  '6. One ask at the end, and make it easy to answer with one word.',
  '',
  'Return JSON only: {"subject": "...", "body": "..."}'
].join('\n');

const user = [
  'Brand: ' + p.brand,
  'Contact: ' + p.contact + (p.role ? ' (' + p.role + ')' : ''),
  'Creator: ' + p.student + ' ' + p.handle + ', ' + p.niche + ' on ' + p.platform,
  '',
  'Facts you may use:',
  facts.map(function (f) { return '- ' + f.label + ': ' + f.value; }).join('\n'),
  '',
  'The offer: ' + p.deliverables + (p.rate_card ? ' at £' + p.rate_card : ''),
  '',
  'Write the email.'
].join('\n');

return [{
  json: Object.assign({}, p, {
    facts: facts,
    fact_count: facts.length,
    brand_fact_count: brandFacts.length,
    subject: 'Partnership with ' + p.student + ' — ' + p.brand,
    body: skeleton,
    written_by: 'skeleton',
    _needs_writer: cfg.ai_enabled === true,
    _ai_system: system,
    _ai_user: user
  })
}];
