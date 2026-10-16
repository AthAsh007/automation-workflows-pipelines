// Pairs each embedding back to its email and builds the Pinecone query. An email whose
// embedding failed (after the node's retries) is marked `embedded: false` with the API's own
// message, and `question embedded?` sends it to a person instead of querying with nothing.
const cfg = $('config').first().json;

return $input.all().map((item, idx) => {
  const email = Object.assign({}, $('build the embedding request').itemMatching(idx).json);
  delete email._body;
  const res = item.json || {};
  const vector = res.data && res.data[0] && res.data[0].embedding;

  if (res.error || !Array.isArray(vector) || !vector.length) {
    const why = res.error ? String(res.error.message || res.error).slice(0, 200) : 'no embedding in the response';
    return { json: Object.assign(email, {
      embedded: false,
      knowledge_ok: false,
      knowledge_reason: 'knowledge search failed: OpenAI embeddings - ' + why
    }) };
  }
  return { json: Object.assign(email, {
    embedded: true,
    _body: { vector, topK: cfg.top_k, includeMetadata: true, includeValues: false,
      namespace: cfg.pinecone_namespace }
  }) };
});
