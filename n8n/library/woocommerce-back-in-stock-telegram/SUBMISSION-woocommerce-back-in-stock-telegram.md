# Notify Telegram subscribers when WooCommerce products are back in stock

**Who's it for**
WooCommerce shops that sell limited runs and collect "tell me when it's back" requests through a Telegram bot. It turns that list into messages the moment stock returns, without a waitlist plugin.

**How it works**
1. Every 30 minutes it reads the Waitlist tab (chat id, product id, joined date, status), or 10 sample rows until the sheet is set.
2. It fetches only the waitlisted products from WooCommerce, or sample stock until WooCommerce is connected.
3. For a product back in stock it notifies waiting subscribers in the order they joined, up to 2 people per unit in stock, so 3 units do not wake up 40 people. Products without stock tracking notify everyone.
4. Each subscriber gets one message listing every product they waited for that is now available, with a link.
5. After a live send each row is marked notified; the rest keep waiting for the next restock.

**How to set up**
1. Run it once as imported. It plans the messages and stops at `STOP: preview - nothing sent`.
2. Create a sheet with a Waitlist tab (key, chat_id, product_id, joined_at, status, notified_at) and put its id in `WAITLIST_SHEET_ID`. key is chat_id:product_id.
3. Add a WooCommerce credential to `Fetch waitlisted products`, set `STORE_URL` and `USE_WOOCOMMERCE = true`, and add your bot token to `Send the Telegram message`.
4. Put your own chat id in `TEST_CHAT_ID` to receive every message yourself first, then set `DRY_RUN = false` to message subscribers.

**Requirements**
- A WooCommerce store with REST API keys
- A Telegram bot that collects chat ids
- A Google Sheet

**How to customize**
- `NOTIFY_PER_UNIT` sets how many subscribers are told per unit in stock.
- `MIN_STOCK` holds notifications until at least that many units are in.
- `MESSAGE_INTRO` changes the first line of the message.
