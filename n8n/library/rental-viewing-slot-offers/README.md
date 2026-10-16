# Offer rental viewing slots by email from form requests

Takes a viewing request from an n8n form, finds the three best free slots for that property in Google Sheets by day and time preference, holds them for 24 hours and emails the choices, or adds the person to a waitlist and alerts the agent when nothing is free.

Import `rental-viewing-slot-offers-publish.json` into n8n. It runs on import with no credentials: the shipped `config` takes the built-in sample path and stops on a named `STOP:` node before anything is sent or written.

## Who it's for

Letting agents and landlords who run group or back-to-back viewings and spend the morning swapping emails to find a time. A prospect fills in one form and gets three real options within a minute.

## How it works

1. A prospect submits the form with the property, preferred days and preferred time of day. A manual run uses a sample request.
2. Viewing slots and current holds are read from the Slots and Holds tabs. Free places = capacity minus bookings minus holds that have not expired.
3. Slots at least `MIN_NOTICE_HOURS` ahead and within `LOOKAHEAD_DAYS` are scored: +2 for the preferred days, +2 for the preferred time. The best 3 are picked, one per day first so the choices are spread out.
4. The offered slots are written to the Holds tab with a 24-hour expiry and the prospect gets an email listing them.
5. With no free slot, the request goes to the Waitlist tab and the agent gets an email.

## Sections on the canvas

1. **Start and settings.** Prospects submit `Viewing request form`; `Run manually` replays a sample request. Hold length, notice period and lookahead all live in `config`.
2. **Read the request.** `Read the viewing request` lower-cases the email and fills missing preferences with Any, so the matcher never sees a blank. A manual run uses `Load sample request`.
3. **Read slots and holds.** Slots and holds are read in parallel and merged, so free places can be counted in one place. Expired holds are ignored there, which is why nothing ever needs to delete a row from the Holds tab.
4. **Match or waitlist.** Scoring favours preferred days and times, then the earliest slot, with one slot per day picked first. With nothing free the prospect goes on the Waitlist tab and the agent is told, rather than the form silently failing.
5. **Email the choices and hold them.** Nothing is emailed while `TEST_RUN` is true and `TEST_EMAIL` is blank. Only a live run writes holds, so a test offer never blocks a real slot for the next 24 hours.

## Setup

1. Run it once as imported. It matches the sample request and stops at `STOP: preview - nothing sent`.
2. Create a sheet with Slots (Slot ID, Property, Start, Capacity, Booked), Holds (Hold ID, Slot ID, Email, Expires) and Waitlist tabs, connect Google Sheets and set `SLOTS_SHEET_ID`.
3. Connect Gmail and set `AGENT_EMAIL` and `AGENCY_NAME`. Edit the Property options on the form to match your Slot sheet.
4. Put your address in `TEST_EMAIL` to receive the offers yourself, then set `TEST_RUN = false`.

## Settings in `config`

| Setting | Ships as | What it does |
|---|---|---|
| `SLOTS_SHEET_ID` | `''` | Google Sheets id with Slots, Holds and Waitlist tabs; blank uses sample data |
| `TIMEZONE` | `'Europe/London'` | timezone of the 'YYYY-MM-DD HH:mm' times in the Start column |
| `OFFER_COUNT` | `3` | slots offered per request |
| `HOLD_HOURS` | `24` | offered slots are reserved for this long |
| `MIN_NOTICE_HOURS` | `12` | never offer a slot sooner than this |
| `LOOKAHEAD_DAYS` | `14` | never offer a slot further out than this |
| `AGENCY_NAME` | `'Harbour Lettings'` | sign-off on the offer email |
| `AGENT_EMAIL` | `'lettings@harbour-lettings.example'` | gets an alert when a request lands on the waitlist |
| `TEST_RUN` | `true` | ships true. Nothing reaches a real recipient or system. |
| `TEST_EMAIL` | `''` | blank means preview only; set it and sends are redirected there |

## Nodes that need a credential

- `Read viewing slots`
- `Read active holds`
- `Alert the letting agent`
- `Add to the waitlist`
- `Email the viewing choices`
- `Hold the offered slots`

## Requirements

- A Google Sheet with Slots, Holds and Waitlist tabs
- A Gmail account

## Customising

- `HOLD_HOURS` sets how long offered slots stay reserved.
- `OFFER_COUNT` and `LOOKAHEAD_DAYS` change how many choices are offered and how far ahead.
- `TIMEZONE` must match the times written in the Start column.

## Verified

Every scenario below was run by `_kit/simulate.ts`: the real Code-node JavaScript and IF/Switch logic, with service calls replaced by canned responses.

| Scenario | Nodes run | Sends or writes | Ends at |
|---|---|---|---|
| shipped config (preview) | 14 | none | `STOP: preview - nothing sent` |
| form request with no free slot (test mode) | 15 | `Alert the letting agent` | `STOP: test - waitlist untouched` |
| live offer with holds written | 17 | `Email the viewing choices`, `Hold the offered slots` | `Hold the offered slots` |
