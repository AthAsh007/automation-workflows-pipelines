# Remind owners in Slack before SaaS renewals in a Google Sheets register

Reads a Google Sheets register of software subscriptions, works out each cancel-by date from the renewal date and notice period, and posts a Slack digest that tags owners 30, 14 and 3 days before it, with unowned tools and missed notice windows called out.

Import `saas-renewal-reminders-publish.json` into n8n. It runs on import with no credentials: the shipped `config` takes the built-in sample path and stops on a named `STOP:` node before anything is sent or written.

## Who it's for

Operations and finance leads who keep a sheet of software subscriptions and still get caught by annual auto-renewals. The reminder is keyed to the last day you can cancel, not the renewal date, because that is the date that matters.

## How it works

1. Every weekday at 09:00 it reads the Register tab, or sample tools until a sheet is connected.
2. Past renewal dates roll forward by the billing cycle, then the cancel-by date is the renewal date minus the notice days.
3. A tool enters the digest when its cancel-by date is 30, 14 or 3 days away. Each stage is posted once per renewal, even if a run is missed.
4. Tools with no owner, and tools whose notice window has already closed, get their own sections. One Slack message tags each owner.

## Sections on the canvas

1. **Start and settings.** Weekday mornings, so a 3-day warning never lands on a Saturday. Column names and reminder stages live in `config`.
2. **Read the register.** `Read register rows` maps your headers through `COLUMNS`, so the sheet layout is yours. `Load sample tools` covers every case until `REGISTER_SHEET_ID` is set.
3. **Find what needs a decision.** Stages are crossed, not matched exactly, so a skipped weekend still triggers the 3-day reminder. Unowned tools are listed every run until someone claims them.
4. **Post and remember.** A live post needs `SLACK_CHANNEL_ID`. A test post goes only to `TEST_SLACK_CHANNEL`, and stops at a STOP if that is blank. Only a live post records the stage in static data, so a test post never hides a real reminder.

## Setup

1. Run it once as imported. It builds a digest from sample tools and stops at `STOP: preview - nothing posted`.
2. Connect Google Sheets, put the spreadsheet id in `REGISTER_SHEET_ID`, and match the column names in `COLUMNS`.
3. Connect Slack and set `SLACK_CHANNEL_ID`. Owners are tagged by the Slack member id in the owner id column.
4. For a test, set `TEST_EMAIL` to any address and `TEST_SLACK_CHANNEL` to a private channel. The test digest lands there with no @mentions. Set `TEST_RUN = false` to post to `SLACK_CHANNEL_ID` and tag owners.

## Settings in `config`

| Setting | Ships as | What it does |
|---|---|---|
| `REGISTER_SHEET_ID` | `''` | Google Sheets id with a Register tab; blank uses sample tools |
| `COLUMNS` | `{"tool":"Tool","owner":"Owner","owner_sl` | column headers on the Register tab |
| `STAGES` | `[30,14,3]` | days before the cancel-by date that trigger a reminder |
| `DEFAULT_NOTICE_DAYS` | `0` | notice period when the column is empty |
| `MIN_ANNUAL_COST` | `0` | tools cheaper than this per year are left out |
| `SLACK_CHANNEL_ID` | `''` | channel for the digest; blank means nothing is posted |
| `TEST_SLACK_CHANNEL` | `''` | test mode posts here instead of the real channel; blank means test mode posts nothing |
| `TEST_RUN` | `true` | ships true. Nothing reaches a real recipient or system. |
| `TEST_EMAIL` | `''` | blank means preview only; set it and sends are redirected there |

## Nodes that need a credential

- `Read the Register tab`
- `Post the renewal digest`

## Requirements

- A Google Sheet listing your subscriptions
- A Slack workspace

## Customising

- `STAGES` sets the reminder days before cancel-by (30, 14 and 3 by default).
- `DEFAULT_NOTICE_DAYS` covers rows with an empty notice column.
- `MIN_ANNUAL_COST` keeps cheap tools out of the digest.

## Verified

Every scenario below was run by `_kit/simulate.ts`: the real Code-node JavaScript and IF/Switch logic, with service calls replaced by canned responses.

| Scenario | Nodes run | Sends or writes | Ends at |
|---|---|---|---|
| shipped config (preview) | 10 | none | `STOP: preview - nothing posted` |
| test mode with no test channel | 11 | none | `STOP: test - TEST_SLACK_CHANNEL blank` |
| test mode into the test channel | 13 | `Post the renewal digest` | `STOP: test post - stages not remembered` |
| live post from the register | 14 | `Post the renewal digest` | `Remember posted stages` |
