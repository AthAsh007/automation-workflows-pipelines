# Remind writers in Slack about Notion content calendar deadlines

Queries a Notion content calendar every weekday, works out which unpublished pieces are 3 days out, due tomorrow or overdue, sends each reminder step once per due date, and posts one Slack message that mentions each writer.

Import `notion-content-calendar-reminders-publish.json` into n8n. It runs on import with no credentials: the shipped `config` takes the built-in sample path and stops on a named `STOP:` node before anything is sent or written.

## Who it's for

Content leads who run an editorial calendar in Notion and spend Monday mornings chasing writers about drafts. Writers get a nudge before the deadline, and overdue pieces reach the editor.

## How it works

1. Every weekday at 09:00 it queries your Notion database for pieces that are not published and due within 3 days or already overdue, or uses sample pages until Notion is connected.
2. Each piece gets the next reminder step: 3 days out, 1 day out, then overdue at 1, 3 and 7 days late. A step missed over a weekend is caught up on Monday.
3. A step is sent once per due date. Moving the due date in Notion starts the ladder again.
4. One Slack message groups the reminders by writer and mentions them. Pieces with no writer, or a writer with no Slack id, are listed for the editor.

## Sections on the canvas

1. **Start and settings.** Runs every weekday at 09:00 or by hand. Property names, the ladder and the writer to Slack mapping all live in `config`.
2. **Read the calendar.** The Notion query is a POST that only reads, filtered server side to pieces due within the longest reminder window. `Load sample calendar` covers every ladder step and both kinds of missing writer.
3. **Work out the reminder step.** Steps are chosen by range rather than exact day, so a weekend never swallows a reminder. The sent key includes the due date, which lets a rescheduled piece get its reminders again.
4. **Post and record.** Preview posts nothing; a test post strips real mentions so writers are not pinged. Steps are recorded only after a live post, so testing never uses up a reminder.

## Setup

1. Run it once as imported. It works through the sample calendar and stops at `STOP: preview - nothing posted`.
2. Share the database with your Notion integration, add the credential to `Query the content calendar`, set `NOTION_DATABASE_ID` and the property names in `PROPS`, then set `USE_NOTION = true`.
3. Fill `WRITER_SLACK_IDS` (Notion email or name to Slack member id), connect Slack and set `SLACK_CHANNEL_ID`.
4. Set `TEST_EMAIL` to any address to post with a [TEST] prefix and no real mentions. Set `TEST_RUN = false` to go live.

## Settings in `config`

| Setting | Ships as | What it does |
|---|---|---|
| `USE_NOTION` | `false` | set true after adding the Notion credential and sharing the database with it |
| `NOTION_DATABASE_ID` | `''` | id from the database URL (32 characters) |
| `PROPS` | `{"title":"Name","status":"Status","due":` | property names in your database |
| `DONE_STATUSES` | `["Published","Scheduled","Cancelled"]` | statuses that need no reminder |
| `REMINDER_DAYS` | `[3,1]` | days before the due date that get a reminder |
| `OVERDUE_DAYS` | `[1,3,7]` | days late that get an overdue reminder |
| `WRITER_SLACK_IDS` | `{"maya@yourcompany.example":"U01MAYA00",` | Notion person email or name -> Slack member id |
| `EDITOR_SLACK_ID` | `'U01EDIT00'` | Slack member id mentioned on overdue and unassigned pieces |
| `SLACK_CHANNEL_ID` | `''` | channel for reminders; blank skips Slack |
| `TEST_RUN` | `true` | ships true. Nothing reaches a real recipient or system. |
| `TEST_EMAIL` | `''` | blank means preview only; set it and sends are redirected there |

## Nodes that need a credential

- `Query the content calendar`
- `Post reminders to Slack`

## Requirements

- A Notion database with a title, status (or select), date and person property
- A Slack workspace

## Customising

- `REMINDER_DAYS` and `OVERDUE_DAYS` set the ladder.
- `DONE_STATUSES` lists statuses that end reminders, such as Published or Cancelled.
- `EDITOR_SLACK_ID` gets mentioned for unassigned and overdue pieces.

## Verified

Every scenario below was run by `_kit/simulate.ts`: the real Code-node JavaScript and IF/Switch logic, with service calls replaced by canned responses.

| Scenario | Nodes run | Sends or writes | Ends at |
|---|---|---|---|
| shipped config (preview) | 10 | none | `STOP: preview - nothing posted` |
| test post strips mentions | 13 | `Post reminders to Slack` | `STOP: test post - steps not recorded` |
| live with Notion | 14 | `Post reminders to Slack` | `Record sent steps` |
