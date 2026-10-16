# Offer rental viewing slots by email from form requests

**Who's it for**
Letting agents and landlords who run group or back-to-back viewings and spend the morning swapping emails to find a time. A prospect fills in one form and gets three real options within a minute.

**How it works**
1. A prospect submits the form with the property, preferred days and preferred time of day. A manual run uses a sample request.
2. Viewing slots and current holds are read from the Slots and Holds tabs. Free places = capacity minus bookings minus holds that have not expired.
3. Slots at least `MIN_NOTICE_HOURS` ahead and within `LOOKAHEAD_DAYS` are scored: +2 for the preferred days, +2 for the preferred time. The best 3 are picked, one per day first so the choices are spread out.
4. The offered slots are written to the Holds tab with a 24-hour expiry and the prospect gets an email listing them.
5. With no free slot, the request goes to the Waitlist tab and the agent gets an email.

**How to set up**
1. Run it once as imported. It matches the sample request and stops at `STOP: preview - nothing sent`.
2. Create a sheet with Slots (Slot ID, Property, Start, Capacity, Booked), Holds (Hold ID, Slot ID, Email, Expires) and Waitlist tabs, connect Google Sheets and set `SLOTS_SHEET_ID`.
3. Connect Gmail and set `AGENT_EMAIL` and `AGENCY_NAME`. Edit the Property options on the form to match your Slot sheet.
4. Put your address in `TEST_EMAIL` to receive the offers yourself, then set `TEST_RUN = false`.

**Requirements**
- A Google Sheet with Slots, Holds and Waitlist tabs
- A Gmail account

**How to customize**
- `HOLD_HOURS` sets how long offered slots stay reserved.
- `OFFER_COUNT` and `LOOKAHEAD_DAYS` change how many choices are offered and how far ahead.
- `TIMEZONE` must match the times written in the Start column.
