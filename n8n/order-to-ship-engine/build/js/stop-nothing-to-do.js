// Nothing on the board needs this run: no rows flipped to Shipped that are waiting on an
// email, nothing shipped before it was confirmed. The run still completes cleanly.
return $input.all().map((i) => ({
  json: Object.assign({}, i.json, { _outcome: 'nothing_to_do' })
}));
