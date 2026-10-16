// Preview, or OpenAI / Pinecone not configured: every chunk is shown exactly as it would be
// embedded and upserted (id, metadata, text), with the vector itself left out. Nothing is
// sent to OpenAI and nothing is written to Pinecone.
const cfg = $('config').first().json;
const r = $input.first().json;
const why = !cfg.retrieval_enabled ? 'OpenAI and Pinecone not configured' : 'preview mode';
return [{ json: {
  outcome: why + ': ' + r.chunk_count + ' chunks from ' + r.documents + ' documents not upserted',
  skipped_documents: r.skipped,
  would_upsert: r.chunks.map((c) => ({ id: c.id, namespace: cfg.pinecone_namespace,
    values: '[' + cfg.embed_dimensions + ' floats from ' + cfg.openai_embed_model + ']',
    metadata: { title: c.title, source: c.source, chunk: c.chunk, text: c.text } }))
} }];
