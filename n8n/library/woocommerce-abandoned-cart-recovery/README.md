# Recover abandoned WooCommerce carts with a two-step Gmail sequence

Every hour finds unpaid WooCommerce orders, sends a reminder after 1 hour and a second one after 24 hours with a coupon for carts over a threshold, stops as soon as the customer pays or buys again, and records the step on the order.

Import `woocommerce-abandoned-cart-recovery-publish.json` into n8n. It runs on import with no credentials: the shipped `config` takes the built-in sample path and stops on a named `STOP:` node before anything is sent or written.

## Who it's for

WooCommerce stores where checkout creates a pending order before payment, and customers drop off at the payment step. It works on those orders, so no cart-tracking plugin is needed.

## How it works

1. Every hour it reads the last 4 days of WooCommerce orders, or 10 sample orders until WooCommerce is connected.
2. Pending and on-hold orders are carts. An order paid since, or a newer paid order from the same email, ends the sequence.
3. Step 1 goes after 1 hour. Step 2 goes after 24 hours and adds the `COUPON_CODE` when the cart is worth 100 or more. Nothing is sent after 72 hours.
4. On-hold orders paid by bank transfer or cheque are left alone, since they are waiting on the customer's bank, not abandoned.
5. After a live send the step is written to the order as `recovery_step`, so no step is ever sent twice.

## Sections on the canvas

1. **Start and settings.** Runs every hour at :15 so step 1 lands between 1 and 2 hours after checkout. Delays, subjects, the coupon and its threshold all sit in `config`.
2. **Read recent orders.** One call returns paid and unpaid orders from the last 4 days, which is what lets the picker see that a customer bought on a second try. `Load sample orders` stands in until `USE_WOOCOMMERCE` is true.
3. **Pick the step and write.** Stop rules run before timing: paid, bought since, offline payment, too small, too old. A cart past 24 hours that never got step 1 goes straight to step 2 rather than receiving both at once.
4. **Send and record.** Nothing is emailed while `TEST_RUN` is true and `TEST_EMAIL` is blank. A test send leaves the orders alone; only a live send writes `recovery_step`, which is what stops a repeat.

## Setup

1. Run it once as imported. It previews against sample orders and stops at `STOP: preview - nothing sent`.
2. Add a WooCommerce credential to `Fetch recent orders` and `Record the step on the order`, set `STORE_URL` and `USE_WOOCOMMERCE = true`.
3. Create the coupon named in `COUPON_CODE` in WooCommerce (limit it to one use per customer), and connect Gmail.
4. Put your address in `TEST_EMAIL` to get every message yourself, then set `TEST_RUN = false`.

## Settings in `config`

| Setting | Ships as | What it does |
|---|---|---|
| `USE_WOOCOMMERCE` | `false` | set true after adding the WooCommerce credential to both WooCommerce nodes |
| `STORE_URL` | `'https://shop.yourstore.example'` | your store address, no trailing slash |
| `STORE_NAME` | `'Harbor Tea Co'` | used in subjects and sign-off |
| `STEPS` | `[{"step":1,"after_hours":1,"subject":"Yo` | sequence: hours since the order was created before each step |
| `STOP_AFTER_HOURS` | `72` | carts older than this get nothing more |
| `COUPON_CODE` | `'COMEBACK10'` | existing WooCommerce coupon added to step 2 |
| `COUPON_MIN_TOTAL` | `100` | step 2 includes the coupon only for carts at or above this total |
| `MIN_CART_TOTAL` | `15` | carts below this are not chased |
| `OFFLINE_METHODS` | `["bacs","cheque","cod"]` | payment methods where on-hold means waiting for the bank, not abandoned |
| `HOURLY_CAP` | `30` | hard ceiling on emails per run |
| `TEST_RUN` | `true` | ships true. Nothing reaches a real recipient or system. |
| `TEST_EMAIL` | `''` | blank means preview only; set it and sends are redirected there |

## Nodes that need a credential

- `Fetch recent orders`
- `Email the recovery message`
- `Record the step on the order`

## Requirements

- A WooCommerce store with REST API keys
- A Gmail account
- One coupon created in WooCommerce

## Customising

- `STEPS` holds the delay and subject of each message.
- `COUPON_MIN_TOTAL` and `COUPON_CODE` control who gets the discount.
- `MIN_CART_TOTAL` and `HOURLY_CAP` keep small carts and big batches out.

## Verified

Every scenario below was run by `_kit/simulate.ts`: the real Code-node JavaScript and IF/Switch logic, with service calls replaced by canned responses.

| Scenario | Nodes run | Sends or writes | Ends at |
|---|---|---|---|
| shipped config (preview) | 9 | none | `STOP: preview - nothing sent` |
| test send to TEST_EMAIL | 11 | `Email the recovery message` | `STOP: test send - orders untouched` |
| live with WooCommerce | 12 | `Email the recovery message`, `Record the step on the order` | `Record the step on the order` |
