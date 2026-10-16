# Thank Stripe donors by Gmail and log gifts to Airtable with receipt numbers

Picks up new successful Stripe donations every hour, tells first-time donors from returning ones using Airtable gift history, numbers each receipt in sequence, adds a tax receipt line above a threshold, emails a thank-you through Gmail and logs the gift to Airtable.

Import `nonprofit-donation-thank-you-publish.json` into n8n. It runs on import with no credentials: the shipped `config` takes the built-in sample path and stops on a named `STOP:` node before anything is sent or written.

## Who it's for

Small charities and community groups that take donations through Stripe payment links or Checkout and send thank-you notes by hand. Every donor gets a numbered receipt within the hour.

## How it works

1. Every hour it reads successful Stripe charges created since the last processed charge, or sample donations until Stripe is connected. Refunded charges and charges with no email are skipped.
2. The donors' emails are looked up in your Airtable Gifts table, so the email can say "welcome" to a first-time donor and "thank you again" to a returning one. Monthly gifts get their own line.
3. Receipt numbers run in sequence (R-2026-01001, R-2026-01002) in the order the gifts were made. Gifts of 250 or more get the written acknowledgement line for tax purposes.
4. The email goes out through Gmail, then the gift is added to Airtable with its receipt number. The charge cursor and counter only move on a live run.

## Sections on the canvas

1. **Start and settings.** Runs five minutes past every hour. Receipt numbering, the tax threshold and the email sign-off are all set in `config`.
2. **Read new donations.** `Work out the start time` reads the stored cursor, so only charges after the last processed one are fetched. Failed, refunded and email-less charges stop at `Collect new gifts`, and an empty hour ends at `STOP: no new gifts`.
3. **Check history and number receipts.** Airtable is queried only for the donors in this batch. `Number receipts and pick wording` assigns numbers in gift order, so receipts never skip or repeat within a run.
4. **Send, log and advance.** A test send goes to `TEST_EMAIL` and logs nothing. Only a live run writes to Airtable and moves the cursor and receipt counter, so test runs never use up receipt numbers.

## Setup

1. Run it once as imported. It writes sample thank-yous and stops at `STOP: preview - nothing sent`.
2. Add a Stripe credential to `Fetch new Stripe charges` and set `USE_STRIPE = true`.
3. Add an Airtable token credential to both Airtable nodes, fill `AIRTABLE_BASE_ID`, and create a Gifts table with Email, Name, Amount, Currency, Date, Receipt number, Donor type and Stripe charge fields.
4. Connect Gmail. Put your address in `TEST_EMAIL` to receive every thank-you yourself, then set `TEST_RUN = false`.

## Settings in `config`

| Setting | Ships as | What it does |
|---|---|---|
| `USE_STRIPE` | `false` | set true after adding the Stripe credential |
| `AIRTABLE_BASE_ID` | `''` | Airtable base id (starts with app); blank uses sample history |
| `GIFTS_TABLE` | `'Gifts'` | Airtable table name for gifts |
| `FIRST_LOOKBACK_HOURS` | `24` | how far back the very first run looks |
| `RECEIPT_PREFIX` | `'R'` | receipt numbers look like R-2026-01001 |
| `RECEIPT_START` | `1001` | first receipt number when no counter is stored yet |
| `TAX_RECEIPT_THRESHOLD` | `250` | gifts at or above this get the tax acknowledgement line (major units) |
| `TAX_LINE` | `'No goods or services were provided in...'` | acknowledgement text for gifts over the threshold |
| `ORG_NAME` | `'Riverbend Food Share'` | organisation name in the email |
| `SIGNATORY` | `'Jo Marsh, Director'` | sign-off line |
| `TEST_RUN` | `true` | ships true. Nothing reaches a real recipient or system. |
| `TEST_EMAIL` | `''` | blank means preview only; set it and sends are redirected there |

## Nodes that need a credential

- `Fetch new Stripe charges`
- `Look up past gifts in Airtable`
- `Email the thank-you`
- `Log the gift in Airtable`

## Requirements

- A Stripe account receiving donations
- An Airtable base with a Gifts table
- A Gmail account

## Customising

- `TAX_RECEIPT_THRESHOLD` and `TAX_LINE` control the acknowledgement wording.
- `RECEIPT_PREFIX` and `RECEIPT_START` set the numbering.
- `ORG_NAME` and `SIGNATORY` sign every email.

## Verified

Every scenario below was run by `_kit/simulate.ts`: the real Code-node JavaScript and IF/Switch logic, with service calls replaced by canned responses.

| Scenario | Nodes run | Sends or writes | Ends at |
|---|---|---|---|
| shipped config (preview) | 15 | none | `STOP: preview - nothing sent` |
| test send to TEST_EMAIL | 17 | `Email the thank-you` | `STOP: test send - nothing logged` |
| live with Stripe and Airtable | 21 | `Email the thank-you`, `Log the gift in Airtable` | `Move the cursor and counter` |
