# Welcome new Lemon Squeezy customers and tag them in ConvertKit

Receives Lemon Squeezy order_created webhooks, ignores retries, unpaid orders and other events, sends a welcome email written for the product bought, and subscribes the buyer to a ConvertKit form with that product's tag. Test-mode orders only ever reach your test address.

Import `lemonsqueezy-customer-onboarding-publish.json` into n8n. It runs on import with no credentials: the shipped `config` takes the built-in sample path and stops on a named `STOP:` node before anything is sent or written.

## Who it's for

Creators selling templates, courses or software on Lemon Squeezy who want each buyer to get a product-specific welcome and land in the right ConvertKit segment, instead of one generic receipt.

## How it works

1. Lemon Squeezy calls the webhook on every new order. A manual run uses 5 sample payloads instead.
2. Only `order_created` events for your store with status paid go on. Lemon Squeezy retries are dropped by order id.
3. Orders placed in Lemon Squeezy test mode are never treated as real: the welcome goes to `TEST_EMAIL` and ConvertKit is skipped.
4. The first item's product id picks the welcome subject and text, the ConvertKit form and the tag from `PRODUCTS`, with a default for unlisted products.
5. The welcome is sent from Gmail, then the buyer is added to the form with the tag and their first name.

## Sections on the canvas

1. **Start and settings.** The webhook answers Lemon Squeezy at once and then runs; the manual trigger replays sample payloads. Product copy, form ids and tag ids all live in `config`.
2. **Read the payload.** `Read the webhook payload` passes the JSON body on, or a marker on a manual run so `Load sample payloads` takes over with the same Lemon Squeezy shape.
3. **Check the order and write.** Cheap checks come first: wrong event, wrong store, unpaid, retry. The `test_mode` flag in the payload is trusted over everything else, so a test purchase can never reach a real inbox or list.
4. **Send and subscribe.** ConvertKit is only touched on a live run, for a real order, with a form id set. The order id is remembered after the subscribe call, so a Lemon Squeezy retry is dropped at the check.

## Setup

1. Run it once as imported. It processes the sample payloads and stops at `STOP: preview - nothing sent`.
2. Activate the workflow and add the production URL of `Lemon Squeezy order webhook` in Lemon Squeezy under Settings, Webhooks, with the order_created event. Set `STORE_ID`.
3. Connect Gmail, add a ConvertKit credential to `Add to the ConvertKit form`, and fill `PRODUCTS` with your product ids, form ids, tag ids and welcome copy.
4. Put your address in `TEST_EMAIL`, place a test-mode order in Lemon Squeezy, then set `TEST_RUN = false`.

## Settings in `config`

| Setting | Ships as | What it does |
|---|---|---|
| `STORE_ID` | `''` | your Lemon Squeezy store id; blank accepts any store |
| `PRODUCTS` | `{"11":{"name":"Budget Planner for Notion` | Lemon Squeezy product id -> welcome copy, ConvertKit form id and tag id |
| `DEFAULT_PRODUCT` | `{"subject":"Thanks for your order, {firs` | used for products not in PRODUCTS |
| `SENDER_NAME` | `'Maya at Paperlane'` | sign-off on every email |
| `TEST_RUN` | `true` | ships true. Nothing reaches a real recipient or system. |
| `TEST_EMAIL` | `''` | blank means preview only; set it and sends are redirected there |

## Nodes that need a credential

- `Email the welcome`
- `Add to the ConvertKit form`

## Requirements

- A Lemon Squeezy store
- A Gmail account
- A ConvertKit account with a form and tags

## Customising

- `PRODUCTS` holds the subject, welcome lines, form id and tag id per product.
- `DEFAULT_PRODUCT` covers anything not listed.
- `SENDER_NAME` signs every email.

## Verified

Every scenario below was run by `_kit/simulate.ts`: the real Code-node JavaScript and IF/Switch logic, with service calls replaced by canned responses.

| Scenario | Nodes run | Sends or writes | Ends at |
|---|---|---|---|
| shipped config (preview) | 10 | none | `STOP: preview - nothing sent` |
| test-mode order goes only to TEST_EMAIL | 11 | `Email the welcome` | `STOP: test, or no form id - ConvertKit untouched` |
| live order subscribes to ConvertKit | 12 | `Email the welcome`, `Add to the ConvertKit form` | `Remember welcomed orders` |
