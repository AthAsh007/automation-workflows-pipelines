// No DOC_URLS: the demo knowledge base from config stands in, as documents in the same shape
// a fetched page produces.
const cfg = $('config').first().json;
return cfg.demo_knowledge.map((d) => ({ json: {
  doc_id: d.id, title: d.title, text: d.text, source: 'demo knowledge base', ok: true
} }));
