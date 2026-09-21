// Preview or demo mode: the shipping email was composed but not sent, so the row is NOT
// marked as emailed — the next run will try again, which is right, because nothing went
// out. Open this node to read the email the customer would get.
return $input.all().map((i) => ({
  json: Object.assign({}, i.json, {
    _outcome: 'preview',
    _reason: 'preview mode — shipping email composed, not sent'
  })
}));
