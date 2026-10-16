# Email card update links for failed Stripe subscription payments with Gmail

**Who's it for**
Subscription businesses on Stripe that lose renewals to expired or declined cards. It sends a short, plain email with a link to update the card, three times at most, and stops the moment the invoice is paid.

**How it works**
1. Every day at 10:00 it reads open subscription invoices with at least one failed charge from Stripe, or a sample set until Stripe is connected.
2. Each invoice gets the next step of a day 0, day 3 and day 7 ladder, counted from the first failed charge. The step already sent is stored in the invoice metadata.
3. Paid, canceled and finished invoices are held back with a reason, and `DAILY_CAP` limits sends per run.
4. A fresh billing portal link is created for each customer, the email goes out through Gmail, and the step is written back to Stripe. Slack gets one summary.

**How to set up**
1. Run it once as imported. It previews against sample invoices and stops at `STOP: preview - nothing sent`.
2. Add a Stripe credential to the three Stripe nodes, turn on the customer portal in Stripe Billing settings, then set `USE_STRIPE = true`.
3. Connect Gmail and, optionally, Slack with `SLACK_CHANNEL_ID`.
4. Put your address in `TEST_EMAIL` to receive every email yourself, then set `TEST_RUN = false` to go live.

**Requirements**
- A Stripe account with subscriptions and the customer portal turned on
- A Gmail account
- Optional: a Slack workspace

**How to customize**
- `LADDER` holds the day, subject and opening line of each step.
- `PORTAL_RETURN_URL` is where customers land after updating their card.
- `MIN_AMOUNT` and `DAILY_CAP` keep small balances and big batches out.
