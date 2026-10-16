# Chase missing Clockify hours in Slack every Friday

Compares each person's logged Clockify hours this week with their contracted hours (part-time days and public holidays included), and sends every manager one Slack message listing only their people who are short.

Import `clockify-missing-timesheet-chaser-publish.json` into n8n. It runs on import with no credentials: the shipped `config` takes the built-in sample path and stops on a named `STOP:` node before anything is sent or written.

## Who it's for

Agencies and consultancies of 5 to 80 people who bill from Clockify and lose hours every week to timesheets nobody filled in. Managers get a short list on Friday afternoon while the week is still fresh.

## How it works

1. Every Friday at 14:00 it pulls this week's Clockify summary report grouped by user, plus the workspace users, or sample data until Clockify is connected.
2. Expected hours come from `TEAM`: weekly hours spread over each person's working days, minus any `PUBLIC_HOLIDAYS` that fall on one of those days.
3. Anyone short by more than `SHORTFALL_HOURS` and `SHORTFALL_PCT` is listed. People missing from Clockify count as zero hours; Clockify users not in `TEAM` are ignored and reported.
4. Each manager gets one Slack DM listing their people with logged, expected and missing hours, or the lists go to one channel.

## Sections on the canvas

1. **Start and settings.** Runs every Friday at 14:00, early enough for people to fix the week. `TEAM` holds contracted hours and working days per person, which is what makes part-time staff come out right.
2. **Read logged hours.** The summary report gives seconds per user id in one call; `Fetch workspace users` turns ids into emails so they match `TEAM`. `Load sample hours` returns the same hours-by-email item when Clockify is off.
3. **Find who is short.** Both thresholds must be exceeded, so 15 minutes short on a 40-hour week is ignored. Someone missing from Clockify counts as zero rather than disappearing, and an all-clear week ends at its own STOP.
4. **Tell each manager.** Managers only see their own people, sorted by the biggest gap. `Post to Slack?` opens only on a live run; the DM goes to the manager's Slack id, or to `CHANNEL_ID` with the manager tagged.

## Setup

1. Run it once as imported. It checks sample hours and stops at `STOP: dry run - nothing posted`.
2. Add a Clockify credential to `Fetch summary report` and `Fetch workspace users`, set `CLOCKIFY_WORKSPACE_ID` and `USE_CLOCKIFY = true`.
3. Fill `TEAM` with each person's email, weekly hours, working days, Slack id and manager's Slack id. Connect Slack.
4. Check the lists in `Group by manager`, then set `DRY_RUN = false`.

## Settings in `config`

| Setting | Ships as | What it does |
|---|---|---|
| `USE_CLOCKIFY` | `false` | set true after adding the Clockify credential to both Clockify nodes |
| `CLOCKIFY_WORKSPACE_ID` | `''` | workspace id from Clockify settings |
| `TEAM` | `[{"email":"ana@studio.example","slack_id` | who should log what: weekly hours over working days (1 = Monday ... 5 = Friday) |
| `SHORTFALL_HOURS` | `2` | missing hours must be above this... |
| `SHORTFALL_PCT` | `5` | ...and above this percent of expected hours |
| `PUBLIC_HOLIDAYS` | `["2026-12-25","2026-12-28","2027-01-01"]` | dates nobody is expected to log |
| `CHANNEL_ID` | `''` | blank: DM each manager. Set: post every list in this channel |
| `DRY_RUN` | `true` | ships true. The run computes and reports, and writes nothing. |

## Nodes that need a credential

- `Fetch summary report`
- `Fetch workspace users`
- `Send the list to the manager`

## Requirements

- A Clockify workspace (any plan with the reports API)
- A Slack workspace with a bot that can DM

## Customising

- `SHORTFALL_HOURS` and `SHORTFALL_PCT` decide how short counts as missing; both must be exceeded.
- Set `CHANNEL_ID` to post every manager's list in one channel instead of DMs.
- `PUBLIC_HOLIDAYS` lowers expected hours for anyone who works that day.

## Verified

Every scenario below was run by `_kit/simulate.ts`: the real Code-node JavaScript and IF/Switch logic, with service calls replaced by canned responses.

| Scenario | Nodes run | Sends or writes | Ends at |
|---|---|---|---|
| shipped config (sample hours, dry run) | 10 | none | `STOP: dry run - nothing posted` |
| live, holiday on Tuesday, channel mode | 12 | `Send the list to the manager` | `Send the list to the manager` |
