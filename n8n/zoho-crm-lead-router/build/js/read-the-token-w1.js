// Reads the access token out of the refresh-token exchange and puts it back on every lead,
// so the write node downstream still has one item per lead rather than one item per token.
//
// Zoho returns HTTP 200 with an `error` key in the body when a refresh fails — an expired or
// revoked refresh token, the wrong data centre, a client id registered in another region. A
// node that only checks the status code treats that as success and then fails confusingly
// later with INVALID_TOKEN, which is the most common way a Zoho integration breaks quietly.
// So the body is checked here, explicitly.
const res = $input.first().json || {};

if (res.error || !res.access_token) {
  return [{
    json: {
      _authed: false,
      _why: res.error ? 'Zoho refused the refresh: ' + res.error
                      : 'Zoho returned no access_token',
      _hint: res.error === 'invalid_client'
        ? 'client id/secret belong to a different data centre than ZOHO_ACCOUNTS_BASE'
        : res.error === 'invalid_code'
        ? 'the refresh token has been revoked, or was issued for different scopes'
        : 'check ZOHO_ACCOUNTS_BASE matches the region the app was registered in',
      _response: res
    }
  }];
}

// One item per lead again, each carrying the token it will be written with.
return $('build the Zoho payload').all().map((item) => ({
  json: Object.assign({}, item.json, {
    _authed: true,
    _access_token: res.access_token,
    _expires_in: res.expires_in || 3600
  })
}));
