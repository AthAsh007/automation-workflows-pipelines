# Send webinar reminders and replay emails from registrations in Google Sheets

Every 15 minutes, works out which registrants in a Google Sheets tab are due a 24-hour reminder, a 1-hour reminder, or after the event a replay (no-shows) or thank-you (attendees) email, sends each once through Gmail and stamps the sent column.

Import `webinar-registration-reminders-publish.json` into n8n. It runs on import with no credentials: the shipped `config` takes the built-in sample path and stops on a named `STOP:` node before anything is sent or written.

## Who it's for

Marketers and founders who run webinars with a registration form that writes to Google Sheets, and who would rather not pay for a webinar tool just for reminder emails.

## How it works

1. Every 15 minutes it reads the Registrants tab, or sample registrations for three sample events until the sheet is connected.
2. For each registrant and event it picks at most one email: the 24-hour reminder (24 to 2 hours before), the 1-hour reminder (the last hour), or after the event a replay email for no-shows and a thank-you for attendees.
3. A filled sent column, an opt-out, a bad email or a sign-up less than an hour old holds the email back with a reason. At most 150 emails go out per run.
4. Each email goes out through Gmail and the matching sent column is stamped with the time, so nothing is sent twice.

## Sections on the canvas

1. **Start and settings.** Runs every 15 minutes, which is tight enough for the 1-hour reminder. Events, delays and the per-run cap are constants in `config`.
2. **Read registrations.** Registrations come from the sheet your form already writes to. `Load sample registrations` brings its own three events placed around the current time, so every email type shows up in a preview.
3. **Decide who gets what.** Stages are time windows, not exact times, so a run that is late by 10 minutes still sends. The sent column is the only memory, which makes the sheet the record of what went out.
4. **Send and stamp.** Nothing is sent in preview, and a test send goes to `TEST_EMAIL` without touching the sheet. Only a live send stamps the column, which is what stops the next run from repeating it.

## Setup

1. Run it once as imported. It works through the sample events and stops at `STOP: preview - nothing sent`.
2. Add your webinar to `EVENTS` with its id, start time (ISO, with timezone), length, join link and replay link.
3. Connect Google Sheets and set `REGISTRANTS_SHEET_ID`. The tab needs id, event_id, email, name, registered_at, attended, opted_out, reminder_24h_sent, reminder_1h_sent and replay_sent.
4. Put your address in `TEST_EMAIL` to receive every email yourself, then set `TEST_RUN = false`.

## Settings in `config`

| Setting | Ships as | What it does |
|---|---|---|
| `REGISTRANTS_SHEET_ID` | `''` | Google Sheets id with a Registrants tab; blank uses the sample |
| `EVENTS` | `[{"id":"nov-demo","title":"Live demo: ex` | webinars: id matches the event_id column; start is ISO with timezone |
| `REPLAY_DELAY_HOURS` | `2` | hours after the end before replay and thank-you emails go out |
| `REPLAY_WINDOW_DAYS` | `7` | replay emails stop this many days after the event |
| `SEND_THANKS` | `true` | attendees get a thank-you with the replay link |
| `MAX_PER_RUN` | `150` | hard ceiling on emails per run |
| `HOST_NAME` | `'The Tallyroom team'` | sign-off on every email |
| `TEST_RUN` | `true` | ships true. Nothing reaches a real recipient or system. |
| `TEST_EMAIL` | `''` | blank means preview only; set it and sends are redirected there |

## Nodes that need a credential

- `Read registrants`
- `Email the registrant`
- `Mark sent in the sheet`

## Requirements

- A Google Sheet of registrations
- A Gmail account

## Customising

- `REPLAY_DELAY_HOURS` sets how long after the end the replay goes out.
- `SEND_THANKS` false skips the attendee thank-you.
- `MAX_PER_RUN` limits how many emails one run can send.

## Verified

Every scenario below was run by `_kit/simulate.ts`: the real Code-node JavaScript and IF/Switch logic, with service calls replaced by canned responses.

| Scenario | Nodes run | Sends or writes | Ends at |
|---|---|---|---|
| shipped config (preview) | 11 | none | `STOP: preview - nothing sent` |
| test send to TEST_EMAIL | 13 | `Email the registrant` | `STOP: test send - sheet untouched` |
| live with the sheet | 15 | `Email the registrant`, `Mark sent in the sheet` | `Mark sent in the sheet` |
