# Rotate the on-call schedule in Google Sheets and announce it in Slack

**Who's it for**
Small engineering teams of 3 to 15 who run on-call from a spreadsheet and forget to hand over, or hand over to someone who is on holiday. The sheet stays the source of truth and the handover happens on time.

**How it works**
1. Every Monday at 09:00 it reads the Rotation tab (order, name, Slack id, active, away dates) and the Schedule tab, or sample data until a sheet id is set.
2. The next primary is the next person in rotation order after last week's primary who is active and has no away dates in the week. The secondary is the next eligible person after them. Everyone skipped is listed with the reason.
3. If the Schedule tab already has a row for the week, the run stops, so a manual re-run never rotates twice.
4. The count of unacknowledged incidents comes from PagerDuty (or a sample), the new row is appended and the handover is posted to Slack.

**How to set up**
1. Run it once as imported. It picks the next on-call from sample data and stops at `STOP: dry run - sheet and Slack untouched`.
2. Create Rotation and Schedule tabs with the columns shown in `Load sample rotation`, connect Google Sheets and set `ROTA_SHEET_ID`.
3. Optional: add a PagerDuty credential to `Count open incidents` and set `USE_PAGERDUTY = true`. Set `SLACK_CHANNEL_ID`.
4. Check the pick on `Pick next on-call`, then set `DRY_RUN = false`.

**Requirements**
- A Google Sheet holding the rotation
- A Slack workspace
- Optional: PagerDuty

**How to customize**
- `HANDOVER_DAY` sets which weekday a rotation week starts on.
- `AWAY_GRACE_DAYS` lets someone take the week if they are away for only that many days of it.
- `HANDOVER_NOTE` is appended to every handover message.
