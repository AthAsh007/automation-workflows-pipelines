# Detect likely duplicate bills in Xero and post a review list to Slack

Scores every pair of draft and awaiting-payment Xero bills from the last 90 days on supplier, amount, date and reference, and posts the pairs above a threshold to Slack with links to both bills. It only reads from Xero; nothing is voided or edited.

Import `xero-duplicate-bill-check-publish.json` into n8n. It runs on import with no credentials: the shipped `config` takes the built-in sample path and stops on a named `STOP:` node before anything is sent or written.

## Who it's for

Accounts payable staff and bookkeepers on Xero who enter bills from email, scans and supplier portals, where the same invoice often gets keyed twice. The check runs before each payment run so a duplicate is caught before it is paid.

## How it works

1. Every Tuesday and Thursday at 08:00 it reads bills with status Draft or Awaiting Payment from the last 90 days, or a sample set until Xero is connected.
2. Each pair of bills from the same supplier, or from two suppliers whose names differ by a typo, is scored: 30 for the supplier, 30 for the same amount, 25 for the same date and 40 for the same supplier reference.
3. Two different references take 30 points off, so weekly bills of the same amount are not flagged. Pairs scoring 70 or more go on the list.
4. Slack gets each pair with the reasons and a link to both bills. Pairs already posted are not posted again.

## Sections on the canvas

1. **Start and settings.** Runs Tuesday and Thursday mornings, ahead of a typical payment run. Every score weight and window is a constant in `config`.
2. **Read open bills.** Only Draft and Awaiting Payment bills are fetched, because a paid duplicate is a refund problem, not a review. `Load sample bills` feeds the same shape until `USE_XERO` is true.
3. **Score every pair.** `Score duplicate pairs` compares only bills whose suppliers match, which keeps the pair count small. Different references subtract points, so a weekly courier bill for the same amount stays off the list.
4. **Post and remember.** There is no write to Xero anywhere in this workflow. Only a live post records the pair keys, so the same pair is not posted twice and a test post hides nothing. A test post goes only to `TEST_SLACK_CHANNEL`, and stops at a STOP if that is blank.

## Setup

1. Run it once as imported. It scores sample bills and stops at `STOP: preview - nothing posted`.
2. Add a Xero OAuth2 credential to `Fetch bills from Xero`, put your organisation id in `XERO_TENANT_ID`, then set `USE_XERO = true`.
3. Connect Slack and set `SLACK_CHANNEL_ID`.
4. For a test, set `TEST_EMAIL` to any address and `TEST_SLACK_CHANNEL` to a private channel, where the test list lands. Set `TEST_RUN = false` to post to `SLACK_CHANNEL_ID` and remember posted pairs.

## Settings in `config`

| Setting | Ships as | What it does |
|---|---|---|
| `USE_XERO` | `false` | set true after adding the Xero credential and XERO_TENANT_ID |
| `XERO_TENANT_ID` | `''` | Xero organisation (tenant) id, sent as the xero-tenant-id header |
| `LOOKBACK_DAYS` | `90` | bills dated within this many days are compared |
| `AMOUNT_TOLERANCE` | `0.5` | totals this close count as the same amount |
| `AMOUNT_NEAR_PCT` | `2` | totals within this percent score half the amount points |
| `DATE_WINDOW_DAYS` | `14` | bill dates this close score the date points |
| `REVIEW_SCORE` | `70` | pairs at or above this score are posted |
| `SLACK_CHANNEL_ID` | `''` | channel for the review list; blank means nothing is posted |
| `TEST_SLACK_CHANNEL` | `''` | test mode posts here instead of the real channel; blank means test mode posts nothing |
| `TEST_RUN` | `true` | ships true. Nothing reaches a real recipient or system. |
| `TEST_EMAIL` | `''` | blank means preview only; set it and sends are redirected there |

## Nodes that need a credential

- `Fetch bills from Xero`
- `Post the review list to Slack`

## Requirements

- A Xero organisation with bills
- A Slack workspace

## Customising

- `REVIEW_SCORE` raises or lowers how sure a pair must be before it is posted.
- `AMOUNT_TOLERANCE`, `AMOUNT_NEAR_PCT` and `DATE_WINDOW_DAYS` set what counts as the same amount and date.
- `LOOKBACK_DAYS` limits how far back bills are compared.

## Verified

Every scenario below was run by `_kit/simulate.ts`: the real Code-node JavaScript and IF/Switch logic, with service calls replaced by canned responses.

| Scenario | Nodes run | Sends or writes | Ends at |
|---|---|---|---|
| shipped config (preview) | 10 | none | `STOP: preview - nothing posted` |
| test mode with no test channel | 11 | none | `STOP: test - TEST_SLACK_CHANNEL blank` |
| test mode into the test channel | 13 | `Post the review list to Slack` | `STOP: test post - pairs not remembered` |
| live with Xero and Slack | 14 | `Post the review list to Slack` | `Remember posted pairs` |
