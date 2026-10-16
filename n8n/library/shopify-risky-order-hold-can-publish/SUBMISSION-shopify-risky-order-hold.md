# Flag risky Shopify orders to Slack before fulfilment

**Who's it for**
Shopify merchants who fulfil the same day and have been hit by chargebacks on orders that looked odd in hindsight. It flags those orders while there is still time to call the customer.

**How it works**
1. Every 30 minutes it reads unfulfilled orders from the last 2 days through the Shopify GraphQL Admin API, or 7 sample orders until Shopify is connected.
2. Each order collects points: Shopify high risk 40, cancel recommendation 30, billing and shipping countries differ 20, first order over 300 25, freight forwarder address 25, a line of 5 or more units 15, disposable email domain 15.
3. At 50 points the order is held: tagged `risk-review` so your packing team skips it. From 30 to 49 it is listed to watch.
4. Orders already tagged `risk-review` or `risk-cleared` are not scored again, so clearing an order is just adding that tag.

**How to set up**
1. Run it once as imported. It scores the sample orders and stops at `STOP: dry run - orders untouched`.
2. Add a Shopify access token credential to `Fetch unfulfilled orders` and `Tag the order for review`, set `SHOP_DOMAIN` and `USE_SHOPIFY = true`.
3. Set `SLACK_CHANNEL_ID` and adjust `POINTS` and the word lists to your store.
4. Set `DRY_RUN = false` once a few runs look right.

**Requirements**
- A Shopify store
- A custom app token with read_orders and write_orders
- A Slack workspace

**How to customize**
- `HOLD_SCORE` and `WATCH_SCORE` set the two lines.
- `FORWARDER_WORDS` and `DISPOSABLE_DOMAINS` hold the address and email patterns.
- `HIGH_VALUE` sets what counts as a large first order.
