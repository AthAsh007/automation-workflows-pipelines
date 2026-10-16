// Reads Pinecone's matches back onto each email and applies the knowledge gate: the best
// match must score at least MIN_MATCH_SCORE, or the email goes to a person. A failed query
// (after the node's retries) is the same outcome with the API's message on it: no knowledge,
// no automated answer.
//
// Workflow 02 stores the chunk text, its title and its source under `metadata`, which is what
// the reply is written from.
const cfg = $('config').first().json;

return $input.all().map((item, idx) => {
  const email = Object.assign({}, $('build the Pinecone query').itemMatching(idx).json);
  delete email._body;
  const res = item.json || {};

  if (res.error || !Array.isArray(res.matches)) {
    const why = res.error ? String(res.error.message || res.error).slice(0, 200) : 'no matches array in the response';
    return { json: Object.assign(email, { retrieved_from: 'Pinecone', matches: [], top_score: 0,
      match_floor: cfg.min_match_score, knowledge_ok: false,
      knowledge_reason: 'knowledge search failed: Pinecone - ' + why }) };
  }

  const matches = res.matches.map((m) => ({
    id: m.id,
    title: (m.metadata && m.metadata.title) || m.id,
    text: (m.metadata && m.metadata.text) || '',
    source: (m.metadata && m.metadata.source) || '',
    score: Math.round(Number(m.score || 0) * 1000) / 1000
  })).filter((m) => m.text).sort((a, b) => b.score - a.score);

  const top = matches.length ? matches[0].score : 0;
  const ok = top >= cfg.min_match_score;
  return { json: Object.assign(email, {
    retrieved_from: 'Pinecone (' + cfg.pinecone_namespace + ')',
    matches,
    top_score: top,
    match_floor: cfg.min_match_score,
    knowledge_ok: ok,
    knowledge_reason: ok
      ? 'best match "' + matches[0].title + '" scored ' + top
      : (matches.length ? 'not enough knowledge: best match scored ' + top + ', below the floor of ' + cfg.min_match_score
        : 'not enough knowledge: the index returned nothing for this question')
  }) };
});
