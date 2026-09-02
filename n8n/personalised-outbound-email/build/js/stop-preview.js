// PREVIEW mode: TEST_RUN is on and TEST_EMAIL is blank, so nothing goes out.
// The full subject, html and text are still on the item - open this node's output in
// the execution view to read the exact email that would have been sent.
return $input.all().map((i) => ({
  json: Object.assign({}, i.json, { _outcome: 'preview', _would_send_to: i.json.email })
}));
