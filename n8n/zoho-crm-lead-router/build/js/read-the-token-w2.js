// Reads the access token out of the refresh-token exchange. The sweep makes one read call,
// so one item is all that is needed here.
//
// Zoho returns HTTP 200 with an `error` key in the body when a refresh fails. A node that
// only checks the status code treats that as success and fails confusingly later with
// INVALID_TOKEN — so the body is checked explicitly, and a bad refresh stops the run here
// with the reason on it.
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

return [{
  json: {
    _authed: true,
    _access_token: res.access_token,
    _expires_in: res.expires_in || 3600,
    _obtained_at: new Date().toISOString()
  }
}];
