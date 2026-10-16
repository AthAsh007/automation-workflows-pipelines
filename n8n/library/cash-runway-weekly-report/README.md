# Report weekly cash runway from Google Sheets to Slack

Every Monday, adds up account balances from a Google Sheet, averages net burn over the last 13 weeks, works out months of runway against last week, applies red, amber and green thresholds and posts the result to Slack.

Import `cash-runway-weekly-report-publish.json` into n8n. It runs on import with no credentials: the shipped `config` takes the built-in sample path and stops on a named `STOP:` node before anything is sent or written.

## Who it's for

Founders and finance leads at early-stage companies who track bank balances and weekly cash flow in Google Sheets. The Monday post answers one question, how many months of cash are left, and whether that number moved.

## How it works

1. Every Monday at 08:30 it reads the Balances and Cashflow tabs, or sample data until a sheet is connected.
2. Cash is the sum of balances in `BASE_CURRENCY`, with credit cards counted as negative. Accounts in other currencies are listed and left out.
3. Weekly net burn is outflows minus inflows, averaged over the last 13 complete weeks and turned into a monthly figure. Weeks over twice the median burn are named as one-offs.
4. Runway is cash divided by monthly burn, compared with the same figure a week earlier, and rated green from 12 months, amber from 6, red below that. One Slack message carries it all.

## Sections on the canvas

1. **Start and settings.** Runs Monday at 08:30 so the week just closed is complete. Thresholds, the burn window and column names all sit in `config`.
2. **Read balances and cash flow.** The Cashflow tab is read after balances are collected into one item, so each tab is read once. `Load sample figures` provides both tabs until `FINANCE_SHEET_ID` is set.
3. **Compute runway and trend.** The current week is never counted because it is incomplete. Last week's runway is rebuilt from the same rows, so the trend works from the first run with no stored history.
4. **Post to Slack.** A live post needs `SLACK_CHANNEL_ID`. A test post goes only to `TEST_SLACK_CHANNEL`, and stops at a STOP if that is blank. In preview the full message is still on `Write the runway report` for checking.

## Setup

1. Run it once as imported. It reports on sample numbers and stops at `STOP: preview - nothing posted`.
2. Connect Google Sheets and put the spreadsheet id in `FINANCE_SHEET_ID`. Column names are set in `COLUMNS`.
3. Connect Slack and set `SLACK_CHANNEL_ID`.
4. For a test, set `TEST_EMAIL` to any address and `TEST_SLACK_CHANNEL` to a private channel, where the test report lands. Set `TEST_RUN = false` for the weekly post to `SLACK_CHANNEL_ID`.

## Settings in `config`

| Setting | Ships as | What it does |
|---|---|---|
| `FINANCE_SHEET_ID` | `''` | Google Sheets id with Balances and Cashflow tabs; blank uses sample data |
| `COLUMNS` | `{"account":"Account","balance":"Balance"` | column headers on the two tabs |
| `BASE_CURRENCY` | `'USD'` | only balances in this currency count as cash |
| `BURN_WEEKS` | `13` | complete weeks averaged for burn |
| `GREEN_MONTHS` | `12` | runway at or above this is green |
| `AMBER_MONTHS` | `6` | runway at or above this is amber; below is red |
| `EXCLUDE_ONE_OFFS` | `false` | true leaves weeks above 2x the median burn out of the average |
| `SLACK_CHANNEL_ID` | `''` | channel for the report; blank means nothing is posted |
| `TEST_SLACK_CHANNEL` | `''` | test mode posts here instead of the real channel; blank means test mode posts nothing |
| `TEST_RUN` | `true` | ships true. Nothing reaches a real recipient or system. |
| `TEST_EMAIL` | `''` | blank means preview only; set it and sends are redirected there |

## Nodes that need a credential

- `Read the Balances tab`
- `Read the Cashflow tab`
- `Post the report to Slack`

## Requirements

- A Google Sheet with Balances and Cashflow tabs
- A Slack workspace

## Customising

- `GREEN_MONTHS` and `AMBER_MONTHS` set the colour thresholds.
- `BURN_WEEKS` changes the averaging window from 13 weeks.
- Set `EXCLUDE_ONE_OFFS = true` to leave unusual weeks out of the average.

## Verified

Every scenario below was run by `_kit/simulate.ts`: the real Code-node JavaScript and IF/Switch logic, with service calls replaced by canned responses.

| Scenario | Nodes run | Sends or writes | Ends at |
|---|---|---|---|
| shipped config (preview) | 9 | none | `STOP: preview - nothing posted` |
| test mode with no test channel | 10 | none | `STOP: test - TEST_SLACK_CHANNEL blank` |
| test mode into the test channel | 10 | `Post the report to Slack` | `Post the report to Slack` |
| live from the sheet | 13 | `Post the report to Slack` | `Post the report to Slack` |
