// The store redelivered an order we already hold (webhooks retry; Shopify and Etsy both
// do). The row already exists, so nothing is written twice — "never typed twice". The
// store still gets a friendly ok so its webhook stops retrying.
return $input.all().map((i) => ({
  json: Object.assign({}, i.json, {
    _outcome: 'duplicate',
    _reason: 'order ' + i.json.order_key + ' is already on the board'
  })
}));
