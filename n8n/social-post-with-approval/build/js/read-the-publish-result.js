// Read what LinkedIn said, and decide whether anything is now on the page.
//
// This runs after the irreversible step. The one rule that matters: an UNKNOWN outcome is
// never retried. A publish that timed out may well have succeeded, and a retry puts the same
// post up twice — which cannot be undone from here and looks worse than a missing post.
//
// The three outcomes:
//
//   POSTED     a share URN came back. Log it, notify, done.
//   DUPLICATE  LinkedIn rejected it as already posted. Stop. Not an error to fix.
//   FAILED     a 4xx with a reason. Stop, read the reason, fix the cause. A 4xx does not
//              become a 2xx by being sent again.
//   UNKNOWN    no status, no urn, no error. Check the page by eye before doing anything.

const draft = $('the approved draft').first().json;

const res = $json || {};
const headers = res.headers || {};
const body = res.body !== undefined ? res.body : res;
const status = Number(res.statusCode || res.status || 0);

// The share URN comes back in a header, not the body. n8n lowercases header names on some
// versions and not others.
const urn = String(
  headers['x-restli-id'] || headers['X-RestLi-Id'] || headers['x-linkedin-id']
  || (body && body.id) || ''
);

let outcome;
let reason;

if (urn) {
  outcome = 'POSTED';
  reason = 'published as ' + urn;
} else if (status === 409 || /duplicate/i.test(JSON.stringify(body || ''))) {
  outcome = 'DUPLICATE';
  reason = 'LinkedIn rejected this as a duplicate — it is already on the page. Not retried.';
} else if (status >= 400) {
  const msg = (body && (body.message || body.error_description || body.error)) || '';
  outcome = 'FAILED';
  reason = 'HTTP ' + status + (msg ? ': ' + JSON.stringify(msg) : '')
    + '. Not retried — a 4xx does not fix itself. '
    + (status === 401 || status === 403
        ? 'That status is almost always the token: expired, or missing w_organization_social.'
        : status === 426
          ? 'HTTP 426 is a retired LinkedIn-Version. Raise LINKEDIN_VERSION in config.'
          : '');
} else {
  outcome = 'UNKNOWN';
  reason = 'no URN and no error came back (HTTP ' + status + '). The post may or may not '
    + 'have gone up. LOOK AT THE PAGE before running this again — this is the one case '
    + 'where a retry can double-post.';
}

return [{
  json: Object.assign({}, draft, {
    _outcome: outcome,
    _urn: urn,
    _status: status,
    _posted: outcome === 'POSTED',
    _reason: reason,
    _post_url: urn ? 'https://www.linkedin.com/feed/update/' + urn + '/' : ''
  })
}];
