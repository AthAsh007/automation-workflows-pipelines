# Send overdue invoice reminders from Stripe with Gmail and a Slack summary

Walks every open Stripe invoice down a 3/10/21-day reminder ladder, one step per invoice per run, skipping disputed and already-reminded ones, then posts what went out to Slack.

Import `stripe-overdue-invoice-reminders-publish.json` into n8n. It runs on import with no credentials: the shipped `config` takes the built-in sample path and stops on a named `STOP:` node before anything is sent or written.

## Who it's for

Small finance teams and agencies who bill through Stripe and chase late invoices by hand. It replaces the weekly "who owes us" spreadsheet with a ladder that runs every weekday morning.

## How it works

1. Every weekday at 09:00 it reads open invoices from Stripe, or a built-in sample set until Stripe is connected.
2. Each invoice gets the next step on the reminder ladder (3, 10 and 21 days overdue by default). The step already sent is read from the invoice metadata, so nobody gets the same email twice.
3. Disputed invoices, invoices under the minimum amount and customers on the skip list are held back with a reason.
4. Reminders go out through Gmail, the step is written back to the Stripe invoice, and one summary lands in Slack.

## Sections on the canvas

1. **Start and settings.** Runs every weekday at 09:00 or by hand. Every setting lives in `config`, including the reminder ladder, so nothing else needs editing.
2. **Read open invoices.** `Stripe connected?` reads live invoices once `USE_STRIPE` is true. Until then `Load sample invoices` feeds the same shape, so the whole run can be watched before any credential exists.
3. **Choose who gets which step and report it.** The step already sent is stored on the invoice, so a reminder is never repeated. Disputed, tiny and skipped invoices are held with a reason, `DAILY_CAP` is enforced in code, and one Slack message lists every decision.
4. **Send and record.** Nothing is emailed while `TEST_RUN` is true and `TEST_EMAIL` is blank. A test send goes to you and leaves Stripe alone; only a live run writes the step back to the invoice.

## Setup

1. Run it once as imported. It previews against sample invoices and stops at `STOP: preview - nothing sent`.
2. Add a Stripe credential to `Fetch open invoices from Stripe` and `Record reminder step on Stripe`, then set `USE_STRIPE = true` in `config`.
3. Connect Gmail and, optionally, Slack, and fill in `SLACK_CHANNEL_ID`.
4. Put your own address in `TEST_EMAIL` to receive every reminder yourself. Set `TEST_RUN = false` when the wording is right.

## Settings in `config`

| Setting | Ships as | What it does |
|---|---|---|
| `USE_STRIPE` | `false` | set true after adding the Stripe credential to the two Stripe nodes |
| `LADDER` | `[{"step":1,"days":3,"subject":"A gentle ` | reminder ladder: days overdue that unlocks each step |
| `MIN_AMOUNT` | `50` | invoices with less than this left to pay are not chased (major units) |
| `SKIP_CUSTOMERS` | `[]` | Stripe customer ids that are never chased automatically |
| `DAILY_CAP` | `25` | hard ceiling on reminders per run |
| `SENDER_NAME` | `'Accounts team'` | sign-off on every reminder |
| `SLACK_CHANNEL_ID` | `''` | channel for the run summary; blank skips Slack |
| `TEST_RUN` | `true` | ships true. Nothing reaches a real recipient or system. |
| `TEST_EMAIL` | `''` | blank means preview only; set it and sends are redirected there |

## Nodes that need a credential

- `Fetch open invoices from Stripe`
- `Email the reminder`
- `Record reminder step on Stripe`
- `Post the summary to Slack`

## Requirements

- A Stripe account with invoices
- A Gmail account
- Optional: a Slack workspace

## Customising

- Change the ladder in `LADDER`: days overdue, subject and tone for each step.
- Raise `MIN_AMOUNT` to stop chasing small balances, or add customer ids to `SKIP_CUSTOMERS`.
- `DAILY_CAP` limits how many reminders one run can send.

## Verified

Every scenario below was run by `_kit/simulate.ts`: the real Code-node JavaScript and IF/Switch logic, with service calls replaced by canned responses.

| Scenario | Nodes run | Sends or writes | Ends at |
|---|---|---|---|
| shipped config (preview) | 12 | none | `STOP: preview - nothing sent`, `STOP: no Slack channel` |
| test send to TEST_EMAIL | 14 | `Email the reminder` | `STOP: no Slack channel`, `STOP: test send - Stripe untouched` |
| live with Stripe and Slack | 15 | `Email the reminder`, `Post the summary to Slack`, `Record reminder step on Stripe` | `Post the summary to Slack`, `Record reminder step on Stripe` |
