# Post a weekly Shopify sales digest by product to Slack

**Who's it for**
Shopify store owners and small e-commerce teams who want Monday's numbers in the team channel without opening Shopify Analytics, and who want to know whether a good or bad week is unusual or just normal noise.

**How it works**
1. Every Monday at 08:30 it reads the last 14 days of orders from Shopify as 14 one-day requests, or sample orders until Shopify is connected. A day that fails to load, or hits the 250-order page limit, is recorded.
2. If any day failed, the digest is not built. Slack gets a short notice naming the failed days instead of a report with missing revenue.
3. Cancelled and test orders are dropped. For each week it totals revenue, orders, average order value, units, discount codes and new versus returning customers. Refunds count in the week they were issued.
4. This week is compared with last week and with the average of the previous `BASELINE_WEEKS` weeks read from a Weekly sales tab. Products whose revenue fell by `FALLING_DROP_PCT` or more are named.
5. The digest is posted to Slack and this week's totals are upserted into the Weekly sales tab, keyed on the week, so a rerun does not add a second row.

**How to set up**
1. Run it once as imported. It builds the digest from sample orders and sample history and stops at `STOP: no Slack channel` and `STOP: history not saved`.
2. Add a Shopify access token credential to `Fetch one day of orders`, set `SHOP_DOMAIN` and `USE_SHOPIFY = true`.
3. Create a Weekly sales tab with columns Week, Revenue, Orders, AOV, Refunds, Net, New customers. Connect Google Sheets and set `HISTORY_SHEET_ID`.
4. Add a Slack credential and set `SLACK_CHANNEL_ID`, then set `DRY_RUN = false` to post and save every Monday.

**Requirements**
- A Shopify store
- A custom app token with read_orders
- A Slack workspace
- Optional: a Google Sheet for the weekly history

**How to customize**
- `TOP_PRODUCTS` sets how many products the digest lists.
- `BASELINE_WEEKS`, `FALLING_DROP_PCT` and `FALLING_MIN_REVENUE` control the trend line and which products are called out.
- `CURRENCY` and `LOCALE` control number formatting. Change the schedule on `Every Monday at 08:30` for a different reporting day.
