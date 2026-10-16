# Check in event attendees by webhook and post live counts to Slack

**Who's it for**
Organisers of meetups, workshops and small conferences who sell tickets anywhere and check people in with a phone. The door team gets an instant answer and the rest of the team sees the room fill up in Slack.

**How it works**
1. Your scanner app posts each scanned code to a webhook. Codes are compared without case, spaces or dashes, so "tix-0007" matches "TIX 0007".
2. The code is looked up in the Attendees tab. Unknown codes get a 404, codes already used get a 409 with the time of the first scan, and valid ones a 200 with the name and ticket type.
3. A valid check-in is stamped in the checked_in_at column.
4. Every 25th check-in, and the moment everyone has arrived, Slack gets the count, the share of the list and the count per ticket type.

**How to set up**
1. Run it once as imported from `Run manually`. A sample scan becomes check-in 25 and the run stops at `STOP: preview - nothing posted` and `STOP: not live - sheet untouched`.
2. Connect Google Sheets and set `ATTENDEES_SHEET_ID`. The tab needs ticket_code, name, ticket_type and checked_in_at columns.
3. Point your scanner app at the production webhook URL with a JSON body like {"code": "TIX-0007", "gate": "Main"}. Connect Slack and set `SLACK_CHANNEL_ID`.
4. Set `TEST_EMAIL` to any address to post milestones with a [TEST] prefix. Set `TEST_RUN = false` on the day so check-ins are written to the sheet.

**Requirements**
- A Google Sheet with the attendee list
- A scanner app that can POST JSON
- A Slack workspace

**How to customize**
- `MILESTONE_EVERY` sets how often Slack hears about the count.
- `CODE_PREFIX` is added to bare numbers, so a scan of "7" can match "TIX0007".
- `ALLOW_REENTRY` lets the same ticket in again and answers 200 with a warning.
