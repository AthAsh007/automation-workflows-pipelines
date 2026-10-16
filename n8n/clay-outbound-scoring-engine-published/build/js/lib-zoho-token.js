function readToken(res, request) {
  if (res.error || !res.access_token) {
    return {
      _authed: false,
      _why: res.error ? 'Zoho refused the refresh: ' + res.error : 'Zoho returned no access_token',
      _hint: res.error === 'invalid_client'
        ? 'ZOHO_CLIENT_ID and ZOHO_CLIENT_SECRET belong to a different data centre than ZOHO_ACCOUNTS_BASE'
        : res.error === 'invalid_code'
        ? 'the refresh token was revoked, or issued for different scopes'
        : 'check ZOHO_ACCOUNTS_BASE matches the region the Self Client was registered in'
    };
  }
  return Object.assign({}, request, { _authed: true, _access_token: res.access_token });
}
