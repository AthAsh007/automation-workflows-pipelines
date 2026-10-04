// PREVIEW mode: the nudges and the digest were built but not sent. Open this node's
// output to read them.
return $input.all().map((i) => ({ json: Object.assign({}, i.json, { _outcome: 'preview' }) }));
