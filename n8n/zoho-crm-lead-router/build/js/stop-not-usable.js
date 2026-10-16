// The lead was dropped on purpose, and this node exists so that is visible in the execution
// list rather than a run that quietly produced nothing. `_reason` says which check failed:
// no name to file it under, no way to reply, or it reads as spam.
return $input.all().map((i) => ({
  json: {
    _outcome: 'dropped',
    _reason: i.json._why || 'did not pass the intake check',
    source: i.json.source,
    email: i.json.email,
    phone: i.json.phone,
    summary: String(i.json.summary || '').slice(0, 200)
  }
}));
