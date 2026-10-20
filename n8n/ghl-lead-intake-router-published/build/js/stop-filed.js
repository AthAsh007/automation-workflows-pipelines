// The contact reached GoHighLevel. This node's output is the confirmation: whatever the API
// returned for the contact it created or updated.
return $input.all().map((i) => ({
  json: {
    _outcome: 'filed',
    _reason: 'the contact was written to GoHighLevel',
    ghl_response: i.json
  }
}));
