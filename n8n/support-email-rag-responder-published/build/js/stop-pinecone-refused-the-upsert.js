// Pinecone refused a batch after the node's retries: usually a wrong index host, a dimension
// mismatch between EMBED_DIMENSIONS and the index, or a bad key. Pinecone's error is kept.
return $input.all().map((i) => ({ json: {
  outcome: 'Pinecone refused the upsert',
  error: (i.json.error && (i.json.error.message || i.json.error)) || i.json.message || 'unknown error'
} }));
