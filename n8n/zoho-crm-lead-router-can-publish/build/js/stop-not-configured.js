// Zoho is not configured (DRY_RUN is still true, or one of the three OAuth values is blank).
// Nothing was written — and this node's output IS the result: the exact request body that
// would have gone to Zoho, and where the lead was routed.
//
// This is the node to open on a screen-share. It is the whole demo: real routing, a real
// Zoho payload, and nothing leaving the building.
const cfg = $('config').first().json;

return $input.all().map((i) => ({
  json: {
    _outcome: 'preview — nothing written',
    _reason: cfg.dry_run
      ? 'DRY_RUN is true — set it to false in config once the OAuth values are filled in'
      : 'ZOHO_CLIENT_ID / ZOHO_CLIENT_SECRET / ZOHO_REFRESH_TOKEN is blank',
    routed_to: i.json.owner,
    lead_status: i.json.status,
    tags: i.json.tags,
    routed_by: i.json._routed_by,
    would_post_to: i.json._zoho ? i.json._zoho.url : null,
    would_post: i.json._zoho ? i.json._zoho.body : null
  }
}));
