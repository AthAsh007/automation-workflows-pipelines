# Send 24-hour and 2-hour appointment reminders from Google Calendar via Twilio SMS

Every 15 minutes reads the next 26 hours of a Google Calendar, finds appointments due a 24-hour or 2-hour reminder, pulls and normalises each customer phone number to E.164, respects quiet hours and an opt-out list, and texts each reminder once.

Import `appointment-sms-reminders-publish.json` into n8n. It runs on import with no credentials: the shipped `config` takes the built-in sample path and stops on a named `STOP:` node before anything is sent or written.

## Who it's for

Clinics, salons, tutors and repair shops that book clients into a Google Calendar and lose hours each week to no-shows. Each client gets a text the day before and again two hours before.

## How it works

1. Every 15 minutes it reads appointments starting in the next 26 hours, or 8 sample appointments until Google Calendar is connected.
2. Cancelled events, all-day events and blocks like Lunch are skipped. The phone number is read from a "Phone:" line in the description or from an attendee name, then normalised to E.164.
3. An appointment 2.5 to 24 hours away is due its 24-hour reminder, one 15 minutes to 2 hours away its 2-hour reminder. Each reminder is sent once; the event id, start time and type are remembered in workflow static data.
4. Numbers on `OPT_OUT_NUMBERS` and events marked "no sms" are skipped. During quiet hours (21:00 to 08:00 by default) reminders wait for the next run.

## Sections on the canvas

1. **Start and settings.** Runs every 15 minutes, often enough that the 2-hour reminder lands between 1h45 and 2h before. Quiet hours, the opt-out list and the message details all live in `config`.
2. **Read the next 26 hours.** One events.list call with singleEvents expands recurring bookings into real dates. `Load sample appointments` returns the same shape with start times relative to now, so each reminder rule has a case.
3. **Decide who gets a text.** A number that cannot be read as E.164 is held, never guessed. Opt-outs are checked after normalising, so (212) 555-0177 and +12125550177 count as the same person. Quiet hours hold texts for the next run.
4. **Send and remember.** Nothing is texted while `TEST_RUN` is true and `TEST_EMAIL` is blank. A test send goes to `TEST_PHONE` and is not remembered, so the customer still gets the real reminder after going live.

## Setup

1. Run it once as imported. It previews against sample appointments and stops at `STOP: preview - nothing sent`.
2. Add a Google Calendar credential to `Fetch upcoming events from Google Calendar`, set `CALENDAR_ID` and set `USE_GOOGLE_CALENDAR = true`.
3. Add a Twilio credential to `Text the reminder with Twilio` and set `TWILIO_FROM` to your Twilio number.
4. For a test, set `TEST_EMAIL` to any address and `TEST_PHONE` to your own mobile: every text goes to you. Set `TEST_RUN = false` to text customers.

## Settings in `config`

| Setting | Ships as | What it does |
|---|---|---|
| `USE_GOOGLE_CALENDAR` | `false` | set true after adding the Google Calendar credential |
| `CALENDAR_ID` | `'primary'` | calendar id; 'primary' is the connected account's main calendar |
| `TIMEZONE` | `'America/New_York'` | IANA timezone for quiet hours and the time shown in the text |
| `BUSINESS_NAME` | `'Lumen Physio'` | shown in every text |
| `CONTACT_PHONE` | `'(212) 555-0100'` | number clients call to reschedule |
| `TWILIO_FROM` | `''` | your Twilio sending number in E.164, e.g. +15555550100 |
| `DEFAULT_COUNTRY_CODE` | `'1'` | country code added to numbers written without + (1 = US/Canada) |
| `QUIET_START_HOUR` | `21` | no texts from this hour (24h clock, TIMEZONE) |
| `QUIET_END_HOUR` | `8` | texts resume at this hour |
| `SKIP_TITLE_WORDS` | `["lunch","block","busy","admin"]` | events whose title contains one of these are not appointments |
| `OPT_OUT_NUMBERS` | `["+12125550177"]` | E.164 numbers that replied STOP or asked not to be texted |
| `MAX_SMS_PER_RUN` | `30` | hard ceiling on texts per run |
| `TEST_PHONE` | `''` | test mode texts this number instead of the customer; ships blank |
| `TEST_RUN` | `true` | ships true. Nothing reaches a real recipient or system. |
| `TEST_EMAIL` | `''` | blank means preview only; set it and sends are redirected there |

## Nodes that need a credential

- `Fetch upcoming events from Google Calendar`
- `Text the reminder with Twilio`

## Requirements

- A Google Calendar with client appointments
- A Twilio account with an SMS-capable number

## Customising

- `BUSINESS_NAME`, `CONTACT_PHONE` and `TIMEZONE` fill in the text message.
- `QUIET_START_HOUR` and `QUIET_END_HOUR` set when no texts go out.
- `DEFAULT_COUNTRY_CODE` decides how local numbers without a + are read.

## Verified

Every scenario below was run by `_kit/simulate.ts`: the real Code-node JavaScript and IF/Switch logic, with service calls replaced by canned responses.

| Scenario | Nodes run | Sends or writes | Ends at |
|---|---|---|---|
| shipped config (preview) | 8 | none | `Summarise the run` |
| test send to TEST_PHONE outside quiet hours | 12 | `Text the reminder with Twilio` | `Summarise the run`, `STOP: test send - nothing remembered` |
| live with Google Calendar and Twilio | 12 | `Text the reminder with Twilio` | `Summarise the run`, `Remember sent reminders` |
