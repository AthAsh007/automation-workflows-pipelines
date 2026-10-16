# Send 24-hour and 2-hour appointment reminders from Google Calendar via Twilio SMS

**Who's it for**
Clinics, salons, tutors and repair shops that book clients into a Google Calendar and lose hours each week to no-shows. Each client gets a text the day before and again two hours before.

**How it works**
1. Every 15 minutes it reads appointments starting in the next 26 hours, or 8 sample appointments until Google Calendar is connected.
2. Cancelled events, all-day events and blocks like Lunch are skipped. The phone number is read from a "Phone:" line in the description or from an attendee name, then normalised to E.164.
3. An appointment 2.5 to 24 hours away is due its 24-hour reminder, one 15 minutes to 2 hours away its 2-hour reminder. Each reminder is sent once; the event id, start time and type are remembered in workflow static data.
4. Numbers on `OPT_OUT_NUMBERS` and events marked "no sms" are skipped. During quiet hours (21:00 to 08:00 by default) reminders wait for the next run.

**How to set up**
1. Run it once as imported. It previews against sample appointments and stops at `STOP: preview - nothing sent`.
2. Add a Google Calendar credential to `Fetch upcoming events from Google Calendar`, set `CALENDAR_ID` and set `USE_GOOGLE_CALENDAR = true`.
3. Add a Twilio credential to `Text the reminder with Twilio` and set `TWILIO_FROM` to your Twilio number.
4. For a test, set `TEST_EMAIL` to any address and `TEST_PHONE` to your own mobile: every text goes to you. Set `TEST_RUN = false` to text customers.

**Requirements**
- A Google Calendar with client appointments
- A Twilio account with an SMS-capable number

**How to customize**
- `BUSINESS_NAME`, `CONTACT_PHONE` and `TIMEZONE` fill in the text message.
- `QUIET_START_HOUR` and `QUIET_END_HOUR` set when no texts go out.
- `DEFAULT_COUNTRY_CODE` decides how local numbers without a + are read.
