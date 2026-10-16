// Turns each fetched page into plain text and a title. A page that failed to fetch after the
// node's retries, or came back with almost no text, is kept with the reason so the run summary
// says which pages were not loaded rather than silently indexing fewer.
const strip = (html) => String(html || '')
  .replace(/<(head|script|style|nav|footer|header)[\s\S]*?<\/\1>/gi, ' ')
  .replace(/<br\s*\/?>|<\/(p|div|li|h\d)>/gi, '\n').replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, "'").replace(/&quot;/g, '"')
  .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n\n').trim();

return $input.all().map((item, idx) => {
  const doc = $('list the documents').itemMatching(idx).json;
  const res = item.json || {};
  if (res.error) {
    return { json: Object.assign({}, doc, { ok: false, problem: 'fetch failed: ' + String(res.error.message || res.error).slice(0, 160) }) };
  }
  const raw = String(res.data || '');
  const title = ((raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || doc.doc_id).trim();
  const text = /<[a-z][\s\S]*>/i.test(raw) ? strip(raw) : raw.trim();
  if (text.split(/\s+/).length < 20) return { json: Object.assign({}, doc, { ok: false, problem: 'almost no text on the page' }) };
  return { json: Object.assign({}, doc, { ok: true, title, text, source: doc.url }) };
});
