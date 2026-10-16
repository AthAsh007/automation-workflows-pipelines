# Request reviews by Gmail for delivered Shopify orders

**Who's it for**
Shopify stores that want more product reviews but do not want to email the same customer every week or ask someone whose order went wrong.

**How it works**
1. Every day at 11:00 it reads Shopify orders fulfilled in the last 60 days, or 9 sample orders until Shopify is connected.
2. Delivery date comes from carrier tracking; without tracking it assumes delivery 5 days after fulfilment.
3. An order is asked about 7 to 21 days after delivery. Refunded, cancelled and `no-review` orders are skipped, and so is any customer tagged as asked in the last 90 days.
4. The email names the most expensive item in the order and links to its review page from `REVIEW_LINKS`, or to a page built from `DEFAULT_REVIEW_URL`.
5. After a live send the customer gets a dated `review-requested-YYYY-MM-DD` tag, which is how the 90 days are counted.

**How to set up**
1. Run it once as imported. It previews against sample orders and stops at `STOP: preview - nothing sent`.
2. Add a Shopify access token credential to `Fetch fulfilled orders` and `Tag the customer in Shopify`, set `SHOP_DOMAIN` and `USE_SHOPIFY = true`.
3. Connect Gmail, fill `REVIEW_LINKS` for your main products and check `STORE_NAME`.
4. Put your address in `TEST_EMAIL` to receive every request yourself, then set `TEST_RUN = false`.

**Requirements**
- A Shopify store
- A custom app token with read_orders and write_customers
- A Gmail account

**How to customize**
- `REQUEST_AFTER_DAYS` and `MAX_DAYS_AFTER_DELIVERY` set the window.
- `COOLDOWN_DAYS` sets how long a customer rests between requests.
- `DAILY_CAP` limits sends per run.
