# Send webinar reminders and replay emails from registrations in Google Sheets

**Who's it for**
Marketers and founders who run webinars with a registration form that writes to Google Sheets, and who would rather not pay for a webinar tool just for reminder emails.

**How it works**
1. Every 15 minutes it reads the Registrants tab, or sample registrations for three sample events until the sheet is connected.
2. For each registrant and event it picks at most one email: the 24-hour reminder (24 to 2 hours before), the 1-hour reminder (the last hour), or after the event a replay email for no-shows and a thank-you for attendees.
3. A filled sent column, an opt-out, a bad email or a sign-up less than an hour old holds the email back with a reason. At most 150 emails go out per run.
4. Each email goes out through Gmail and the matching sent column is stamped with the time, so nothing is sent twice.

**How to set up**
1. Run it once as imported. It works through the sample events and stops at `STOP: preview - nothing sent`.
2. Add your webinar to `EVENTS` with its id, start time (ISO, with timezone), length, join link and replay link.
3. Connect Google Sheets and set `REGISTRANTS_SHEET_ID`. The tab needs id, event_id, email, name, registered_at, attended, opted_out, reminder_24h_sent, reminder_1h_sent and replay_sent.
4. Put your address in `TEST_EMAIL` to receive every email yourself, then set `TEST_RUN = false`.

**Requirements**
- A Google Sheet of registrations
- A Gmail account

**How to customize**
- `REPLAY_DELAY_HOURS` sets how long after the end the replay goes out.
- `SEND_THANKS` false skips the attendee thank-you.
- `MAX_PER_RUN` limits how many emails one run can send.
