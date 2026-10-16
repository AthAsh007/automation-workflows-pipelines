# Request reviews by Gmail for delivered Shopify orders

Each day emails customers whose Shopify order was delivered 7 to 21 days ago, linking straight to the review page of the main product they bought, and skips refunded, cancelled and opted-out orders and anyone asked in the last 90 days.

Import `shopify-review-requests-publish.json` into n8n. It runs on import with no credentials: the shipped `config` takes the built-in sample path and stops on a named `STOP:` node before anything is sent or written.

## Who it's for

Shopify stores that want more product reviews but do not want to email the same customer every week or ask someone whose order went wrong.

## How it works

1. Every day at 11:00 it reads Shopify orders fulfilled in the last 60 days, or 9 sample orders until Shopify is connected.
2. Delivery date comes from carrier tracking; without tracking it assumes delivery 5 days after fulfilment.
3. An order is asked about 7 to 21 days after delivery. Refunded, cancelled and `no-review` orders are skipped, and so is any customer tagged as asked in the last 90 days.
4. The email names the most expensive item in the order and links to its review page from `REVIEW_LINKS`, or to a page built from `DEFAULT_REVIEW_URL`.
5. After a live send the customer gets a dated `review-requested-YYYY-MM-DD` tag, which is how the 90 days are counted.

## Sections on the canvas

1. **Start and settings.** Runs daily at 11:00, a time when review emails get opened. The asking window, cooldown and product review links all live in `config`.
2. **Read fulfilled orders.** `Read Shopify orders` takes the delivery date from carrier tracking when Shopify has it. Until `USE_SHOPIFY` is true, `Load sample orders` supplies the same shape with one order per skip rule.
3. **Pick and write.** Refunds and cancellations are checked before timing, so an unhappy customer is never asked. The cooldown is read from a dated customer tag, which survives a re-import of the workflow.
4. **Send and tag.** Nothing is emailed while `TEST_RUN` is true and `TEST_EMAIL` is blank. A test send leaves Shopify alone, so the real customer can still be asked; only a live send writes the dated tag.

## Setup

1. Run it once as imported. It previews against sample orders and stops at `STOP: preview - nothing sent`.
2. Add a Shopify access token credential to `Fetch fulfilled orders` and `Tag the customer in Shopify`, set `SHOP_DOMAIN` and `USE_SHOPIFY = true`.
3. Connect Gmail, fill `REVIEW_LINKS` for your main products and check `STORE_NAME`.
4. Put your address in `TEST_EMAIL` to receive every request yourself, then set `TEST_RUN = false`.

## Settings in `config`

| Setting | Ships as | What it does |
|---|---|---|
| `USE_SHOPIFY` | `false` | set true after adding the Shopify credential to both Shopify nodes |
| `SHOP_DOMAIN` | `'your-store.myshopify.com'` | your myshopify.com domain |
| `STORE_NAME` | `'Fernway Home'` | used in the subject and sign-off |
| `REQUEST_AFTER_DAYS` | `7` | days after delivery before asking |
| `MAX_DAYS_AFTER_DELIVERY` | `21` | after this many days the order is not asked about |
| `ASSUME_DELIVERY_DAYS` | `5` | without tracking, delivery is assumed this many days after fulfilment |
| `COOLDOWN_DAYS` | `90` | one request per customer in this many days |
| `REVIEW_LINKS` | `{"7001":"https://reviews.fernway.example` | Shopify product id -> review page |
| `DEFAULT_REVIEW_URL` | `'https://www.fernway.example/pages/rev...'` | used when a product has no entry in REVIEW_LINKS |
| `SKIP_TAGS` | `["no-review","wholesale"]` | order or customer tags that are never asked |
| `DAILY_CAP` | `50` | hard ceiling on requests per run |
| `TEST_RUN` | `true` | ships true. Nothing reaches a real recipient or system. |
| `TEST_EMAIL` | `''` | blank means preview only; set it and sends are redirected there |

## Nodes that need a credential

- `Fetch fulfilled orders`
- `Email the review request`
- `Tag the customer in Shopify`

## Requirements

- A Shopify store
- A custom app token with read_orders and write_customers
- A Gmail account

## Customising

- `REQUEST_AFTER_DAYS` and `MAX_DAYS_AFTER_DELIVERY` set the window.
- `COOLDOWN_DAYS` sets how long a customer rests between requests.
- `DAILY_CAP` limits sends per run.

## Verified

Every scenario below was run by `_kit/simulate.ts`: the real Code-node JavaScript and IF/Switch logic, with service calls replaced by canned responses.

| Scenario | Nodes run | Sends or writes | Ends at |
|---|---|---|---|
| shipped config (preview) | 9 | none | `STOP: preview - nothing sent` |
| test send to TEST_EMAIL | 11 | `Email the review request` | `STOP: test send - Shopify untouched` |
| live with Shopify | 12 | `Email the review request`, `Tag the customer in Shopify` | `Tag the customer in Shopify` |
