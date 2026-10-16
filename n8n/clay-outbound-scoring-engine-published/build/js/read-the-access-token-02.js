// Reads the access token out of the refresh-token exchange. Zoho answers a failed refresh with
// HTTP 200 and an `error` key in the body, so the body is checked here, not just the status.
//@include lib-zoho-token.js
return [{ json: readToken($input.first().json || {}, $('build the Zoho updates').first().json) }];
