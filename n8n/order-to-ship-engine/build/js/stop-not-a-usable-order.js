// Not a usable order. Dropped here rather than reaching the board, with the reasons kept
// so the execution list says why. An awaiting-deposit Square order lands here too — it is
// not lost, it just waits until Square posts the payment webhook.
return $input.all().map((i) => ({
  json: Object.assign({}, i.json, {
    _outcome: 'rejected',
    _reason: (i.json._problems || []).join('; ') || 'did not read as an order'
  })
}));
