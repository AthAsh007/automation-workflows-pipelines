// Zoho refused the write. This node exists so the refusal is a visible step with the response
// on it, rather than a run that half-succeeded and said nothing. Read `zoho_response`.
//
// The three that actually happen: INVALID_TOKEN (wrong data centre, or the access token
// expired mid-run), MANDATORY_NOT_FOUND (the layout needs a field this payload does not
// send), and INVALID_DATA (a picklist value that does not exist in the org — most often a
// Lead_Status from ROUTING_RULES that nobody created in Zoho).
return $input.all().map((i) => {
  const j = i.json || {};
  const err = j.error || j;
  const detail = (err && (err.message || err.description || err.error)) || j;
  return {
    json: {
      _outcome: 'write failed',
      _reason: 'Zoho rejected the lead write — nothing was filed for this lead',
      routed_to: j.owner || '',
      zoho_response: typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 600)
    }
  };
});
