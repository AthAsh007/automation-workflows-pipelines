// Stands in for OpenAI embeddings + Pinecone when they are not configured, so the whole run
// (retrieve, gate on the score, answer or escalate) can be watched with nothing connected.
//
// The score is coverage: the share of the email's content words found in a knowledge entry,
// 0..1. It is cruder than vector similarity and has its own floor, DEMO_MIN_MATCH_SCORE. The
// point it demonstrates is the gate, not the ranking.
const cfg = $('config').first().json;

const STOP = new Set(('the a an and or but to of in on for with at by from is are was were be been it this that '
  + 'i we you they he she my our your their me us hi hello thanks thank please can could would should do does did '
  + 'how what when where why who re fw fwd have has had not no yes will just about there here some any all get got '
  + 'com org net co uk example').split(' '));
const stem = (w) => w.replace(/(ing|ed|es|s)$/, '');
function words(text) {
  return new Set(String(text).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w)).map(stem));
}

const kb = cfg.demo_knowledge.map((d) => ({ id: d.id + '#0', title: d.title, text: d.text,
  words: words(d.title + ' ' + d.text) }));

return $input.all().map((i) => {
  const q = words(i.json.subject + ' ' + i.json.body);
  const matches = kb.map((d) => {
    let hit = 0;
    for (const w of q) if (d.words.has(w)) hit++;
    return { id: d.id, title: d.title, text: d.text, score: q.size ? Math.round((hit / q.size) * 100) / 100 : 0 };
  }).sort((a, b) => b.score - a.score).slice(0, cfg.top_k);

  const top = matches.length ? matches[0].score : 0;
  const floor = cfg.demo_min_match_score;
  return { json: Object.assign({}, i.json, {
    retrieved_from: 'demo knowledge base (word overlap)',
    matches,
    top_score: top,
    match_floor: floor,
    knowledge_ok: top >= floor,
    knowledge_reason: top >= floor
      ? 'best match "' + matches[0].title + '" scored ' + top
      : 'not enough knowledge: best match scored ' + top + ', below the floor of ' + floor
  }) };
});
