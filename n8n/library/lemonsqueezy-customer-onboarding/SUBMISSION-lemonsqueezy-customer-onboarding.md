# Welcome new Lemon Squeezy customers and tag them in ConvertKit

**Who's it for**
Creators selling templates, courses or software on Lemon Squeezy who want each buyer to get a product-specific welcome and land in the right ConvertKit segment, instead of one generic receipt.

**How it works**
1. Lemon Squeezy calls the webhook on every new order. A manual run uses 5 sample payloads instead.
2. Only `order_created` events for your store with status paid go on. Lemon Squeezy retries are dropped by order id.
3. Orders placed in Lemon Squeezy test mode are never treated as real: the welcome goes to `TEST_EMAIL` and ConvertKit is skipped.
4. The first item's product id picks the welcome subject and text, the ConvertKit form and the tag from `PRODUCTS`, with a default for unlisted products.
5. Each buyer's orders are remembered by email. A second purchase opens with "welcome back" and the order count instead of the first-time intro, adds `REPEAT_TAG_ID`, and lifetime spend at or above `VIP_SPEND` adds `VIP_TAG_ID`.
6. The welcome is sent from Gmail, then the buyer is added to the form with the product tag plus any repeat or VIP tag.
7. An `order_refunded` event sends no email: the product tag is removed in ConvertKit so the buyer drops out of that product's sequence, and the order no longer counts toward spend.

**How to set up**
1. Run it once as imported. It processes the sample payloads and stops at `STOP: preview - nothing sent`.
2. Activate the workflow and add the production URL of `Lemon Squeezy order webhook` in Lemon Squeezy under Settings, Webhooks, with the order_created and order_refunded events. Set `STORE_ID`.
3. Connect Gmail, add a ConvertKit credential to `Add to the ConvertKit form`, and fill `PRODUCTS` with your product ids, form ids, tag ids and welcome copy.
4. Put your address in `TEST_EMAIL`, place a test-mode order in Lemon Squeezy, then set `TEST_RUN = false`.

**Requirements**
- A Lemon Squeezy store
- A Gmail account
- A ConvertKit account with a form and tags

**How to customize**
- `PRODUCTS` holds the subject, welcome lines, form id and tag id per product.
- `DEFAULT_PRODUCT` covers anything not listed.
- `REPEAT_TAG_ID`, `VIP_TAG_ID` and `VIP_SPEND` control the returning-customer segments; leave a tag id blank to skip it.
- `SENDER_NAME` signs every email.
