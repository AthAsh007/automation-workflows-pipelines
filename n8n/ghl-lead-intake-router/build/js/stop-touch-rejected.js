// GoHighLevel refused the touch. Its own node, so a send that failed is a visible step with
// the response on it rather than a run that half-succeeded and said nothing. Read
// `ghl_response` for what it said.
return $input.all().map((i) => {
  const j = i.json || {};
  const err = j.error || j;
  const detail = (err && (err.message || err.description || err.error)) || j;
  return {
    json: {
      _outcome: 'send failed',
      _reason: 'GoHighLevel rejected the touch — nothing was sent for this lead',
      ghl_response: typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 600)
    }
  };
});
