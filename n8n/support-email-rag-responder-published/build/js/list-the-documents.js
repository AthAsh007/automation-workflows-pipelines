// One item per page in DOC_URLS, so each is fetched (and can fail) on its own.
const cfg = $('config').first().json;
return cfg.doc_urls.map((url, n) => ({ json: {
  url,
  doc_id: url.replace(/^https?:\/\//, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 60) || 'doc-' + n
} }));
