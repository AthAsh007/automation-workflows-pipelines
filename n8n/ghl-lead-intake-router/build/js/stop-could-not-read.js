// GoHighLevel is configured but the read failed. The run STOPS here rather than falling back to
// the demo pipeline — a fabricated lead must never be sequenced against a real account. This
// node's output carries the reason, so the failure is a visible step rather than a quiet morning.
return $input.all().map((i) => {
  const j = i.json || {};
  const err = j.error || j;
  const detail = (err && (err.message || err.description || err.error)) || j;
  return {
    json: {
      _outcome: 'read failed',
      _reason: 'could not read the pipeline from GoHighLevel — nothing was sequenced',
      ghl_response: typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 600)
    }
  };
});
