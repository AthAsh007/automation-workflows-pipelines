# Recover abandoned WooCommerce carts with a two-step Gmail sequence

**Who's it for**
WooCommerce stores where checkout creates a pending order before payment, and customers drop off at the payment step. It works on those orders, so no cart-tracking plugin is needed.

**How it works**
1. Every hour it reads the last 4 days of WooCommerce orders, or 10 sample orders until WooCommerce is connected.
2. Pending and on-hold orders are carts. An order paid since, or a newer paid order from the same email, ends the sequence.
3. Step 1 goes after 1 hour. Step 2 goes after 24 hours and adds the `COUPON_CODE` when the cart is worth 100 or more. Nothing is sent after 72 hours.
4. On-hold orders paid by bank transfer or cheque are left alone, since they are waiting on the customer's bank, not abandoned.
5. After a live send the step is written to the order as `recovery_step`, so no step is ever sent twice.

**How to set up**
1. Run it once as imported. It previews against sample orders and stops at `STOP: preview - nothing sent`.
2. Add a WooCommerce credential to `Fetch recent orders` and `Record the step on the order`, set `STORE_URL` and `USE_WOOCOMMERCE = true`.
3. Create the coupon named in `COUPON_CODE` in WooCommerce (limit it to one use per customer), and connect Gmail.
4. Put your address in `TEST_EMAIL` to get every message yourself, then set `TEST_RUN = false`.

**Requirements**
- A WooCommerce store with REST API keys
- A Gmail account
- One coupon created in WooCommerce

**How to customize**
- `STEPS` holds the delay and subject of each message.
- `COUPON_MIN_TOTAL` and `COUPON_CODE` control who gets the discount.
- `MIN_CART_TOTAL` and `HOURLY_CAP` keep small carts and big batches out.
