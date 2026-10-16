// PREVIEW mode. Everything was built and rendered; nothing left the building.
//
// This is the shipped default and the state a first run after import lands in. The draft
// exists in this execution — open the render node's output to look at the actual PNG,
// which is the point of previewing.
//
// To deliver to a test channel: set TEST_CHANNEL_ID. To go live: set TEST_RUN = false.
// Those are two separate acts, and only the second can ever publish.
const cfg = $('config').first().json;
const s = $json;

return [{
  json: Object.assign({}, { _slug: s.slug, _caption_words: s._caption_words, _png_bytes: s._png_bytes, _png: s._png_width + 'x' + s._png_height }, {
    _stopped: 'preview - not delivered',
    _mode: cfg.mode,
    _reason: cfg.forced_preview
      ? '[PREVIEW] Forced into preview because the demo bank is in use (SHEET_ID is '
        + 'blank). Demo content can never reach the company page, whatever TEST_RUN says.'
      : '[PREVIEW] TEST_RUN is true and TEST_CHANNEL_ID is blank, so the draft was built '
        + 'and rendered but delivered nowhere.',
    _at: new Date().toISOString()
  })
}];
