// The gold-rate service refused or failed. Nothing is priced on yesterday's number: a list
// that looks current but is not is worse than no list. The response is on this node.
return [{ json: {
  _outcome: 'stopped — nothing priced, nothing sent',
  _reason: 'the gold-rate request failed; see the error below',
  error: $input.first().json
} }];
