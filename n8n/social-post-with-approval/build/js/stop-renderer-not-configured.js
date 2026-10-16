// No renderer, so no image, so no draft.
//
// This one deliberately does NOT degrade into delivering the caption on its own. A caption
// without its image is not a draft — a reviewer cannot approve what they cannot see, and
// an approval given against a missing image is an approval of whatever gets rendered later.
//
// Set RENDER_PROVIDER and RENDER_URL in config. Browserless next to n8n in the same
// docker-compose file is the shipped answer; README has the service block.
const cfg = $('config').first().json;
const s = $json;

return [{
  json: Object.assign({}, { _slug: s.slug, _html_bytes: s._html_bytes }, {
    _stopped: 'renderer not configured',
    _mode: cfg.mode,
    _reason: '[BLOCKED] RENDER_PROVIDER or RENDER_URL is blank in config, so there is no way to turn '
    + 'the template into an image. The caption is written and the HTML is built — only the '
    + 'picture is missing.',
    _at: new Date().toISOString()
  })
}];
