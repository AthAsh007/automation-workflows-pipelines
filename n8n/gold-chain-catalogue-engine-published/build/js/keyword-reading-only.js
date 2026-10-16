// Reached two ways: no AI key, or the AI request failed. Either way the keyword read from
// `read the message` stands, unchanged. The reply is built the same way both times, because
// the AI only ever reads; it never answers.
const cfg = $('config').first().json;
const why = cfg.ai_enabled ? 'keyword rules (AI request failed)' : 'keyword rules (no AI key)';
return $('read the message').all().map((i) => ({ json: Object.assign({}, i.json, { read_by: why }) }));
