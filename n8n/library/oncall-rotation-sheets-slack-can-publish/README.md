# Rotate the on-call schedule in Google Sheets and announce it in Slack

Every Monday it picks the next primary and secondary from a rotation tab, skipping inactive people and anyone with leave in the week, writes the new row to the schedule tab and posts a handover in Slack with the count of unacknowledged PagerDuty incidents.

Import `oncall-rotation-sheets-slack-publish.json` into n8n. It runs on import with no credentials: the shipped `config` takes the built-in sample path and stops on a named `STOP:` node before anything is sent or written.

## Who it's for

Small engineering teams of 3 to 15 who run on-call from a spreadsheet and forget to hand over, or hand over to someone who is on holiday. The sheet stays the source of truth and the handover happens on time.

## How it works

1. Every Monday at 09:00 it reads the Rotation tab (order, name, Slack id, active, away dates) and the Schedule tab, or sample data until a sheet id is set.
2. The next primary is the next person in rotation order after last week's primary who is active and has no away dates in the week. The secondary is the next eligible person after them. Everyone skipped is listed with the reason.
3. If the Schedule tab already has a row for the week, the run stops, so a manual re-run never rotates twice.
4. The count of unacknowledged incidents comes from PagerDuty (or a sample), the new row is appended and the handover is posted to Slack.

## Sections on the canvas

1. **Start and settings.** Runs every Monday at 09:00, the moment the week changes hands. The handover weekday, leave tolerance and note live in `config`; people and dates live in the sheet.
2. **Read the rotation.** `Collect rotation` folds the Rotation rows into one item so `Read Schedule tab` runs once. A blank `ROTA_SHEET_ID` routes to `Load sample rotation`, which has someone on leave and someone inactive.
3. **Count open incidents.** The handover tells the incoming person what is already burning. PagerDuty is optional: `Load sample incident count` stands in until `USE_PAGERDUTY` is true.
4. **Pick, write and announce.** A Schedule row for the week stops the run first, so re-running never rotates twice. The row is appended before the Slack post, so the sheet is right even if Slack fails.

## Setup

1. Run it once as imported. It picks the next on-call from sample data and stops at `STOP: dry run - sheet and Slack untouched`.
2. Create Rotation and Schedule tabs with the columns shown in `Load sample rotation`, connect Google Sheets and set `ROTA_SHEET_ID`.
3. Optional: add a PagerDuty credential to `Count open incidents` and set `USE_PAGERDUTY = true`. Set `SLACK_CHANNEL_ID`.
4. Check the pick on `Pick next on-call`, then set `DRY_RUN = false`.

## Settings in `config`

| Setting | Ships as | What it does |
|---|---|---|
| `ROTA_SHEET_ID` | `''` | Google Sheets id with Rotation and Schedule tabs; blank uses sample data |
| `HANDOVER_DAY` | `1` | weekday a rotation week starts: 1 = Monday ... 7 = Sunday |
| `AWAY_GRACE_DAYS` | `0` | away days in the week someone can still cover; 0 = any leave skips them |
| `USE_PAGERDUTY` | `false` | true counts open incidents in PagerDuty for the handover |
| `SLACK_CHANNEL_ID` | `''` | channel for the handover; blank skips Slack |
| `HANDOVER_NOTE` | `'Runbooks: wiki/oncall. Escalate to th...'` | added to every handover |
| `DRY_RUN` | `true` | ships true. The run computes and reports, and writes nothing. |

## Nodes that need a credential

- `Read Rotation tab`
- `Read Schedule tab`
- `Count open incidents`
- `Append the schedule row`
- `Post the handover to Slack`

## Requirements

- A Google Sheet holding the rotation
- A Slack workspace
- Optional: PagerDuty

## Customising

- `HANDOVER_DAY` sets which weekday a rotation week starts on.
- `AWAY_GRACE_DAYS` lets someone take the week if they are away for only that many days of it.
- `HANDOVER_NOTE` is appended to every handover message.

## Verified

Every scenario below was run by `_kit/simulate.ts`: the real Code-node JavaScript and IF/Switch logic, with service calls replaced by canned responses.

| Scenario | Nodes run | Sends or writes | Ends at |
|---|---|---|---|
| shipped config (sample rotation, dry run) | 13 | none | `STOP: dry run - sheet and Slack untouched` |
| live with the sheet, PagerDuty and Slack | 20 | `Append the schedule row`, `Post the handover to Slack` | `Post the handover to Slack` |
| already rotated this week | 14 | none | `STOP: already rotated this week` |
