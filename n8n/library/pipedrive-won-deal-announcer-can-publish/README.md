# Announce won Pipedrive deals in Slack with cycle time and source

Polls Pipedrive every 10 minutes for newly won deals and posts one Slack message per win with the value band, days from creation to close, lead source and the team's running total for the month, never announcing the same deal twice.

Import `pipedrive-won-deal-announcer-publish.json` into n8n. It runs on import with no credentials: the shipped `config` takes the built-in sample path and stops on a named `STOP:` node before anything is sent or written.

## Who it's for

Sales teams on Pipedrive that celebrate wins in a Slack channel and want the post to say more than "deal won". Each message shows how long the deal took and where it came from, so patterns show up over a month.

## How it works

1. Every 10 minutes it reads the 100 most recently won deals from Pipedrive, or sample deals until Pipedrive is connected.
2. Only deals won in the last 48 hours that have not been announced are kept, so connecting an old account does not flood the channel.
3. Each win gets a band from `VALUE_BANDS` (Big win from 50,000), its days to close compared with the month's median, and its source from the deal origin or a custom field.
4. The month's running total is summed per currency from all wins this calendar month. One Slack message goes out per deal, oldest first.

## Sections on the canvas

1. **Start and settings.** Polls every 10 minutes, close enough to feel live without a Pipedrive webhook to maintain. Bands, the announce window and the source field live in `config`.
2. **Read won deals.** The 100 latest wins are read every time because the monthly total and median need the whole month, not only new deals. `Load sample deals` stands in until `USE_PIPEDRIVE` is true.
3. **Pick and write.** `Pick wins to announce` drops anything announced before or older than `ANNOUNCE_WITHIN_HOURS`, which is what keeps a first run from posting last year's wins.
4. **Post and remember.** One message per win, oldest first, so the channel reads in order. A test post goes only to `TEST_SLACK_CHANNEL`, and stops at a STOP if that is blank. Only a live run stores the deal ids, so a test post never hides the real one.

## Setup

1. Run it once as imported. It formats sample wins and stops at `STOP: preview - nothing posted`.
2. Add a Pipedrive credential to `Fetch recently won deals` and set `USE_PIPEDRIVE = true`.
3. Connect Slack and set `SLACK_CHANNEL_ID`. If you track source in a custom field, put its key in `SOURCE_FIELD_KEY`.
4. For a test, set `TEST_EMAIL` to any address and `TEST_SLACK_CHANNEL` to a private channel, where test messages land. Set `TEST_RUN = false` to post to `SLACK_CHANNEL_ID` and remember announced deals.

## Settings in `config`

| Setting | Ships as | What it does |
|---|---|---|
| `USE_PIPEDRIVE` | `false` | set true after adding the Pipedrive credential |
| `VALUE_BANDS` | `[{"min":50000,"label":"Big win","emoji":` | checked top to bottom; first band whose min the value reaches |
| `ANNOUNCE_WITHIN_HOURS` | `48` | wins older than this are never posted |
| `SOURCE_FIELD_KEY` | `''` | Pipedrive custom field key holding lead source; blank uses the deal origin |
| `MAIN_CURRENCY` | `'USD'` | listed first in the monthly running total |
| `SLACK_CHANNEL_ID` | `''` | channel for win posts; blank posts nothing |
| `TEST_SLACK_CHANNEL` | `''` | test mode posts here instead of the real channel; blank means test mode posts nothing |
| `TEST_RUN` | `true` | ships true. Nothing reaches a real recipient or system. |
| `TEST_EMAIL` | `''` | blank means preview only; set it and sends are redirected there |

## Nodes that need a credential

- `Fetch recently won deals`
- `Post the win to Slack`

## Requirements

- A Pipedrive account with an API token
- A Slack workspace

## Customising

- `VALUE_BANDS` sets the thresholds, labels and emoji for each band.
- `ANNOUNCE_WITHIN_HOURS` decides how old a win can be and still be posted.
- `MAIN_CURRENCY` is listed first in the running total.

## Verified

Every scenario below was run by `_kit/simulate.ts`: the real Code-node JavaScript and IF/Switch logic, with service calls replaced by canned responses.

| Scenario | Nodes run | Sends or writes | Ends at |
|---|---|---|---|
| shipped config (preview) | 9 | none | `STOP: preview - nothing posted` |
| test mode with no test channel | 10 | none | `STOP: test - TEST_SLACK_CHANNEL blank` |
| test mode into the test channel | 12 | `Post the win to Slack` | `STOP: test post - deals not remembered` |
| live with Pipedrive and Slack | 13 | `Post the win to Slack` | `Remember announced deals` |
