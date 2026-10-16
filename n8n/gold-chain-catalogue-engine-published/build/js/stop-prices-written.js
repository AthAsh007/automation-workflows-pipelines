// The Stock tab now carries today's price, rate and quantity for every priced chain.
const n = $input.all().length;
return [{ json: { _outcome: 'written', _reason: n + " stock row(s) updated with today's price and rate" } }];
