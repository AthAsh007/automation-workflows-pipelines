// The renderer answered, but not with a usable picture.
//
// A failed render is a failure, not a reason to retry in a loop or to fall back to a
// generated image. An image model cannot be trusted with a logo, a headline or small body
// copy, which is the entire content of this canvas — so there is no fallback here on
// purpose. Escalate, fix the renderer, run again.
const cfg = $('config').first().json;
const s = $json;

return [{
  json: Object.assign({}, { _slug: s.slug, _bytes: s._png_bytes, _dimensions: s._png_width + 'x' + s._png_height, _problems: s._problems }, {
    _stopped: 'no image',
    _mode: cfg.mode,
    _reason: '[FAILED] ' + (s._problems || []).join('; '),
    _at: new Date().toISOString()
  })
}];
