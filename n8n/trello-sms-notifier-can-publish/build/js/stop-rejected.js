// Twilio refused the send (invalid number, auth failure, etc.). The response body is
// on this node so the operator can see why, not just that it failed.
return $input.all().map((i) => ({
  json: {
    _outcome: 'failed',
    _reason:  i.json.error || 'Twilio rejected the send',
    card_url: i.json.card_url || i.json.card_url,
    to:       i.json.to || i.json._sms_to,
    body:     i.json._sms_body,
    summary:  i.json.summary
  }
}));
