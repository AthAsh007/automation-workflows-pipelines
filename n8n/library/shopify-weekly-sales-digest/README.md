# Post a weekly Shopify sales digest by product to Slack

Every Monday reads 14 days of Shopify orders one day at a time, compares the last 7 days with the 7 before and with a trailing 4-week average kept in Google Sheets, names products that are falling, and posts one Slack digest. A failed or capped read is reported instead of a misleading digest.

Import `shopify-weekly-sales-digest-publish.json` into n8n. It runs on import with no credentials: the shipped `config` takes the built-in sample path and stops on a named `STOP:` node before anything is sent or written.

## Who it's for

Shopify store owners and small e-commerce teams who want Monday's numbers in the team channel without opening Shopify Analytics, and who want to know whether a good or bad week is unusual or just normal noise.

## How it works

1. Every Monday at 08:30 it reads the last 14 days of orders from Shopify as 14 one-day requests, or sample orders until Shopify is connected. A day that fails to load, or hits the 250-order page limit, is recorded.
2. If any day failed, the digest is not built. Slack gets a short notice naming the failed days instead of a report with missing revenue.
3. Cancelled and test orders are dropped. For each week it totals revenue, orders, average order value, units, discount codes and new versus returning customers. Refunds count in the week they were issued.
4. This week is compared with last week and with the average of the previous `BASELINE_WEEKS` weeks read from a Weekly sales tab. Products whose revenue fell by `FALLING_DROP_PCT` or more are named.
5. The digest is posted to Slack and this week's totals are upserted into the Weekly sales tab, keyed on the week, so a rerun does not add a second row.

## Sections on the canvas

1. **Start and settings.** Runs Monday at 08:30 so the 7-day window covers the full previous week. Formatting, the baseline length and the falling-product thresholds live in `config`.
2. **Read two weeks of orders.** `Build one request per day` splits 14 days into one-day reads so the 250-order page limit applies per day, not per fortnight. `Fetch one day of orders` keeps going on an error so `Read Shopify orders` can name the failed day.
3. **Stop on a failed read.** A missing day would look like a sales drop. `Every day read?` sends any gap to `Write the failed-read notice`, which is posted in place of the digest. The history write is never reached, so a bad week is not saved.
4. **Read the weekly history.** The Weekly sales tab holds one row per past week. `Load sample history` stands in until `HISTORY_SHEET_ID` is set, so the baseline line shows on the first run.
5. **Compare the weeks.** Refunds land in the week they were issued. Product revenue is before order discounts so a promotion does not make a product look weaker. The baseline ignores a saved row for this same week, so a rerun does not compare a week with itself.
6. **Post and save the week.** The digest is built on every run so a dry run can be read in the execution. Only a live run with a sheet writes history, and `Upsert the week in history` matches on Week, so a second run on one Monday updates the row.

## Setup

1. Run it once as imported. It builds the digest from sample orders and sample history and stops at `STOP: no Slack channel` and `STOP: history not saved`.
2. Add a Shopify access token credential to `Fetch one day of orders`, set `SHOP_DOMAIN` and `USE_SHOPIFY = true`.
3. Create a Weekly sales tab with columns Week, Revenue, Orders, AOV, Refunds, Net, New customers. Connect Google Sheets and set `HISTORY_SHEET_ID`.
4. Add a Slack credential and set `SLACK_CHANNEL_ID`, then set `DRY_RUN = false` to post and save every Monday.

## Settings in `config`

| Setting | Ships as | What it does |
|---|---|---|
| `USE_SHOPIFY` | `false` | set true after adding the Shopify credential to the fetch node |
| `SHOP_DOMAIN` | `'your-store.myshopify.com'` | your myshopify.com domain |
| `TOP_PRODUCTS` | `5` | products listed in the digest |
| `HISTORY_SHEET_ID` | `''` | Google Sheets id with a Weekly sales tab; blank uses sample history and saves nothing |
| `BASELINE_WEEKS` | `4` | earlier weeks averaged for the trend line |
| `FALLING_DROP_PCT` | `30` | a product whose revenue fell by this percent or more is called out |
| `FALLING_MIN_REVENUE` | `50` | only products that made at least this much last week can be called out |
| `CURRENCY` | `'USD'` | currency for formatting |
| `LOCALE` | `'en-US'` | number format |
| `SLACK_CHANNEL_ID` | `''` | channel for the digest; blank posts nothing |
| `DRY_RUN` | `true` | ships true. The run computes and reports, and writes nothing. |

## Nodes that need a credential

- `Fetch one day of orders`
- `Post the failed-read notice`
- `Read the weekly history`
- `Upsert the week in history`
- `Post the digest to Slack`

## Requirements

- A Shopify store
- A custom app token with read_orders
- A Slack workspace
- Optional: a Google Sheet for the weekly history

## Customising

- `TOP_PRODUCTS` sets how many products the digest lists.
- `BASELINE_WEEKS`, `FALLING_DROP_PCT` and `FALLING_MIN_REVENUE` control the trend line and which products are called out.
- `CURRENCY` and `LOCALE` control number formatting. Change the schedule on `Every Monday at 08:30` for a different reporting day.

## Verified

Every scenario below was run by `_kit/simulate.ts`: the real Code-node JavaScript and IF/Switch logic, with service calls replaced by canned responses.

| Scenario | Nodes run | Sends or writes | Ends at |
|---|---|---|---|
| shipped config (dry run) | 16 | none | `STOP: history not saved`, `STOP: no Slack channel` |
| live with Shopify, history and Slack | 19 | `Upsert the week in history`, `Post the digest to Slack` | `Upsert the week in history`, `Post the digest to Slack` |
| a failed day posts a notice, not a digest | 11 | `Post the failed-read notice` | `Post the failed-read notice` |
