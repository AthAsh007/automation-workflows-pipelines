# Send interview reminders to candidates from Google Calendar with Gmail

**Who's it for**
Recruiters and hiring managers who book interviews in Google Calendar and lose candidates to no-shows. Candidates get a short, specific reminder with the link and what to prepare, without anyone writing it.

**How it works**
1. Every hour it lists events on `CALENDAR_ID` that match `EVENT_KEYWORD` and start within the next 27 hours, or sample events until Calendar is connected.
2. A reminder is due when an event starts inside an hour of a step in `REMINDERS` (24 hours and 2 hours by default) and that step was not sent for that event.
3. The candidate is the attendee outside `COMPANY_DOMAINS` who has not declined. Cancelled events, internal-only events and events with no link or address are held back with a reason.
4. The meeting link comes from Google Meet, conference data or a Zoom or Teams URL in the description. Prep notes come from `INTERVIEW_TYPES` by keyword in the title.

**How to set up**
1. Run it once as imported. It plans reminders for sample events and stops at `STOP: preview - nothing sent`.
2. Add a Google Calendar credential to `Fetch interview events`, set `CALENDAR_ID` and `USE_CALENDAR = true`.
3. Connect Gmail and list your email domains in `COMPANY_DOMAINS` so interviewers are never mistaken for candidates.
4. Put your address in `TEST_EMAIL` to receive every reminder yourself, then set `TEST_RUN = false`.

**Requirements**
- A Google Calendar with interview events
- A Gmail account

**How to customize**
- `REMINDERS` sets the steps, in hours before the start.
- `INTERVIEW_TYPES` maps title keywords to prep notes and what to bring.
- `EVENT_KEYWORD` limits the search to events with that word, for example Interview.
