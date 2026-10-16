// OpenAI takes many inputs per embeddings call and Pinecone takes up to 1,000 vectors per
// upsert. Batches of 96 keep both calls small enough to retry cheaply when one fails.
const cfg = $('config').first().json;
const { chunks } = $input.first().json;
const out = [];
for (let i = 0; i < chunks.length; i += 96) {
  const batch = chunks.slice(i, i + 96);
  out.push({ json: { batch_no: out.length + 1, chunks: batch,
    _body: { model: cfg.openai_embed_model, dimensions: cfg.embed_dimensions,
      input: batch.map((c) => c.title + '\n\n' + c.text) } } });
}
return out;
