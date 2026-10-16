# Alert Telegram when PayPal disputes open, with the response deadline

**Who's it for**
Online sellers and small ecommerce teams who take payments through PayPal and have lost a dispute by missing the response window. The alert arrives on your phone with the deadline in the first line.

**How it works**
1. Every 30 minutes it lists open PayPal disputes, or a sample set until PayPal is connected.
2. Disputes waiting on the buyer, and resolved ones, are skipped. The rest get a label from the seller response deadline: OVERDUE, DUE TODAY (under 24 hours), URGENT (under 72 hours), this week, or later.
3. A dispute is alerted once when first seen, and once more when it enters its last 24 hours. Ids are kept in workflow static data.
4. One Telegram message lists them in deadline order with amount, reason and stage, plus the total amount in dispute.

**How to set up**
1. Run it once as imported. It labels sample disputes and stops at `STOP: preview - nothing sent`.
2. Add a PayPal credential to `List open PayPal disputes`, set `PAYPAL_ENV`, then set `USE_PAYPAL = true`.
3. Connect Telegram and put your chat id in `TELEGRAM_CHAT_ID`.
4. For a test, set `TEST_EMAIL` to any address and `TEST_TELEGRAM_CHAT_ID` to a private chat, where the test message lands. Set `TEST_RUN = false` to send to `TELEGRAM_CHAT_ID` and remember alerted disputes.

**Requirements**
- A PayPal business account with REST API credentials
- A Telegram bot and a chat id

**How to customize**
- `URGENT_HOURS` and `TODAY_HOURS` move the label boundaries.
- `MIN_AMOUNT` keeps small disputes out of the alert.
- `PAYPAL_ENV` switches between sandbox and live API hosts.
