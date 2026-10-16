// Not a support request: sales pitches, newsletters, partnership offers. Routed out of the
// workflow here, by name, with the classifier's reason. Nothing is sent and the email is left
// in the inbox for whoever normally reads it.
return $input.all().map((i) => ({ json: {
  outcome: 'not a support email: left in the inbox',
  from: i.json.from,
  subject: i.json.subject,
  classified_by: i.json.classified_by,
  confidence: i.json.confidence,
  reason: i.json.route_reason
} }));
