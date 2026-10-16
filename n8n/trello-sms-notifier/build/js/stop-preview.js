// DRY_RUN is still true, or the Twilio credentials are blank. Nothing was sent — and
// this node's output IS the result: the exact SMS body that would have gone out, and
// to which number. Open it to read what Twilio would receive.
return $input.all().map((i) => ({
  json: {
    _outcome: 'preview — nothing sent',
    _reason:  'Twilio not written: DRY_RUN is true or the account sid / auth token is blank',
    card_url: i.json.card_url || i.json.card_url,
    to:       i.json._sms_to,
    from:     i.json._sms_from,
    body:     i.json._sms_body,
    summary:  i.json.summary
  }
}));
