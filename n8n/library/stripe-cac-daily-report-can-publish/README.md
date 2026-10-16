# Combine Stripe revenue and Google Sheets ad spend into a daily CAC report in Slack

Every morning, counts new paying Stripe subscriptions by acquisition channel, joins them to ad spend from a Google Sheet, and posts yesterday's and the 7-day CAC, CAC per channel and payback months to Slack, with channels that spent without converting called out.

Import `stripe-cac-daily-report-publish.json` into n8n. It runs on import with no credentials: the shipped `config` takes the built-in sample path and stops on a named `STOP:` node before anything is sent or written.

## Who it's for

Founders and growth marketers at subscription businesses who log ad spend in a Google Sheet and sell through Stripe. The morning post answers what a new customer cost yesterday and over the last week, per channel.

## How it works

1. Every day at 07:15 it reads Stripe subscriptions created in the last 8 days and the Ad spend tab, or sample data for either until connected.
2. Only subscriptions that are active or past due count as new customers. The channel comes from the customer metadata key in `CHANNEL_METADATA_FIELD`, cleaned up through `CHANNEL_ALIASES`.
3. For yesterday and for the 7 complete days before today it works out blended CAC (spend divided by new customers), CAC per channel, average new MRR, and payback months at your gross margin.
4. Channels that spent money with no new customers, and a 7-day CAC above `TARGET_CAC`, are flagged in the Slack post.

## Sections on the canvas

1. **Start and settings.** Runs at 07:15 so yesterday is a complete UTC day in both Stripe and the sheet. Margin, target CAC and channel aliases live in `config`.
2. **Read new subscriptions.** Subscriptions carry price and interval, so MRR per new customer comes from the same call. `Load sample subscriptions` stands in until `USE_STRIPE` is true.
3. **Read ad spend.** The spend tab is read once, after the subscriptions are collected into one item. `Load sample ad spend` covers it until `SPEND_SHEET_ID` is set.
4. **Compute and post.** Today is excluded and channel names pass through `CHANNEL_ALIASES` before joining, so "facebook" spend and "Meta" signups land in one row. Spend with no conversions is flagged rather than shown as a zero CAC. A test report goes only to `TEST_SLACK_CHANNEL`, and stops at a STOP if that is blank.

## Setup

1. Run it once as imported. It reports on sample data and stops at `STOP: preview - nothing posted`.
2. Add a Stripe credential to `Fetch new subscriptions` and set `USE_STRIPE = true`. Store the acquisition channel on each Stripe customer as metadata.
3. Connect Google Sheets with `SPEND_SHEET_ID` (Ad spend tab: Date, Channel, Spend) and Slack with `SLACK_CHANNEL_ID`.
4. For a test, set `TEST_EMAIL` to any address and `TEST_SLACK_CHANNEL` to a private channel, where the test report lands. Set `TEST_RUN = false` for the daily post to `SLACK_CHANNEL_ID`.

## Settings in `config`

| Setting | Ships as | What it does |
|---|---|---|
| `USE_STRIPE` | `false` | set true after adding the Stripe credential |
| `SPEND_SHEET_ID` | `''` | Google Sheets id with an Ad spend tab; blank uses sample spend |
| `CHANNEL_METADATA_FIELD` | `'channel'` | Stripe customer metadata key holding the acquisition channel |
| `CHANNEL_ALIASES` | `{"google":"Google Ads","adwords":"Google` | lowercase name -> channel used in the report |
| `COUNTED_STATUSES` | `["active","past_due"]` | subscription statuses that count as a new paying customer |
| `WINDOW_DAYS` | `7` | rolling window in complete days |
| `GROSS_MARGIN` | `0.8` | share of MRR kept after cost of service, for payback |
| `TARGET_CAC` | `140` | 7-day blended CAC above this is flagged |
| `CURRENCY` | `'USD'` | currency of spend and prices |
| `SLACK_CHANNEL_ID` | `''` | channel for the report; blank posts nothing |
| `TEST_SLACK_CHANNEL` | `''` | test mode posts here instead of the real channel; blank means test mode posts nothing |
| `TEST_RUN` | `true` | ships true. Nothing reaches a real recipient or system. |
| `TEST_EMAIL` | `''` | blank means preview only; set it and sends are redirected there |

## Nodes that need a credential

- `Fetch new subscriptions`
- `Read the Ad spend tab`
- `Post the CAC report to Slack`

## Requirements

- A Stripe account with subscriptions
- A Google Sheet with daily ad spend
- A Slack workspace

## Customising

- `GROSS_MARGIN` and `TARGET_CAC` drive payback and the warning line.
- `CHANNEL_ALIASES` folds names like adwords and google into one channel.
- `WINDOW_DAYS` changes the rolling window from 7 days.

## Verified

Every scenario below was run by `_kit/simulate.ts`: the real Code-node JavaScript and IF/Switch logic, with service calls replaced by canned responses.

| Scenario | Nodes run | Sends or writes | Ends at |
|---|---|---|---|
| shipped config (preview) | 12 | none | `STOP: preview - nothing posted` |
| test mode with no test channel | 13 | none | `STOP: test - TEST_SLACK_CHANNEL blank` |
| test mode into the test channel | 13 | `Post the CAC report to Slack` | `Post the CAC report to Slack` |
| live with Stripe, Sheets and Slack | 15 | `Post the CAC report to Slack` | `Post the CAC report to Slack` |
