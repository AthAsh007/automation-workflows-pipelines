# Record Shopify price changes into a Google Sheets price history

**Who's it for**
Shopify merchants and pricing managers who need to answer "when did this price change and by how much" without digging through admin logs, and who want to catch a 99.00 typed as 9.90 before it sells out.

**How it works**
1. Every day at 06:00 it reads all product variants from Shopify, or 7 sample variants until Shopify is connected.
2. It loads the last snapshot from the Price snapshot tab and compares price and compare-at price for every variant.
3. Each change becomes a history row: old and new price, delta, percent, and a type such as drop, rise, sale started, sale ended, new or removed.
4. Drops of 25% or more are flagged, and a new price close to a tenth of the old one is marked as a possible decimal slip.
5. History rows are appended, the snapshot is updated, and flagged drops go to Slack.

**How to set up**
1. Run it once as imported. It compares the sample data and stops at `STOP: dry run - sheet untouched`.
2. Add a Shopify access token credential to `Fetch product variants`, set `SHOP_DOMAIN` and `USE_SHOPIFY = true`.
3. Create a sheet with a Price snapshot tab and a Price history tab and put its id in `PRICE_SHEET_ID`. The first live run fills the snapshot.
4. Optionally set `SLACK_CHANNEL_ID`, then set `DRY_RUN = false`.

**Requirements**
- A Shopify store
- A custom app token with read_products
- A Google Sheet with two tabs
- Optional: a Slack workspace

**How to customize**
- `DROP_ALERT_PCT` sets how big a drop must be to reach Slack.
- `IGNORE_UNDER_PCT` hides rounding changes below that percent.
- `SKIP_PRODUCT_TYPES` leaves gift cards and samples out of the history.
