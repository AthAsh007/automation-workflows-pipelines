# Send overdue invoice reminders from Stripe with Gmail and a Slack summary

**Who's it for**
Small finance teams and agencies who bill through Stripe and chase late invoices by hand. It replaces the weekly "who owes us" spreadsheet with a ladder that runs every weekday morning.

**How it works**
1. Every weekday at 09:00 it reads open invoices from Stripe, or a built-in sample set until Stripe is connected.
2. Each invoice gets the next step on the reminder ladder (3, 10 and 21 days overdue by default). The step already sent is read from the invoice metadata, so nobody gets the same email twice.
3. Disputed invoices, invoices under the minimum amount and customers on the skip list are held back with a reason.
4. Reminders go out through Gmail, the step is written back to the Stripe invoice, and one summary lands in Slack.

**How to set up**
1. Run it once as imported. It previews against sample invoices and stops at `STOP: preview - nothing sent`.
2. Add a Stripe credential to `Fetch open invoices from Stripe` and `Record reminder step on Stripe`, then set `USE_STRIPE = true` in `config`.
3. Connect Gmail and, optionally, Slack, and fill in `SLACK_CHANNEL_ID`.
4. Put your own address in `TEST_EMAIL` to receive every reminder yourself. Set `TEST_RUN = false` when the wording is right.

**Requirements**
- A Stripe account with invoices
- A Gmail account
- Optional: a Slack workspace

**How to customize**
- Change the ladder in `LADDER`: days overdue, subject and tone for each step.
- Raise `MIN_AMOUNT` to stop chasing small balances, or add customer ids to `SKIP_CUSTOMERS`.
- `DAILY_CAP` limits how many reminders one run can send.
