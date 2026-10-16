// The touch reached GoHighLevel. This node's output is the confirmation: whatever the
// conversations endpoint returned for the message it queued.
return $input.all().map((i) => ({
  json: {
    _outcome: 'sent',
    _reason: 'the touch was queued through GoHighLevel',
    ghl_response: i.json
  }
}));
