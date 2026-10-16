// Emails that cannot be answered at all: no sender, no body, our own mail, or an automatic
// or bulk message. Dropped here, by name, with the reason, so the execution list shows what
// was ignored and why instead of it vanishing.
return $input.all().map((i) => ({ json: {
  outcome: 'ignored: ' + i.json.problem,
  from: i.json.from || '(none)',
  subject: i.json.subject || '(none)',
  message_id: i.json.message_id
} }));
