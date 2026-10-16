// Zoho was not written: TEST_RUN is still true, the OAuth values are blank, or nobody in this
// run qualified. This node's output IS the result: the exact upsert body that would have gone
// to Zoho. Open it on a screen-share.
const cfg = $('config').first().json;
const j = $input.first().json;
return [{
  json: {
    _outcome: 'preview: nothing written to Zoho',
    _reason: j._count === 0 ? 'nobody in this run is going to Zoho'
      : (cfg.mode !== 'live' ? 'TEST_RUN is true, mode ' + cfg.mode
        : 'ZOHO_CLIENT_ID / ZOHO_CLIENT_SECRET / ZOHO_REFRESH_TOKEN is blank'),
    would_post_to: j._zoho.url,
    would_post: j._zoho.body
  }
}];
