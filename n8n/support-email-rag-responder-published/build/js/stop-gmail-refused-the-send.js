// Gmail refused a send after the node's retries: a reply, a test copy or an escalation alert.
// Gmail's own error is kept on the item so the cause is readable (expired credential, a
// deleted message, a quota). The customer has not been answered: a person picks it up here.
return $input.all().map((i) => ({ json: {
  outcome: 'Gmail refused the send',
  error: (i.json.error && (i.json.error.message || i.json.error)) || i.json.message || 'unknown error',
  detail: i.json.error && i.json.error.description ? i.json.error.description : ''
} }));
