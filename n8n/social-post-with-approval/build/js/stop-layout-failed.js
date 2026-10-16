// The template would not have rendered correctly, so it was not rendered.
//
// Fix the bank row — headline length, item count, an empty field — and run again. Every
// check that lands here corresponds to a defect that reached a published post once.
const cfg = $('config').first().json;
const s = $json;

return [{
  json: Object.assign({}, { _slug: s.slug, _layout: s.layout, _issues: s._issues, _warnings: s._warnings }, {
    _stopped: 'layout failed',
    _mode: cfg.mode,
    _reason: '[HELD] ' + (s._issues || []).join('; '),
    _at: new Date().toISOString()
  })
}];
