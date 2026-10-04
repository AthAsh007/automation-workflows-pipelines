// Turn the HTML into one HTTP request, shaped for whichever renderer is configured.
//
// n8n has no browser. Every other step in this pipeline is local; this is the one call that
// has to go out, and it is worth keeping it swappable — the two providers below differ only
// in a URL, an auth header and where the bytes come back.
//
//   browserless   POST {RENDER_URL}/screenshot   -> the PNG bytes, in the response
//   hcti          POST https://hcti.io/v1/image  -> JSON { url }, downloaded in the next node
//
// Adding a third is this function plus a branch on the Switch. Do not add one that renders
// from a URL instead of from a body: the template is not hosted anywhere, and putting it
// somewhere fetchable to satisfy a renderer publishes an unapproved draft.

const cfg = $('config').first().json;
const p = $json;

const provider = cfg.render_provider;
let url = '';
let body = {};
let auth = '';

if (provider === 'browserless') {
  // The token is a query parameter, not a header. Browserless returns 401 with a bare body
  // when it is missing, which reads as a network problem rather than an auth one.
  url = cfg.render_url + '/screenshot' + (cfg.render_key ? '?token=' + encodeURIComponent(cfg.render_key) : '');
  body = {
    html: p._html,
    options: { type: 'png', fullPage: false, omitBackground: false },
    viewport: {
      width: cfg.canvas_width,
      height: cfg.canvas_height,
      deviceScaleFactor: cfg.device_scale
    },
    // The document has no web fonts and no images to wait for, so networkidle would just
    // add the timeout to every render. Fonts are the system stack by design.
    gotoOptions: { waitUntil: 'load' }
  };
} else if (provider === 'hcti') {
  url = 'https://hcti.io/v1/image';
  body = {
    html: p._html,
    viewport_width: cfg.canvas_width,
    viewport_height: cfg.canvas_height,
    device_scale: cfg.device_scale,
    ms_delay: 300
  };
  // Basic, user:key. btoa exists in the n8n Code sandbox; Buffer does not, reliably.
  auth = 'Basic ' + btoa(cfg.render_user + ':' + cfg.render_key);
}

return [{
  json: Object.assign({}, p, {
    _provider: provider,
    _render_url: url,
    _render_body: body,
    _render_auth: auth,
    _expect_bytes: provider === 'browserless',
    _reason: 'rendering ' + cfg.canvas_width + 'x' + cfg.canvas_height + ' at '
      + cfg.device_scale + 'x through ' + provider
  })
}];
