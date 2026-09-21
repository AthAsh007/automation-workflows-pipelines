// GoHighLevel is not configured (DRY_RUN is still true, or the location id / API key is
// blank). Nothing was written — and this node's output IS the result: the exact contact body
// that would have been sent, and where the lead was routed. Open it to read what GoHighLevel
// would receive.
return $input.all().map((i) => ({
  json: {
    _outcome: 'preview — nothing written',
    _reason: 'GoHighLevel not written: DRY_RUN is true or the location id / API key is blank',
    contact_key: i.json.contact_key,
    routed_to: i.json.owner,
    stage: i.json.stage,
    tags: i.json.tags,
    would_post: i.json._ghl ? i.json._ghl.contact.body : null,
    then: i.json._then || ''
  }
}));
