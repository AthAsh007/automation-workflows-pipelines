# Check in event attendees by webhook and post live counts to Slack

Takes ticket scans from any QR scanner app by webhook, matches the code against an attendee list in Google Sheets, answers the scanner with checked in, already checked in or not found, stamps the sheet and posts the running count to Slack every 25 check-ins.

Import `event-checkin-live-count-publish.json` into n8n. It runs on import with no credentials: the shipped `config` takes the built-in sample path and stops on a named `STOP:` node before anything is sent or written.

## Who it's for

Organisers of meetups, workshops and small conferences who sell tickets anywhere and check people in with a phone. The door team gets an instant answer and the rest of the team sees the room fill up in Slack.

## How it works

1. Your scanner app posts each scanned code to a webhook. Codes are compared without case, spaces or dashes, so "tix-0007" matches "TIX 0007".
2. The code is looked up in the Attendees tab. Unknown codes get a 404, codes already used get a 409 with the time of the first scan, and valid ones a 200 with the name and ticket type.
3. A valid check-in is stamped in the checked_in_at column.
4. Every 25th check-in, and the moment everyone has arrived, Slack gets the count, the share of the list and the count per ticket type.

## Sections on the canvas

1. **Receive the scan.** The scanner posts to `Ticket scan webhook`, which waits for a respond node so the door gets its answer in the same request. A manual run feeds `Load sample scan` through the same path.
2. **Read the attendee list.** The list is read on every scan so late registrations and manual fixes in the sheet count straight away. `Load sample attendee list` has 24 people already in, so the sample scan lands on a milestone.
3. **Validate and answer the door.** A ticket is used if the sheet says so or static data saw it, which catches two scans a second apart. Each outcome gets its own HTTP status so the scanner app can show red or green.
4. **Stamp the sheet and post milestones.** Only a live first entry writes checked_in_at. `Write the milestone post` branches off the answer, so a slow Slack call never holds up the queue at the door.

## Setup

1. Run it once as imported from `Run manually`. A sample scan becomes check-in 25 and the run stops at `STOP: preview - nothing posted` and `STOP: not live - sheet untouched`.
2. Connect Google Sheets and set `ATTENDEES_SHEET_ID`. The tab needs ticket_code, name, ticket_type and checked_in_at columns.
3. Point your scanner app at the production webhook URL with a JSON body like {"code": "TIX-0007", "gate": "Main"}. Connect Slack and set `SLACK_CHANNEL_ID`.
4. Set `TEST_EMAIL` to any address to post milestones with a [TEST] prefix. Set `TEST_RUN = false` on the day so check-ins are written to the sheet.

## Settings in `config`

| Setting | Ships as | What it does |
|---|---|---|
| `ATTENDEES_SHEET_ID` | `''` | Google Sheets id with an Attendees tab; blank uses the sample list |
| `EVENT_NAME` | `'Ops Meetup, November'` | shown in the Slack posts |
| `MILESTONE_EVERY` | `25` | post the count to Slack every this many check-ins |
| `CODE_PREFIX` | `'TIX'` | prefix added to bare numeric codes; blank to turn off |
| `CODE_DIGITS` | `4` | digits after the prefix, for padding bare numbers |
| `ALLOW_REENTRY` | `false` | true -> a second scan of the same ticket is let in with a warning |
| `SLACK_CHANNEL_ID` | `''` | channel for milestone posts; blank skips Slack |
| `TEST_RUN` | `true` | ships true. Nothing reaches a real recipient or system. |
| `TEST_EMAIL` | `''` | blank means preview only; set it and sends are redirected there |

## Nodes that need a credential

- `Read the attendee list`
- `Stamp the check-in on the sheet`
- `Post the count to Slack`

## Requirements

- A Google Sheet with the attendee list
- A scanner app that can POST JSON
- A Slack workspace

## Customising

- `MILESTONE_EVERY` sets how often Slack hears about the count.
- `CODE_PREFIX` is added to bare numbers, so a scan of "7" can match "TIX0007".
- `ALLOW_REENTRY` lets the same ticket in again and answers 200 with a warning.

## Verified

Every scenario below was run by `_kit/simulate.ts`: the real Code-node JavaScript and IF/Switch logic, with service calls replaced by canned responses.

| Scenario | Nodes run | Sends or writes | Ends at |
|---|---|---|---|
| shipped config (manual sample scan) | 18 | none | `STOP: not live - sheet untouched`, `STOP: preview - nothing posted` |
| webhook: ticket already used | 11 | none | `Answer: already checked in` |
| webhook: unknown and bare number | 11 | none | `Answer: ticket not found` |
| live check-in with sheet and Slack | 19 | `Stamp the check-in on the sheet`, `Post the count to Slack` | `Stamp the check-in on the sheet`, `Post the count to Slack` |
