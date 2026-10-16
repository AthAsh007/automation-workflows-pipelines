// The refresh-token exchange failed, so nothing was written. `_why` and `_hint` say which of
// the usual causes it is.
const j = $input.first().json || {};
return [{ json: { _outcome: 'could not authenticate with Zoho: nothing written', _why: j._why, _hint: j._hint } }];
