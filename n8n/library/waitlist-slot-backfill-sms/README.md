# Offer cancelled appointment slots to a waitlist by Twilio SMS

When a booking is cancelled, texts the first eligible people on a Google Sheets waitlist (right service, available that day and time, not already offered it), then handles their SMS replies in the same workflow: the first YES gets the slot and everyone else is told it has gone.

Import `waitlist-slot-backfill-sms-publish.json` into n8n. It runs on import with no credentials: the shipped `config` takes the built-in sample path and stops on a named `STOP:` node before anything is sent or written.

## Who it's for

Clinics, salons and trainers who keep a waitlist but fill a late cancellation by ringing round. The gap is offered to three people by text within a minute, and the first to answer gets it.

## How it works

1. Your booking tool posts each cancellation to `Receive a cancellation`. A manual run uses a sample cancellation.
2. The Waitlist and Offers tabs are read. A person is eligible when they are waiting, want this service (or Any), are available on that date and time of day, have a valid mobile number and have not been offered this slot before.
3. The longest-waiting `OFFER_TO_FIRST_N` people get a text and one row each on the Offers tab.
4. Twilio posts replies to `Receive an SMS reply`. The first YES inside `OFFER_EXPIRY_MINUTES` wins: they get a confirmation, the other people offered that slot are told it has gone, and a NO is marked declined.
5. Every decision is written back to the Offers tab by Offer ID, so the sheet shows who was offered what and who won.

## Sections on the canvas

1. **Start and settings.** Two webhooks share one workflow: the booking tool calls `Receive a cancellation` and Twilio calls `Receive an SMS reply`. Keeping both together means the offer and the reply rules read the same `config`.
2. **Read the event.** `Read the incoming event` turns either webhook body into one event shape and rejects a body with no slot or no sender. A manual run falls through to `Load sample cancellation`.
3. **Read waitlist and offers.** Both events need the Offers tab: a cancellation to avoid offering the same slot twice, a reply to find the open offer. The sample rows include an open offer, so the reply path can be tested with no sheet.
4. **Decide the texts.** The first YES wins because `Settle the reply` checks the Offers tab for a winner before confirming. Late or expired replies get a polite no. Both branches return texts and rows in one shape.
5. **Text and record.** Nothing is texted while `TEST_RUN` is true and `TEST_EMAIL` is blank. Test texts go to `TEST_PHONE` and the Offers tab is written only on a live run, so tests never claim a slot.

## Setup

1. Run it once as imported. It offers a sample slot to sample waitlist entries and stops at `STOP: preview - nothing sent`.
2. Create Waitlist (Name, Phone, Service, Preferred time, Available from, Available until, Added, Status) and Offers tabs, connect Google Sheets and set `WAITLIST_SHEET_ID`.
3. Add a Twilio credential, set `TWILIO_FROM`, and set that number's incoming message webhook to the production URL of `Receive an SMS reply`.
4. For a test, set `TEST_EMAIL` to any address and `TEST_PHONE` to your mobile. Set `TEST_RUN = false` to text the waitlist.

## Settings in `config`

| Setting | Ships as | What it does |
|---|---|---|
| `WAITLIST_SHEET_ID` | `''` | Google Sheets id with Waitlist and Offers tabs; blank uses sample rows |
| `TIMEZONE` | `'America/New_York'` | IANA timezone for slot times and time-of-day matching |
| `BUSINESS_NAME` | `'Lumen Physio'` | shown in every text |
| `TWILIO_FROM` | `''` | your Twilio sending number in E.164 |
| `OFFER_TO_FIRST_N` | `3` | people texted per cancelled slot, longest waiting first |
| `OFFER_EXPIRY_MINUTES` | `180` | a YES after this long no longer wins the slot |
| `MIN_NOTICE_MINUTES` | `60` | slots starting sooner than this are not offered |
| `TIME_OF_DAY` | `{"Morning":[6,12],"Afternoon":[12,17],"E` | hour ranges [from, to) for preferred times |
| `TEST_PHONE` | `''` | test mode texts this number instead of the waitlist; ships blank |
| `TEST_RUN` | `true` | ships true. Nothing reaches a real recipient or system. |
| `TEST_EMAIL` | `''` | blank means preview only; set it and sends are redirected there |

## Nodes that need a credential

- `Read the Waitlist tab`
- `Read the Offers tab`
- `Text with Twilio`
- `Update the Offers tab`

## Requirements

- A Google Sheet with Waitlist and Offers tabs
- A Twilio account with an SMS number
- A booking tool that can call a webhook on cancellation

## Customising

- `OFFER_TO_FIRST_N` sets how many people hear about each slot.
- `OFFER_EXPIRY_MINUTES` sets how long a YES still counts.
- `TIME_OF_DAY` sets the hour boundaries for Morning, Afternoon and Evening.

## Verified

Every scenario below was run by `_kit/simulate.ts`: the real Code-node JavaScript and IF/Switch logic, with service calls replaced by canned responses.

| Scenario | Nodes run | Sends or writes | Ends at |
|---|---|---|---|
| shipped config (sample cancellation, preview) | 15 | none | `STOP: preview - nothing sent` |
| first YES wins (test mode) | 16 | `Text with Twilio` | `STOP: test send - Offers tab untouched` |
| live late YES after the slot was won | 18 | `Text with Twilio`, `Update the Offers tab` | `Update the Offers tab` |
