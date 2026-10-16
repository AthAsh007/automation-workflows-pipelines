# Post a weekly Shopify sales digest by product to Slack

**Who's it for**
Shopify store owners and small e-commerce teams who want Monday's numbers in the team channel without opening Shopify Analytics or exporting a report.

**How it works**
1. Every Monday at 08:30 it reads the last 14 days of orders from Shopify, or 14 sample orders until Shopify is connected.
2. Cancelled and test orders are dropped. The rest are split into this week and the week before.
3. For each week it totals revenue, orders, average order value, units, discount codes used and new versus returning customers. Refunds count in the week they were issued, not the week of the order.
4. Products are ranked by this week's revenue with the change against last week, and the digest is posted to Slack.

**How to set up**
1. Run it once as imported. It builds the digest from sample orders and stops at `STOP: no Slack channel`.
2. Add a Shopify access token credential to `Fetch orders from the last 14 days`, set `SHOP_DOMAIN` and `USE_SHOPIFY = true`.
3. Add a Slack credential and set `SLACK_CHANNEL_ID`.
4. Set `DRY_RUN = false` to post every Monday.

**Requirements**
- A Shopify store
- A custom app token with read_orders
- A Slack workspace

**How to customize**
- `TOP_PRODUCTS` sets how many products the digest lists.
- `CURRENCY` and `LOCALE` control number formatting.
- Change the schedule on `Every Monday at 08:30` for a different reporting day.
