# Welcome new Lemon Squeezy customers and tag them in ConvertKit

Receives Lemon Squeezy order webhooks, ignores retries, unpaid orders and other events, recognises repeat buyers and lifetime spend, sends a welcome (or welcome back) email written for the product bought, subscribes the buyer to a ConvertKit form with product, repeat and VIP tags, and removes the product tag again when an order is refunded. Test-mode orders only ever reach your test address.

Import `lemonsqueezy-customer-onboarding-publish.json` into n8n. It runs on import with no credentials: the shipped `config` takes the built-in sample path and stops on a named `STOP:` node before anything is sent or written.

## Who it's for

Creators selling templates, courses or software on Lemon Squeezy who want each buyer to get a product-specific welcome and land in the right ConvertKit segment, instead of one generic receipt.

## How it works

1. Lemon Squeezy calls the webhook on every new order. A manual run uses 5 sample payloads instead.
2. Only `order_created` events for your store with status paid go on. Lemon Squeezy retries are dropped by order id.
3. Orders placed in Lemon Squeezy test mode are never treated as real: the welcome goes to `TEST_EMAIL` and ConvertKit is skipped.
4. The first item's product id picks the welcome subject and text, the ConvertKit form and the tag from `PRODUCTS`, with a default for unlisted products.
5. Each buyer's orders are remembered by email. A second purchase opens with "welcome back" and the order count instead of the first-time intro, adds `REPEAT_TAG_ID`, and lifetime spend at or above `VIP_SPEND` adds `VIP_TAG_ID`.
6. The welcome is sent from Gmail, then the buyer is added to the form with the product tag plus any repeat or VIP tag.
7. An `order_refunded` event sends no email: the product tag is removed in ConvertKit so the buyer drops out of that product's sequence, and the order no longer counts toward spend.

## Sections on the canvas

1. **Start and settings.** The webhook answers Lemon Squeezy at once and then runs; the manual trigger replays sample payloads. Product copy, form ids and tag ids all live in `config`.
2. **Read the payload.** `Read the webhook payload` passes the JSON body on, or a marker on a manual run so `Load sample payloads` takes over with the same Lemon Squeezy shape.
3. **Check the order.** Cheap checks come first: wrong event, wrong store, unpaid, retry. The `test_mode` flag is trusted over everything else. The customer record decides repeat and VIP, and a refund becomes an untag job.
4. **Welcome buyers, untag refunds.** Top lane: repeat buyers get a welcome back opener, ConvertKit is touched only on a live run for a real order with a form id, and the order is remembered after the subscribe call so a retry is dropped. Bottom lane: a refund removes the product tag and marks the order refunded so it stops counting toward repeat and VIP.

## Setup

1. Run it once as imported. It processes the sample payloads and stops at `STOP: preview - nothing sent`.
2. Activate the workflow and add the production URL of `Lemon Squeezy order webhook` in Lemon Squeezy under Settings, Webhooks, with the order_created and order_refunded events. Set `STORE_ID`.
3. Connect Gmail, add a ConvertKit credential to `Add to the ConvertKit form`, and fill `PRODUCTS` with your product ids, form ids, tag ids and welcome copy.
4. Put your address in `TEST_EMAIL`, place a test-mode order in Lemon Squeezy, then set `TEST_RUN = false`.

## Settings in `config`

| Setting | Ships as | What it does |
|---|---|---|
| `STORE_ID` | `''` | your Lemon Squeezy store id; blank accepts any store |
| `PRODUCTS` | `{"11":{"name":"Budget Planner for Notion` | Lemon Squeezy product id -> welcome copy, ConvertKit form id and tag id |
| `DEFAULT_PRODUCT` | `{"subject":"Thanks for your order, {firs` | used for products not in PRODUCTS |
| `REPEAT_TAG_ID` | `''` | ConvertKit tag added from the second paid order on; blank skips it |
| `VIP_TAG_ID` | `''` | ConvertKit tag added once lifetime spend reaches VIP_SPEND; blank skips it |
| `VIP_SPEND` | `150` | lifetime spend (store currency, refunds excluded) that makes a buyer VIP |
| `SENDER_NAME` | `'Maya at Paperlane'` | sign-off on every email |
| `TEST_RUN` | `true` | ships true. Nothing reaches a real recipient or system. |
| `TEST_EMAIL` | `''` | blank means preview only; set it and sends are redirected there |

## Nodes that need a credential

- `Email the welcome`
- `Add to the ConvertKit form`
- `Remove the product tag`

## Requirements

- A Lemon Squeezy store
- A Gmail account
- A ConvertKit account with a form and tags

## Customising

- `PRODUCTS` holds the subject, welcome lines, form id and tag id per product.
- `DEFAULT_PRODUCT` covers anything not listed.
- `REPEAT_TAG_ID`, `VIP_TAG_ID` and `VIP_SPEND` control the returning-customer segments; leave a tag id blank to skip it.
- `SENDER_NAME` signs every email.

## Verified

Every scenario below was run by `_kit/simulate.ts`: the real Code-node JavaScript and IF/Switch logic, with service calls replaced by canned responses.

| Scenario | Nodes run | Sends or writes | Ends at |
|---|---|---|---|
| shipped config (preview) | 13 | none | `STOP: preview - nothing sent`, `STOP: preview, test or no tag - refund not untagged` |
| test-mode order goes only to TEST_EMAIL | 12 | `Email the welcome` | `STOP: test, or no form id - ConvertKit untouched` |
| live order subscribes to ConvertKit | 13 | `Email the welcome`, `Add to the ConvertKit form` | `Remember welcomed orders` |
| live refund removes the product tag | 11 | `Remove the product tag` | `Mark orders refunded` |
