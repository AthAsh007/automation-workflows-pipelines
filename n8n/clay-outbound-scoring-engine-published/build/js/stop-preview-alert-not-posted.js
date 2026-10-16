// Not posted: a preview run, no NOTIFY_WEBHOOK_URL, or nothing needed a person. The message
// that would have gone is `text`.
const j = $input.first().json;
return [{ json: { _outcome: 'alert shown, not posted', replies: j._count, text: j.text } }];
