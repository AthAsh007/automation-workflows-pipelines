// PREVIEW mode: the row is in the sheet but no email is sent. Open this node's output
// to read exactly what the customer and the owner would have received.
return $input.all().map((i) => ({
  json: Object.assign({}, i.json, { _outcome: 'preview', _would_email: i.json.email })
}));
