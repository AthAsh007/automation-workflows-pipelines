// The COQL read failed, so no call list was built today. The response says why: most often
// INVALID_QUERY (a field in ZOHO_FIELDS that does not exist) or OAUTH_SCOPE_MISMATCH (the
// refresh token lacks ZohoCRM.coql.READ).
const j = $input.first().json || {};
return [{ json: { _outcome: 'could not read Zoho: no call list today', zoho_response: JSON.stringify(j.error || j).slice(0, 600) } }];
