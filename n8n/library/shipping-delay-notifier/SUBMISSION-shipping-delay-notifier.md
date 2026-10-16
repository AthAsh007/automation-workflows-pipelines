# Warn customers from Gmail when AfterShip shows a stalled shipment

**Who's it for**
Online shops that ship with several carriers and hear about lost or stuck parcels only when the customer writes in angry. A short, early email turns most of those tickets into a thank-you.

**How it works**
1. Every weekday at 10:00 it reads open shipments from the Shipments tab, or 7 sample shipments until the sheet is set.
2. It looks up all tracking numbers in one AfterShip call, or uses sample tracking until `AFTERSHIP_ENABLED` is on.
3. A shipment is delayed if the carrier reports an exception or failed attempt, if the last scan is 3 or more days old, or if the label was created 4 or more days ago and never scanned.
4. Each delayed shipment gets one email in plain words for its case; a filled notified_at column means it never gets another.
5. The team gets one Slack digest of every delay, plus tracking numbers AfterShip does not know.

**How to set up**
1. Run it once as imported. It checks the sample shipments and stops at `STOP: preview - nothing sent`.
2. Create a Shipments tab (order, email, first_name, carrier, tracking_number, shipped_at, notified_at, delay_reason) and put its id in `SHIPMENT_SHEET_ID`.
3. Add a Header Auth credential named `as-api-key` with your AfterShip key to `Fetch tracking from AfterShip`, and set `AFTERSHIP_ENABLED = true`.
4. Connect Gmail and Slack, set `SLACK_CHANNEL_ID`, then put your address in `TEST_EMAIL` before setting `TEST_RUN = false`.

**Requirements**
- An AfterShip account with API access
- A Google Sheet of shipments
- A Gmail account
- Optional: a Slack workspace

**How to customize**
- `STALL_DAYS` and `LABEL_ONLY_DAYS` set when silence counts as a delay.
- `EXCEPTION_TAGS` lists AfterShip statuses that trigger an email at once.
- `MESSAGES` holds the wording for each delay type.
