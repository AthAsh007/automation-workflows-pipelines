# Email card update links for failed Stripe subscription payments with Gmail

Finds open subscription invoices whose card charge failed, sends a day 0, 3 and 7 recovery email with a Stripe billing portal link, stops as soon as the invoice is paid, and posts the run to Slack.

Import `stripe-failed-payment-recovery-publish.json` into n8n. It runs on import with no credentials: the shipped `config` takes the built-in sample path and stops on a named `STOP:` node before anything is sent or written.

## Who it's for

Subscription businesses on Stripe that lose renewals to expired or declined cards. It sends a short, plain email with a link to update the card, three times at most, and stops the moment the invoice is paid.

## How it works

1. Every day at 10:00 it reads open subscription invoices with at least one failed charge from Stripe, or a sample set until Stripe is connected.
2. Each invoice gets the next step of a day 0, day 3 and day 7 ladder, counted from the first failed charge. The step already sent is stored in the invoice metadata.
3. Paid, canceled and finished invoices are held back with a reason, and `DAILY_CAP` limits sends per run.
4. A fresh billing portal link is created for each customer, the email goes out through Gmail, and the step is written back to Stripe. Slack gets one summary.

## Sections on the canvas

1. **Start and settings.** Runs daily at 10:00, a few hours after Stripe usually retries cards, or by hand. The ladder wording and every limit live in `config`.
2. **Read failed invoices.** Only open, automatically charged invoices tied to a subscription are read. `Load sample invoices` stands in until `USE_STRIPE` is true, with the same fields `Read failed invoices` produces.
3. **Choose the step and report it.** The sent step lives in invoice metadata, so a rerun never repeats an email. Paid and canceled invoices stop the ladder, `DAILY_CAP` is enforced in code, and Slack gets every held reason.
4. **Link, send and record.** The portal link is created only after `Sending switched on?`, because portal sessions expire. A test send goes to `TEST_EMAIL` and leaves Stripe alone; only `Live run?` writes the step back.

## Setup

1. Run it once as imported. It previews against sample invoices and stops at `STOP: preview - nothing sent`.
2. Add a Stripe credential to the three Stripe nodes, turn on the customer portal in Stripe Billing settings, then set `USE_STRIPE = true`.
3. Connect Gmail and, optionally, Slack with `SLACK_CHANNEL_ID`.
4. Put your address in `TEST_EMAIL` to receive every email yourself, then set `TEST_RUN = false` to go live.

## Settings in `config`

| Setting | Ships as | What it does |
|---|---|---|
| `USE_STRIPE` | `false` | set true after adding the Stripe credential to the Stripe nodes |
| `LADDER` | `[{"step":1,"day":0,"subject":"Your payme` | days after the first failed charge that unlock each step |
| `MIN_AMOUNT` | `5` | balances below this are not chased (major units) |
| `DAILY_CAP` | `40` | hard ceiling on emails per run |
| `PORTAL_RETURN_URL` | `'https://www.yourcompany.example/account'` | where the billing portal sends customers back to |
| `SENDER_NAME` | `'The billing team'` | sign-off on every email |
| `SLACK_CHANNEL_ID` | `''` | channel for the run summary; blank skips Slack |
| `TEST_RUN` | `true` | ships true. Nothing reaches a real recipient or system. |
| `TEST_EMAIL` | `''` | blank means preview only; set it and sends are redirected there |

## Nodes that need a credential

- `Fetch open subscription invoices`
- `Create card update link`
- `Email the card update link`
- `Record recovery step on Stripe`
- `Post the summary to Slack`

## Requirements

- A Stripe account with subscriptions and the customer portal turned on
- A Gmail account
- Optional: a Slack workspace

## Customising

- `LADDER` holds the day, subject and opening line of each step.
- `PORTAL_RETURN_URL` is where customers land after updating their card.
- `MIN_AMOUNT` and `DAILY_CAP` keep small balances and big batches out.

## Verified

Every scenario below was run by `_kit/simulate.ts`: the real Code-node JavaScript and IF/Switch logic, with service calls replaced by canned responses.

| Scenario | Nodes run | Sends or writes | Ends at |
|---|---|---|---|
| shipped config (preview) | 12 | none | `STOP: preview - nothing sent`, `STOP: no Slack channel` |
| test send to TEST_EMAIL | 16 | `Email the card update link` | `STOP: no Slack channel`, `STOP: test send - Stripe untouched` |
| live with Stripe and Slack | 17 | `Post the summary to Slack`, `Email the card update link`, `Record recovery step on Stripe` | `Post the summary to Slack`, `Record recovery step on Stripe` |
