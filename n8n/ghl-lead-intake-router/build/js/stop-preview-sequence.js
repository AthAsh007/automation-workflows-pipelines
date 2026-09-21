// GoHighLevel is not configured (DRY_RUN is still true, or the location id / API key is
// blank). Nothing was sent — and this node's output IS the result: each lead's touch number,
// channel, recipient and the exact words that would have gone out. Open it to read them.
return $input.all().map((i) => ({
  json: {
    _outcome: 'preview — not sent',
    _reason: 'GoHighLevel not configured — nothing was sent',
    contact_key: i.json.contact_key,
    touch: i.json.touch,
    channel: i.json.channel,
    to: i.json.email || i.json.phone || i.json.contact_id,
    subject: i.json.subject,
    body: i.json.body
  }
}));
