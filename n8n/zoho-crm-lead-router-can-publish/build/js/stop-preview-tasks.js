// Nothing was created in Zoho — DRY_RUN is still true, or the OAuth values are blank. This
// node's output IS the result: the exact Tasks request that would have been sent, and which
// deals it covers.
//
// Open this one on a screen-share. It shows real deals, judged by a real rule, producing a
// real Zoho payload, with nothing written.
const cfg = $('config').first().json;
return $input.all().map((i) => ({
  json: {
    _outcome: 'preview — no tasks created',
    _reason: cfg.dry_run
      ? 'DRY_RUN is true — set it to false in config once the OAuth values are filled in'
      : 'ZOHO_CLIENT_ID / ZOHO_CLIENT_SECRET / ZOHO_REFRESH_TOKEN is blank',
    tasks: i.json._count,
    deals: i.json._deals,
    would_post_to: i.json._zoho ? i.json._zoho.url : null,
    would_post: i.json._zoho ? i.json._zoho.body : null
  }
}));
