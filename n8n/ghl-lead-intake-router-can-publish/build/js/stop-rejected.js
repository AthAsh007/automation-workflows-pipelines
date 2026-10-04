// GoHighLevel refused the write. This node exists so that refusal is a visible step with the
// response on it, rather than a run that half-succeeded and said nothing — which is the whole
// of "failed automations visible, not silent". Read `ghl_response` for what it said.
return $input.all().map((i) => {
  const j = i.json || {};
  const err = j.error || j;
  const detail = (err && (err.message || err.description || err.error)) || j;
  return {
    json: {
      _outcome: 'write failed',
      _reason: 'GoHighLevel rejected the contact write — nothing was filed for this lead',
      contact_key: j.contact_key,
      ghl_response: typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 600)
    }
  };
});
