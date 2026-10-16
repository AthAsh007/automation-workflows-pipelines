# Post a weekly Shopify sales digest by product to Slack

Every Monday compares the last 7 days of Shopify orders with the 7 before: revenue, orders, average order value, refunds by the week they happened, discount code usage, new versus returning customers, and the top products with their week-over-week change, posted as one Slack message.

Import `shopify-weekly-sales-digest-publish.json` into n8n. It runs on import with no credentials: the shipped `config` takes the built-in sample path and stops on a named `STOP:` node before anything is sent or written.

## Who it's for

Shopify store owners and small e-commerce teams who want Monday's numbers in the team channel without opening Shopify Analytics or exporting a report.

## How it works

1. Every Monday at 08:30 it reads the last 14 days of orders from Shopify, or 14 sample orders until Shopify is connected.
2. Cancelled and test orders are dropped. The rest are split into this week and the week before.
3. For each week it totals revenue, orders, average order value, units, discount codes used and new versus returning customers. Refunds count in the week they were issued, not the week of the order.
4. Products are ranked by this week's revenue with the change against last week, and the digest is posted to Slack.

## Sections on the canvas

1. **Start and settings.** Runs Monday at 08:30 so the 7-day window covers the full previous week. Formatting and how many products to list live in `config`.
2. **Read two weeks of orders.** One read covers both weeks, so this week and last are always counted the same way. `Load sample orders` includes a cancelled and a test order to show they are left out.
3. **Compare the weeks.** Refunds land in the week they were issued, which is when the money left. Product revenue is line price times quantity, before order-level discounts, so a promotion does not make a product look weaker.
4. **Post to Slack.** The digest text is built on every run so a dry run can be read in the execution. A blank channel and a dry run each end on their own STOP.

## Setup

1. Run it once as imported. It builds the digest from sample orders and stops at `STOP: no Slack channel`.
2. Add a Shopify access token credential to `Fetch orders from the last 14 days`, set `SHOP_DOMAIN` and `USE_SHOPIFY = true`.
3. Add a Slack credential and set `SLACK_CHANNEL_ID`.
4. Set `DRY_RUN = false` to post every Monday.

## Settings in `config`

| Setting | Ships as | What it does |
|---|---|---|
| `USE_SHOPIFY` | `false` | set true after adding the Shopify credential to the fetch node |
| `SHOP_DOMAIN` | `'your-store.myshopify.com'` | your myshopify.com domain |
| `TOP_PRODUCTS` | `5` | products listed in the digest |
| `CURRENCY` | `'USD'` | currency for formatting |
| `LOCALE` | `'en-US'` | number format |
| `SLACK_CHANNEL_ID` | `''` | channel for the digest; blank posts nothing |
| `DRY_RUN` | `true` | ships true. The run computes and reports, and writes nothing. |

## Nodes that need a credential

- `Fetch orders from the last 14 days`
- `Post the digest to Slack`

## Requirements

- A Shopify store
- A custom app token with read_orders
- A Slack workspace

## Customising

- `TOP_PRODUCTS` sets how many products the digest lists.
- `CURRENCY` and `LOCALE` control number formatting.
- Change the schedule on `Every Monday at 08:30` for a different reporting day.

## Verified

Every scenario below was run by `_kit/simulate.ts`: the real Code-node JavaScript and IF/Switch logic, with service calls replaced by canned responses.

| Scenario | Nodes run | Sends or writes | Ends at |
|---|---|---|---|
| shipped config (dry run) | 9 | none | `STOP: no Slack channel` |
| live with Shopify and Slack | 11 | `Post the digest to Slack` | `Post the digest to Slack` |
