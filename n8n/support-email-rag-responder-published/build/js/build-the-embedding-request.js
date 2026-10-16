// One embeddings request per email: the subject and the new text of the body, with the same
// model the knowledge base was loaded with (workflow 02). A different model here would compare
// vectors from two different spaces and every score would be meaningless.
const cfg = $('config').first().json;
return $input.all().map((i) => ({ json: Object.assign({}, i.json, {
  _body: {
    model: cfg.openai_embed_model,
    input: (i.json.subject + '\n\n' + i.json.body).slice(0, 8000),
    dimensions: cfg.embed_dimensions
  }
}) }));
