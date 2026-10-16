// Reads the model's answer and keeps the skeleton when it cannot be trusted.
//
// A writer that times out, runs out of credits or returns something unparseable does not
// fail the run and does not silently send an empty email. The skeleton — assembled from
// facts, in code — stays, and the pitch is marked as unwritten so the audit downstream
// holds it for a human.
const p = $('build the pitch').item.json;
const resp = $json || {};

function textOf(r) {
  if (typeof r === 'string') return r;
  if (Array.isArray(r.content)) {
    return r.content.map(function (c) { return c.text || ''; }).join('');
  }
  return r.completion || r.text || '';
}

let subject = p.subject;
let body = p.body;
let by = 'skeleton';
let error = '';

const raw = textOf(resp).trim();
if (!raw) {
  error = resp.error ? (resp.error.message || String(resp.error)) : 'no answer from the writer';
} else {
  // The model was asked for JSON. Take the first {...} block rather than trusting that the
  // whole answer is clean — a leading "Here you go:" is the most common failure and it is
  // not worth a retry.
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end <= start) {
    error = 'writer did not return JSON';
  } else {
    try {
      const parsed = JSON.parse(raw.slice(start, end + 1));
      if (parsed.subject && parsed.body) {
        subject = String(parsed.subject).trim();
        body = String(parsed.body).trim();
        by = 'writer';
      } else {
        error = 'writer returned JSON without a subject or a body';
      }
    } catch (e) {
      error = 'writer returned malformed JSON: ' + e.message;
    }
  }
}

return [{
  json: Object.assign({}, p, {
    subject: subject,
    body: body,
    written_by: by,
    writer_error: error
  })
}];
