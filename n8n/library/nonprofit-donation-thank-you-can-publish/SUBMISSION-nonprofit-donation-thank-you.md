# Thank Stripe donors by Gmail and log gifts to Airtable with receipt numbers

**Who's it for**
Small charities and community groups that take donations through Stripe payment links or Checkout and send thank-you notes by hand. Every donor gets a numbered receipt within the hour.

**How it works**
1. Every hour it reads successful Stripe charges created since the last processed charge, or sample donations until Stripe is connected. Refunded charges and charges with no email are skipped.
2. The donors' emails are looked up in your Airtable Gifts table, so the email can say "welcome" to a first-time donor and "thank you again" to a returning one. Monthly gifts get their own line.
3. Receipt numbers run in sequence (R-2026-01001, R-2026-01002) in the order the gifts were made. Gifts of 250 or more get the written acknowledgement line for tax purposes.
4. The email goes out through Gmail, then the gift is added to Airtable with its receipt number. The charge cursor and counter only move on a live run.

**How to set up**
1. Run it once as imported. It writes sample thank-yous and stops at `STOP: preview - nothing sent`.
2. Add a Stripe credential to `Fetch new Stripe charges` and set `USE_STRIPE = true`.
3. Add an Airtable token credential to both Airtable nodes, fill `AIRTABLE_BASE_ID`, and create a Gifts table with Email, Name, Amount, Currency, Date, Receipt number, Donor type and Stripe charge fields.
4. Connect Gmail. Put your address in `TEST_EMAIL` to receive every thank-you yourself, then set `TEST_RUN = false`.

**Requirements**
- A Stripe account receiving donations
- An Airtable base with a Gifts table
- A Gmail account

**How to customize**
- `TAX_RECEIPT_THRESHOLD` and `TAX_LINE` control the acknowledgement wording.
- `RECEIPT_PREFIX` and `RECEIPT_START` set the numbering.
- `ORG_NAME` and `SIGNATORY` sign every email.
