// Splits every document into overlapping windows of CHUNK_WORDS words. Overlap keeps a
// sentence that straddles a boundary findable from either side. Each chunk id is
// <doc_id>#<n>, so loading the same page again overwrites its chunks instead of duplicating
// them. The text, title and source travel as metadata: workflow 01 writes replies from them.
const cfg = $('config').first().json;
const size = Math.max(40, cfg.chunk_words);
const step = Math.max(10, size - Math.min(cfg.chunk_overlap, size - 10));

const docs = $input.all().map((i) => i.json);
const skipped = docs.filter((d) => !d.ok).map((d) => ({ doc: d.url || d.doc_id, problem: d.problem }));
const chunks = [];
for (const d of docs.filter((x) => x.ok)) {
  const words = d.text.split(/\s+/).filter(Boolean);
  for (let start = 0, n = 0; start < words.length; start += step, n++) {
    chunks.push({ id: d.doc_id + '#' + n, doc_id: d.doc_id, title: d.title, source: d.source, chunk: n,
      text: words.slice(start, start + size).join(' ') });
    if (start + size >= words.length) break;
  }
}
return [{ json: { documents: docs.length - skipped.length, skipped, chunk_count: chunks.length, chunks } }];
