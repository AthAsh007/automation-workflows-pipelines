# Warn customers from Gmail when AfterShip shows a stalled shipment

Checks every open shipment in a Google Sheet against AfterShip tracking, finds parcels with no scan for 3 days, carrier exceptions and labels never collected, emails each affected customer once before they ask, and posts an internal digest to Slack.

Import `shipping-delay-notifier-publish.json` into n8n. It runs on import with no credentials: the shipped `config` takes the built-in sample path and stops on a named `STOP:` node before anything is sent or written.

## Who it's for

Online shops that ship with several carriers and hear about lost or stuck parcels only when the customer writes in angry. A short, early email turns most of those tickets into a thank-you.

## How it works

1. Every weekday at 10:00 it reads open shipments from the Shipments tab, or 7 sample shipments until the sheet is set.
2. It looks up all tracking numbers in one AfterShip call, or uses sample tracking until `AFTERSHIP_ENABLED` is on.
3. A shipment is delayed if the carrier reports an exception or failed attempt, if the last scan is 3 or more days old, or if the label was created 4 or more days ago and never scanned.
4. Each delayed shipment gets one email in plain words for its case; a filled notified_at column means it never gets another.
5. The team gets one Slack digest of every delay, plus tracking numbers AfterShip does not know.

## Sections on the canvas

1. **Start and settings.** Runs weekdays at 10:00, after carriers have posted the overnight scans. The delay thresholds and every email sentence live in `config`.
2. **Read open shipments.** The sheet is the list of what you shipped and the memory of who was told. `Collect tracking numbers` makes one item so AfterShip is called once for up to 50 parcels.
3. **Look up tracking.** One read-only AfterShip call with a Header Auth key. `Read AfterShip trackings` keeps only the newest checkpoint per parcel, which is all the delay rules need.
4. **Decide, email and record.** A carrier exception outranks silence, so a customs hold is described as one. A shipment AfterShip does not know goes to the team only, because the number itself may be wrong. Only a live send fills notified_at.

## Setup

1. Run it once as imported. It checks the sample shipments and stops at `STOP: preview - nothing sent`.
2. Create a Shipments tab (order, email, first_name, carrier, tracking_number, shipped_at, notified_at, delay_reason) and put its id in `SHIPMENT_SHEET_ID`.
3. Add a Header Auth credential named `as-api-key` with your AfterShip key to `Fetch tracking from AfterShip`, and set `AFTERSHIP_ENABLED = true`.
4. Connect Gmail and Slack, set `SLACK_CHANNEL_ID`, then put your address in `TEST_EMAIL` before setting `TEST_RUN = false`.

## Settings in `config`

| Setting | Ships as | What it does |
|---|---|---|
| `SHIPMENT_SHEET_ID` | `''` | Google Sheets id with a Shipments tab; blank uses sample shipments |
| `AFTERSHIP_ENABLED` | `false` | set true after adding the AfterShip Header Auth credential |
| `STALL_DAYS` | `3` | no carrier scan for this many days counts as stalled |
| `LABEL_ONLY_DAYS` | `4` | a label never scanned this many days after shipping counts as delayed |
| `EXCEPTION_TAGS` | `["Exception","AttemptFail","Expired"]` | AfterShip tags that mean a problem now |
| `DONE_TAGS` | `["Delivered","AvailableForPickup"]` | AfterShip tags that close a shipment |
| `MESSAGES` | `{"stalled":"Your parcel for order {order` | email text per delay type; {order}, {carrier}, {last_scan}, {location}, {detail}, {shipped} are filled in |
| `SHOP_NAME` | `'Larch & Loom'` | used in the subject and sign-off |
| `DAILY_CAP` | `40` | hard ceiling on emails per run |
| `SLACK_CHANNEL_ID` | `''` | channel for the internal digest; blank skips Slack |
| `TEST_RUN` | `true` | ships true. Nothing reaches a real recipient or system. |
| `TEST_EMAIL` | `''` | blank means preview only; set it and sends are redirected there |

## Nodes that need a credential

- `Read open shipments`
- `Fetch tracking from AfterShip`
- `Email the customer`
- `Update the shipment rows`
- `Post the digest to Slack`

## Requirements

- An AfterShip account with API access
- A Google Sheet of shipments
- A Gmail account
- Optional: a Slack workspace

## Customising

- `STALL_DAYS` and `LABEL_ONLY_DAYS` set when silence counts as a delay.
- `EXCEPTION_TAGS` lists AfterShip statuses that trigger an email at once.
- `MESSAGES` holds the wording for each delay type.

## Verified

Every scenario below was run by `_kit/simulate.ts`: the real Code-node JavaScript and IF/Switch logic, with service calls replaced by canned responses.

| Scenario | Nodes run | Sends or writes | Ends at |
|---|---|---|---|
| shipped config (preview) | 16 | none | `STOP: preview - nothing sent`, `STOP: no Slack channel` |
| live with the sheet, AfterShip and Slack | 21 | `Email the customer`, `Post the digest to Slack`, `Update the shipment rows` | `Post the digest to Slack`, `Update the shipment rows` |
