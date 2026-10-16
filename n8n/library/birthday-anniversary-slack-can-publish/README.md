# Post birthdays and work anniversaries from Google Sheets to Slack

Reads a staff sheet every weekday, finds today's birthdays and work anniversaries (weekend ones on Friday, 29 February on the 28th), respects opt-outs, calls out milestone years and posts one combined Slack message.

Import `birthday-anniversary-slack-publish.json` into n8n. It runs on import with no credentials: the shipped `config` takes the built-in sample path and stops on a named `STOP:` node before anything is sent or written.

## Who it's for

Office managers and people teams at companies of 15 to 500 who keep a staff list in Google Sheets and keep missing birthdays that fall on a weekend. One message a day, nobody forgotten, nobody posted against their wishes.

## How it works

1. Every weekday at 09:00 it reads the People tab, or sample staff until a sheet id is set.
2. Birthdays and start-date anniversaries matching today are collected. On Friday, Saturday and Sunday dates are included too, and 29 February counts on 28 February in non-leap years.
3. People with `birthday`, `anniversary` or `all` in the opt_out column are left out, as are inactive rows and anniversaries under one year.
4. Anniversaries in `MILESTONE_YEARS` get their own line. Everything goes out as one Slack message, at most once per day.

## Sections on the canvas

1. **Start and settings.** Runs every weekday at 09:00 or by hand. `RUN_DATE` lets you preview any day, which is the quickest way to check the Friday and 29 February rules before going live.
2. **Read the staff list.** `People sheet set?` reads the People tab once `PEOPLE_SHEET_ID` is filled. `Load sample people` builds dates from the run date, so the sample always has a birthday, an opt-out and a 10-year anniversary to show.
3. **Find who to celebrate.** `Find today's celebrations` works out every calendar day the run covers first, then matches birthdays and start dates against it. Opt-outs and inactive rows are recorded as skipped, not silently dropped, and an empty day ends at its own STOP.
4. **Post once.** One message per day. `Post to Slack?` needs a live run, a channel and no post already recorded for the run date, so a manual re-run after the 09:00 post does nothing.

## Setup

1. Run it once as imported. It builds the message for sample staff and stops at `STOP: dry run - nothing posted`.
2. Create a People tab with name, slack_user_id, birthday (MM-DD or YYYY-MM-DD), start_date, opt_out and active columns. Connect Google Sheets and set `PEOPLE_SHEET_ID`.
3. Connect Slack and set `SLACK_CHANNEL_ID`.
4. Check the text in `Write the message`, then set `DRY_RUN = false`.

## Settings in `config`

| Setting | Ships as | What it does |
|---|---|---|
| `PEOPLE_SHEET_ID` | `''` | Google Sheets id with a People tab; blank uses sample staff |
| `SLACK_CHANNEL_ID` | `''` | channel for the daily message; blank skips Slack |
| `MILESTONE_YEARS` | `[1,5,10,15,20,25]` | anniversaries that get their own line |
| `LEAP_DAY_RULE` | `'feb28'` | 29 February in non-leap years: 'feb28' or 'mar1' |
| `WEEKEND_ON_FRIDAY` | `true` | true: Friday also covers Saturday and Sunday. false: Monday covers the weekend just gone |
| `RUN_DATE` | `''` | blank = today. Set 'YYYY-MM-DD' to preview another day |
| `DRY_RUN` | `true` | ships true. The run computes and reports, and writes nothing. |

## Nodes that need a credential

- `Read People tab`
- `Post celebrations to Slack`

## Requirements

- A Google Sheet listing staff
- A Slack workspace

## Customising

- `MILESTONE_YEARS` picks the anniversaries that get a bigger shout-out.
- `LEAP_DAY_RULE` moves 29 February birthdays to `feb28` or `mar1` in non-leap years.
- `WEEKEND_ON_FRIDAY = false` posts weekend dates on Monday instead.

## Verified

Every scenario below was run by `_kit/simulate.ts`: the real Code-node JavaScript and IF/Switch logic, with service calls replaced by canned responses.

| Scenario | Nodes run | Sends or writes | Ends at |
|---|---|---|---|
| shipped config (dry run) | 10 | none | `STOP: dry run - nothing posted` |
| live, Friday before a leap-day weekend | 11 | `Post celebrations to Slack` | `Remember today's post` |
