# Offer cancelled appointment slots to a waitlist by Twilio SMS

**Who's it for**
Clinics, salons and trainers who keep a waitlist but fill a late cancellation by ringing round. The gap is offered to three people by text within a minute, and the first to answer gets it.

**How it works**
1. Your booking tool posts each cancellation to `Receive a cancellation`. A manual run uses a sample cancellation.
2. The Waitlist and Offers tabs are read. A person is eligible when they are waiting, want this service (or Any), are available on that date and time of day, have a valid mobile number and have not been offered this slot before.
3. The longest-waiting `OFFER_TO_FIRST_N` people get a text and one row each on the Offers tab.
4. Twilio posts replies to `Receive an SMS reply`. The first YES inside `OFFER_EXPIRY_MINUTES` wins: they get a confirmation, the other people offered that slot are told it has gone, and a NO is marked declined.
5. Every decision is written back to the Offers tab by Offer ID, so the sheet shows who was offered what and who won.

**How to set up**
1. Run it once as imported. It offers a sample slot to sample waitlist entries and stops at `STOP: preview - nothing sent`.
2. Create Waitlist (Name, Phone, Service, Preferred time, Available from, Available until, Added, Status) and Offers tabs, connect Google Sheets and set `WAITLIST_SHEET_ID`.
3. Add a Twilio credential, set `TWILIO_FROM`, and set that number's incoming message webhook to the production URL of `Receive an SMS reply`.
4. For a test, set `TEST_EMAIL` to any address and `TEST_PHONE` to your mobile. Set `TEST_RUN = false` to text the waitlist.

**Requirements**
- A Google Sheet with Waitlist and Offers tabs
- A Twilio account with an SMS number
- A booking tool that can call a webhook on cancellation

**How to customize**
- `OFFER_TO_FIRST_N` sets how many people hear about each slot.
- `OFFER_EXPIRY_MINUTES` sets how long a YES still counts.
- `TIME_OF_DAY` sets the hour boundaries for Morning, Afternoon and Evening.
