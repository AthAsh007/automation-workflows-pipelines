// Pairs each embeddings response with its batch of chunks and builds the Pinecone upsert:
// one vector per chunk, with the text, title and source as metadata. A batch whose embedding
// failed after the node's retries is marked and not upserted.
const cfg = $('config').first().json;
return $input.all().map((item, idx) => {
  const batch = $('build the embedding batches').itemMatching(idx).json;
  const res = item.json || {};
  const data = Array.isArray(res.data) ? res.data : [];
  if (res.error || data.length !== batch.chunks.length) {
    return { json: { batch_no: batch.batch_no, embedded: false, chunk_count: batch.chunks.length,
      problem: res.error ? String(res.error.message || res.error).slice(0, 200)
        : 'got ' + data.length + ' embeddings for ' + batch.chunks.length + ' chunks' } };
  }
  const vectors = batch.chunks.map((c, n) => ({
    id: c.id,
    values: data[n].embedding,
    metadata: { title: c.title, text: c.text, source: c.source, doc_id: c.doc_id, chunk: c.chunk }
  }));
  return { json: { batch_no: batch.batch_no, embedded: true, chunk_count: vectors.length,
    _body: { vectors, namespace: cfg.pinecone_namespace } } };
});
