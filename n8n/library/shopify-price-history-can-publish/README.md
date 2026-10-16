# Record Shopify price changes into a Google Sheets price history

Compares every Shopify variant price with yesterday's snapshot in Google Sheets, appends each change with its percentage and type (drop, rise, sale started or ended, new, removed) to a history tab, and flags large drops and likely decimal slips to Slack.

Import `shopify-price-history-publish.json` into n8n. It runs on import with no credentials: the shipped `config` takes the built-in sample path and stops on a named `STOP:` node before anything is sent or written.

## Who it's for

Shopify merchants and pricing managers who need to answer "when did this price change and by how much" without digging through admin logs, and who want to catch a 99.00 typed as 9.90 before it sells out.

## How it works

1. Every day at 06:00 it reads all product variants from Shopify, or 7 sample variants until Shopify is connected.
2. It loads the last snapshot from the Price snapshot tab and compares price and compare-at price for every variant.
3. Each change becomes a history row: old and new price, delta, percent, and a type such as drop, rise, sale started, sale ended, new or removed.
4. Drops of 25% or more are flagged, and a new price close to a tenth of the old one is marked as a possible decimal slip.
5. History rows are appended, the snapshot is updated, and flagged drops go to Slack.

## Sections on the canvas

1. **Start and settings.** Runs daily at 06:00, before most stores change prices, so each row reads as one day's change. Thresholds and skipped product types live in `config`.
2. **Read current prices.** `Read Shopify variants` flattens products into variants and drops gift cards, whose price is a face value, not a price. `Load sample variants` stands in until `USE_SHOPIFY` is true.
3. **Compare with the snapshot.** The snapshot tab is yesterday's price list. With an empty snapshot the run is a baseline: it fills the snapshot and writes no history, so the first day does not log every variant as new.
4. **Write history and alert.** History is appended before the snapshot moves, so a failed append leaves yesterday's snapshot and the change is caught again tomorrow. Only flagged drops reach Slack; ordinary changes stay in the sheet.

## Setup

1. Run it once as imported. It compares the sample data and stops at `STOP: dry run - sheet untouched`.
2. Add a Shopify access token credential to `Fetch product variants`, set `SHOP_DOMAIN` and `USE_SHOPIFY = true`.
3. Create a sheet with a Price snapshot tab and a Price history tab and put its id in `PRICE_SHEET_ID`. The first live run fills the snapshot.
4. Optionally set `SLACK_CHANNEL_ID`, then set `DRY_RUN = false`.

## Settings in `config`

| Setting | Ships as | What it does |
|---|---|---|
| `USE_SHOPIFY` | `false` | set true after adding the Shopify credential to the fetch node |
| `SHOP_DOMAIN` | `'your-store.myshopify.com'` | your myshopify.com domain |
| `PRICE_SHEET_ID` | `''` | Google Sheets id with Price snapshot and Price history tabs |
| `DROP_ALERT_PCT` | `25` | drops of at least this percent are flagged and posted |
| `IGNORE_UNDER_PCT` | `0.5` | price moves smaller than this percent are not recorded |
| `SKIP_PRODUCT_TYPES` | `["Gift Card","Sample"]` | Shopify product types left out |
| `SLACK_CHANNEL_ID` | `''` | channel for flagged drops; blank skips Slack |
| `DRY_RUN` | `true` | ships true. The run computes and reports, and writes nothing. |

## Nodes that need a credential

- `Fetch product variants`
- `Read the last snapshot`
- `Append to price history`
- `Update the price snapshot`
- `Post flagged drops to Slack`

## Requirements

- A Shopify store
- A custom app token with read_products
- A Google Sheet with two tabs
- Optional: a Slack workspace

## Customising

- `DROP_ALERT_PCT` sets how big a drop must be to reach Slack.
- `IGNORE_UNDER_PCT` hides rounding changes below that percent.
- `SKIP_PRODUCT_TYPES` leaves gift cards and samples out of the history.

## Verified

Every scenario below was run by `_kit/simulate.ts`: the real Code-node JavaScript and IF/Switch logic, with service calls replaced by canned responses.

| Scenario | Nodes run | Sends or writes | Ends at |
|---|---|---|---|
| shipped config (dry run) | 16 | none | `STOP: dry run - sheet untouched`, `STOP: no Slack channel` |
| live with Shopify, the sheet and Slack | 20 | `Append to price history`, `Update the price snapshot`, `Post flagged drops to Slack` | `Update the price snapshot`, `Post flagged drops to Slack` |
