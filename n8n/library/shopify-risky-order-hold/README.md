# Flag risky Shopify orders to Slack before fulfilment

Scores every unfulfilled Shopify order on mismatched countries, high-value first orders, freight forwarder addresses, bulk quantities, disposable email domains and Shopify's own risk level, tags the risky ones for review and alerts Slack before anyone packs them.

Import `shopify-risky-order-hold-publish.json` into n8n. It runs on import with no credentials: the shipped `config` takes the built-in sample path and stops on a named `STOP:` node before anything is sent or written.

## Who it's for

Shopify merchants who fulfil the same day and have been hit by chargebacks on orders that looked odd in hindsight. It flags those orders while there is still time to call the customer.

## How it works

1. Every 30 minutes it reads unfulfilled orders from the last 2 days through the Shopify GraphQL Admin API, or 7 sample orders until Shopify is connected.
2. Each order collects points: Shopify high risk 40, cancel recommendation 30, billing and shipping countries differ 20, first order over 300 25, freight forwarder address 25, a line of 5 or more units 15, disposable email domain 15.
3. At 50 points the order is held: tagged `risk-review` so your packing team skips it. From 30 to 49 it is listed to watch.
4. Orders already tagged `risk-review` or `risk-cleared` are not scored again, so clearing an order is just adding that tag.

## Sections on the canvas

1. **Start and settings.** Runs every 30 minutes so an order is scored well before the next packing round. Points, thresholds, word lists and tags all live in `config`.
2. **Read unfulfilled orders.** Shopify retired the REST order risk endpoint, so `Fetch unfulfilled orders` asks the GraphQL Admin API for orders and their risk summary in one read-only call. `Load sample orders` mirrors the result until `USE_SHOPIFY` is true.
3. **Score every order.** Shopify's own risk level is one signal among several, because it misses forwarders and bulk resale orders. Already-tagged orders are skipped first, so a cleared order never comes back.
4. **Tag and alert.** Only `HOLD_SCORE` orders are tagged; watch orders are listed but left alone. Tagging and posting each sit behind a live check, so a dry run shows the full alert text and changes nothing.

## Setup

1. Run it once as imported. It scores the sample orders and stops at `STOP: dry run - orders untouched`.
2. Add a Shopify access token credential to `Fetch unfulfilled orders` and `Tag the order for review`, set `SHOP_DOMAIN` and `USE_SHOPIFY = true`.
3. Set `SLACK_CHANNEL_ID` and adjust `POINTS` and the word lists to your store.
4. Set `DRY_RUN = false` once a few runs look right.

## Settings in `config`

| Setting | Ships as | What it does |
|---|---|---|
| `USE_SHOPIFY` | `false` | set true after adding the Shopify credential to both Shopify nodes |
| `SHOP_DOMAIN` | `'your-store.myshopify.com'` | your myshopify.com domain |
| `LOOKBACK_HOURS` | `48` | unfulfilled orders created in this window are scored |
| `POINTS` | `{"shopify_high":40,"shopify_medium":15,"` | points per signal |
| `HIGH_VALUE` | `300` | a first order at or above this total is a signal |
| `BULK_QTY` | `5` | a single line with this many units is a signal |
| `FORWARDER_WORDS` | `["shipito","myus","planet express","forw` | address fragments that suggest a parcel forwarder |
| `DISPOSABLE_DOMAINS` | `["mailinator.com","guerrillamail.com","t` | throwaway email domains |
| `RISKY_COUNTRIES` | `[]` | shipping country codes you treat as higher risk |
| `HOLD_SCORE` | `50` | orders at or above this are tagged for review |
| `WATCH_SCORE` | `30` | orders at or above this are listed in the alert but not tagged |
| `REVIEW_TAG` | `'risk-review'` | tag added to held orders |
| `CLEARED_TAG` | `'risk-cleared'` | add this tag by hand to clear an order; it is never scored again |
| `SLACK_CHANNEL_ID` | `''` | channel for the alert; blank posts nothing |
| `DRY_RUN` | `true` | ships true. The run computes and reports, and writes nothing. |

## Nodes that need a credential

- `Fetch unfulfilled orders`
- `Tag the order for review`
- `Alert the fulfilment channel`

## Requirements

- A Shopify store
- A custom app token with read_orders and write_orders
- A Slack workspace

## Customising

- `HOLD_SCORE` and `WATCH_SCORE` set the two lines.
- `FORWARDER_WORDS` and `DISPOSABLE_DOMAINS` hold the address and email patterns.
- `HIGH_VALUE` sets what counts as a large first order.

## Verified

Every scenario below was run by `_kit/simulate.ts`: the real Code-node JavaScript and IF/Switch logic, with service calls replaced by canned responses.

| Scenario | Nodes run | Sends or writes | Ends at |
|---|---|---|---|
| shipped config (dry run) | 13 | none | `STOP: dry run - orders untouched`, `STOP: no Slack channel` |
| live with Shopify and Slack | 15 | `Tag the order for review`, `Alert the fulfilment channel` | `Tag the order for review`, `Alert the fulfilment channel` |
