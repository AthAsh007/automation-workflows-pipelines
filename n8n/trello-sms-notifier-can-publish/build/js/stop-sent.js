// The SMS was accepted by Twilio. This node's output is the record: the card, the
// number it went to, and the Twilio message id.
return $input.all().map((i) => ({
  json: {
    _outcome: 'sent',
    card_url: i.json.card_url || i.json.card_url,
    to:       i.json.to || i.json._sms_to,
    sid:      i.json.sid || '(no sid returned)',
    body:     i.json.body || i.json._sms_body,
    cost_usd: (i.json.price && i.json.price.hasOwnProperty('amount')) ? i.json.price.amount : null,
    summary:  i.json.summary
  }
}));
