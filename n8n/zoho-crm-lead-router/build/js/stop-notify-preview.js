// No notification was posted — NOTIFY_WEBHOOK_URL is blank, DRY_RUN is still true, or the
// relevant NOTIFY_ON_* switch is off. The message that would have been sent is on this node,
// so the wording can be agreed before anybody wires a Slack webhook.
const cfg = $('config').first().json;
return $input.all().map((i) => ({
  json: {
    _outcome: 'notification not sent',
    _reason: cfg.notify_webhook_url.trim() === ''
      ? 'NOTIFY_WEBHOOK_URL is blank — nothing to post to'
      : cfg.dry_run
      ? 'DRY_RUN is true'
      : 'the NOTIFY_ON_ switch for this workflow is off',
    would_post_to: i.json._notify ? i.json._notify.url : null,
    would_say: i.json.text || ''
  }
}));
