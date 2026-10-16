// The refresh-token exchange failed, so nothing downstream ran. This is a named stop rather
// than a swallowed error because an expired refresh token is the most common way a Zoho
// integration dies quietly: every run "succeeds", nothing is ever written, and nobody notices
// until someone asks where the week's leads went.
//
// `_hint` is the thing to read first — it maps Zoho's terse error to the cause.
return $input.all().map((i) => ({
  json: {
    _outcome: 'not authenticated — nothing written',
    _reason: i.json._why || 'Zoho refused the refresh token',
    _hint: i.json._hint || 'check ZOHO_ACCOUNTS_BASE matches the data centre the app was registered in',
    zoho_response: JSON.stringify(i.json._response || i.json).slice(0, 600)
  }
}));
