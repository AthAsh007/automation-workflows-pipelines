// Read LinkedIn's answer to the first, harmless call — and catch a dead token HERE.
//
// Registering the upload is the first request that carries the token, and it publishes
// nothing. So it is where token problems are detected, before anything irreversible:
//
//   ok          an uploadUrl and an image URN came back -> carry on
//   token       401, or EXPIRED_ACCESS_TOKEN / REVOKED_ACCESS_TOKEN / INVALID_ACCESS_TOKEN.
//               LinkedIn tokens last 60 days and lapse with no warning. This is the failure
//               that used to end as a red execution nobody looked at, with an approved post
//               silently not going out.
//   permission  403 — the token is valid but lacks w_organization_social for this page
//   version     426 — LINKEDIN_VERSION has been retired
//   failed      anything else
//
// Anything but `ok` goes to "build the LinkedIn alert", which tells the approval channel once,
// and leaves the approval OPEN: refresh the token and the next poll publishes the same approved
// draft, without anyone approving it twice.
//
// The HTTP node runs with fullResponse + neverError so a 401 arrives here as data instead of
// killing the run inside the node.

const res = $json || {};
const body = (res.body && typeof res.body === 'object') ? res.body : (res.value ? res : {});
const status = Number(res.statusCode || (res.value ? 200 : 0));
const value = body.value || {};

const code = String(body.code || body.serviceErrorCode || body.error || '');
const message = String(body.message || body.error_description || '');

let kind;
if (status >= 200 && status < 300 && value.uploadUrl && value.image) kind = 'ok';
else if (status === 401 || /EXPIRED_ACCESS_TOKEN|REVOKED_ACCESS_TOKEN|INVALID_ACCESS_TOKEN|65600|65601|65602/.test(code + ' ' + message)) kind = 'token';
else if (status === 403) kind = 'permission';
else if (status === 426) kind = 'version';
else kind = 'failed';

const WHY = {
  ok: 'upload registered',
  token: 'LinkedIn rejected the access token (HTTP ' + status + (code ? ', ' + code : '') + '). '
    + 'It has expired or been revoked. Generate a new one, put it in LINKEDIN_ACCESS_TOKEN (and '
    + 'its expiry in LINKEDIN_TOKEN_EXPIRES_ON). The approval stays open; the next poll publishes it.',
  permission: 'LinkedIn refused the request (HTTP 403' + (message ? ': ' + message : '') + '). The '
    + 'token is valid but cannot post as ' + 'this organisation: it needs w_organization_social and '
    + 'an admin role on the page.',
  version: 'HTTP 426: LinkedIn-Version is retired. Raise LINKEDIN_VERSION in config.',
  failed: 'registering the upload failed (HTTP ' + status + (message ? ': ' + message : '') + ').'
};

return [{
  json: {
    _registered: kind === 'ok',
    _kind: kind,
    _token_problem: kind !== 'ok',
    _status: status,
    _upload_url: value.uploadUrl || '',
    _image_urn: value.image || '',
    _reason: WHY[kind]
  }
}];
