# Welcome new Lemon Squeezy customers and tag them in ConvertKit

**Who's it for**
Creators selling templates, courses or software on Lemon Squeezy who want each buyer to get a product-specific welcome and land in the right ConvertKit segment, instead of one generic receipt.

**How it works**
1. Lemon Squeezy calls the webhook on every new order. A manual run uses 5 sample payloads instead.
2. Only `order_created` events for your store with status paid go on. Lemon Squeezy retries are dropped by order id.
3. Orders placed in Lemon Squeezy test mode are never treated as real: the welcome goes to `TEST_EMAIL` and ConvertKit is skipped.
4. The first item's product id picks the welcome subject and text, the ConvertKit form and the tag from `PRODUCTS`, with a default for unlisted products.
5. The welcome is sent from Gmail, then the buyer is added to the form with the tag and their first name.

**How to set up**
1. Run it once as imported. It processes the sample payloads and stops at `STOP: preview - nothing sent`.
2. Activate the workflow and add the production URL of `Lemon Squeezy order webhook` in Lemon Squeezy under Settings, Webhooks, with the order_created event. Set `STORE_ID`.
3. Connect Gmail, add a ConvertKit credential to `Add to the ConvertKit form`, and fill `PRODUCTS` with your product ids, form ids, tag ids and welcome copy.
4. Put your address in `TEST_EMAIL`, place a test-mode order in Lemon Squeezy, then set `TEST_RUN = false`.

**Requirements**
- A Lemon Squeezy store
- A Gmail account
- A ConvertKit account with a form and tags

**How to customize**
- `PRODUCTS` holds the subject, welcome lines, form id and tag id per product.
- `DEFAULT_PRODUCT` covers anything not listed.
- `SENDER_NAME` signs every email.
