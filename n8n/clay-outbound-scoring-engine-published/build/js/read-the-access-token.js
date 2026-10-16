// Reads the access token out of the refresh-token exchange and puts it on the request built
// upstream. Zoho answers a failed refresh with HTTP 200 and an `error` key in the body, so the
// body is checked here: a node that only checks the status carries on and fails later with a
// confusing INVALID_TOKEN, which is the most common way a Zoho integration breaks quietly.
//@include lib-zoho-token.js
return [{ json: readToken($input.first().json || {}, $('build the Zoho upsert').first().json) }];
