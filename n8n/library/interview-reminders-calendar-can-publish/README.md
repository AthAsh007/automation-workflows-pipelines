# Send interview reminders to candidates from Google Calendar with Gmail

Finds interview events on a Google Calendar 24 hours and 2 hours ahead, picks the external candidate from the attendees, pulls the meeting link or address, adds prep notes for the interview type and emails one reminder per step.

Import `interview-reminders-calendar-publish.json` into n8n. It runs on import with no credentials: the shipped `config` takes the built-in sample path and stops on a named `STOP:` node before anything is sent or written.

## Who it's for

Recruiters and hiring managers who book interviews in Google Calendar and lose candidates to no-shows. Candidates get a short, specific reminder with the link and what to prepare, without anyone writing it.

## How it works

1. Every hour it lists events on `CALENDAR_ID` that match `EVENT_KEYWORD` and start within the next 27 hours, or sample events until Calendar is connected.
2. A reminder is due when an event starts inside an hour of a step in `REMINDERS` (24 hours and 2 hours by default) and that step was not sent for that event.
3. The candidate is the attendee outside `COMPANY_DOMAINS` who has not declined. Cancelled events, internal-only events and events with no link or address are held back with a reason.
4. The meeting link comes from Google Meet, conference data or a Zoom or Teams URL in the description. Prep notes come from `INTERVIEW_TYPES` by keyword in the title.

## Sections on the canvas

1. **Start and settings.** Runs at 5 past every hour or by hand. The reminder steps, company domains and prep notes live in `config`, so adding a 1-hour nudge is one more line in `REMINDERS`.
2. **Read upcoming interviews.** `Fetch interview events` expands recurring events and filters on `EVENT_KEYWORD` server side. `Load sample events` returns the same events-list shape, so the parser in the next step is exercised either way.
3. **Find the candidate and the link.** The candidate is whoever is outside `COMPANY_DOMAINS`, so interviewers never get the reminder. Events with no link or address are held instead of sending a reminder that cannot be acted on.
4. **Send and remember.** In test mode reminders go to `TEST_EMAIL` and nothing is recorded, so you can repeat the test. A live send records the event and step, which is what stops the next hourly run from sending it again.

## Setup

1. Run it once as imported. It plans reminders for sample events and stops at `STOP: preview - nothing sent`.
2. Add a Google Calendar credential to `Fetch interview events`, set `CALENDAR_ID` and `USE_CALENDAR = true`.
3. Connect Gmail and list your email domains in `COMPANY_DOMAINS` so interviewers are never mistaken for candidates.
4. Put your address in `TEST_EMAIL` to receive every reminder yourself, then set `TEST_RUN = false`.

## Settings in `config`

| Setting | Ships as | What it does |
|---|---|---|
| `USE_CALENDAR` | `false` | set true after adding the Google Calendar credential |
| `CALENDAR_ID` | `'primary'` | calendar to read; 'primary' or a shared calendar id |
| `EVENT_KEYWORD` | `'Interview'` | only events whose text contains this word |
| `COMPANY_DOMAINS` | `["northwind.example"]` | attendees on these domains are interviewers, never candidates |
| `REMINDERS` | `[{"hours":24,"label":"tomorrow"},{"hours` | reminder steps in hours before the start; each fires once per event |
| `INTERVIEW_TYPES` | `{"phone screen":{"prep":"A 30-minute con` | title keyword -> prep note and what to bring |
| `RECRUITER_NAME` | `'Maya at Northwind'` | sign-off on every reminder |
| `DAILY_CAP` | `40` | hard ceiling on reminders per run |
| `TEST_RUN` | `true` | ships true. Nothing reaches a real recipient or system. |
| `TEST_EMAIL` | `''` | blank means preview only; set it and sends are redirected there |

## Nodes that need a credential

- `Fetch interview events`
- `Email the reminder`

## Requirements

- A Google Calendar with interview events
- A Gmail account

## Customising

- `REMINDERS` sets the steps, in hours before the start.
- `INTERVIEW_TYPES` maps title keywords to prep notes and what to bring.
- `EVENT_KEYWORD` limits the search to events with that word, for example Interview.

## Verified

Every scenario below was run by `_kit/simulate.ts`: the real Code-node JavaScript and IF/Switch logic, with service calls replaced by canned responses.

| Scenario | Nodes run | Sends or writes | Ends at |
|---|---|---|---|
| shipped config (sample events, preview) | 9 | none | `STOP: preview - nothing sent` |
| live with Calendar | 11 | `Email the reminder` | `Remember sent steps` |
