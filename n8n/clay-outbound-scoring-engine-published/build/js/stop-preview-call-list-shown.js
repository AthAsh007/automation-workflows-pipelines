// Not posted: a preview run or no NOTIFY_WEBHOOK_URL. The list is `text`, and each row with why
// it is there is in `list`.
const j = $input.first().json;
return [{ json: { _outcome: 'call list shown, not posted', count: j.count, text: j.text, list: j.list } }];
