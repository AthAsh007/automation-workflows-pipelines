// A card this workflow cannot use — no phone number to SMS, or no lead label, etc.
// It is dropped here rather than sent into a Twilio call that would fail, but the
// reason is kept so the execution list says why the card was not texted.
return $input.all().map((i) => ({
  json: {
    _outcome: 'rejected',
    _reason:  (i.json._problems || []).join('; ') || 'card could not be read',
    card_url: i.json.card_url,
    summary:  i.json.summary
  }
}));
