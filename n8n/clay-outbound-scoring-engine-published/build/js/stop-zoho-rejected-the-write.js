// Zoho refused the whole request. A visible step with the response on it, never a run that
// half-succeeded and said nothing. The usual three: INVALID_TOKEN (wrong data centre),
// MANDATORY_NOT_FOUND (the layout needs a field this does not send), INVALID_DATA (a
// Lead_Status in LEAD_STATUS_BY_TIER that does not exist in the org).
const j = $input.first().json || {};
const err = j.error || j;
return [{
  json: {
    _outcome: 'Zoho write failed: nothing was written',
    zoho_response: typeof err === 'string' ? err : JSON.stringify(err).slice(0, 600)
  }
}];
