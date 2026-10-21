# Route Typeform demo requests to Airtable by company size and region

Takes each Typeform demo request from a webhook, checks Airtable for a repeat or a retried delivery, sets a size tier and sales region, picks the owner from a routing table, works out a respond-by time in that region's business hours, confirms to the requester, alerts the owner, and adds or updates the Airtable record.

Import `typeform-demo-request-router-publish.json` into n8n. It runs on import with no credentials: the shipped `config` takes the built-in sample path and stops on a named `STOP:` node before anything is sent or written.

## Who it's for

Sales and marketing teams that collect demo requests in Typeform and sort them by hand into a shared Airtable base. Each request lands with the right owner within seconds, with a deadline that respects their working hours.

## How it works

1. Typeform posts each submission to the webhook. A manual run uses a sample submission. Answers are read by field ref, so reordering the form does not break anything.
2. Airtable is searched for earlier requests from the same email. A retried delivery of the same Typeform event stops here. A repeat within `REPEAT_WINDOW_DAYS` goes back to the owner who already has it, and if the lookup fails the request carries on with a flag.
3. Company size picks the tier, country picks the region, and `ROUTING` picks the owner. Missing and disposable emails are rejected.
4. A respond-by time is counted in the region's business hours from `RESPONSE_SLA_HOURS`, so a Friday evening request is due Monday morning, not Saturday.
5. The requester gets a confirmation, the owner of a sales-led tier gets a heads-up with the deadline, and Airtable gets a new record or an update to the earlier one.

## Sections on the canvas

1. **Start and settings.** Typeform posts to the webhook on each submission; `Run manually` replays a sample. Tiers, regions, routing, working hours and SLAs all live in `config`.
2. **Check for repeats.** Typeform retries a delivery it thinks failed, and people submit twice. `Check for repeats` stops a retried event and marks a repeat inside `REPEAT_WINDOW_DAYS`. `Find earlier requests in Airtable` carries on after an error, so a lookup failure becomes a flag, not a lost lead.
3. **Route and set a deadline.** Answers decide tier and region; a repeat keeps its earlier owner if that owner still covers the tier. `Work out the respond-by time` counts only working minutes in the region's timezone, so weekends and nights do not eat the SLA.
4. **Confirm and alert the owner.** The requester hears the next step for their tier. Sales-led tiers also email the owner with the deadline in their own timezone. A test send goes to `TEST_EMAIL` with the real recipient in the subject.
5. **Add or update in Airtable.** Only a live run writes, and only with `AIRTABLE_BASE_ID` set. A repeat updates the earlier record instead of adding a second row for the same person, so the table stays one row per open request.

## Setup

1. Run it once from `Run manually`. It routes a sample request against sample Airtable history and stops at `STOP: preview - nothing sent`.
2. In Typeform, set a ref on each question that matches `FIELD_REFS`, then add the production URL of `Typeform demo request` as a webhook.
3. Add an Airtable token credential to the three Airtable nodes and fill `AIRTABLE_BASE_ID`. The table needs Email, Owner, Submitted at and Typeform event fields. Connect Gmail.
4. Put your address in `TEST_EMAIL` to receive both emails yourself, then set `TEST_RUN = false`.

## Settings in `config`

| Setting | Ships as | What it does |
|---|---|---|
| `FIELD_REFS` | `{"first_name":"first_name","last_name":"` | our field -> Typeform question ref |
| `SIZE_TIERS` | `[{"tier":"Enterprise","min":1000},{"tier` | checked top to bottom on the lower bound of the size answer |
| `REGIONS` | `{"AMER":["US","United States","Canada","` | region -> country names as they appear in the form |
| `ROUTING` | `{"Enterprise|AMER":{"owner":"Maya Ortiz"` | 'tier/region' -> owner; 'tier/*' is the fallback for that tier |
| `RESPONSE_SLA_HOURS` | `{"Enterprise":2,"Mid-market":8}` | business hours the owner has to reply, per tier; a tier not listed gets no owner alert |
| `BUSINESS_HOURS` | `{"AMER":{"tz":"America/New_York","start"` | region -> timezone and working hours used for the respond-by time |
| `WORK_DAYS` | `[1,2,3,4,5]` | working weekdays, 1 = Monday ... 7 = Sunday |
| `REPEAT_WINDOW_DAYS` | `30` | a new request from an email seen in Airtable within this many days stays with the same owner and updates that record |
| `FREE_EMAIL_DOMAINS` | `["gmail.com","outlook.com","yahoo.com","` | accepted but flagged as personal |
| `BLOCKED_DOMAINS` | `["mailinator.com","tempmail.dev","guerri` | disposable domains; the request is rejected |
| `AIRTABLE_BASE_ID` | `''` | Airtable base id (starts with app); blank uses sample history and skips the write |
| `AIRTABLE_TABLE` | `'Demo requests'` | table that receives each request |
| `SENDER_NAME` | `'The Fieldnote team'` | sign-off on the confirmation |
| `TEST_RUN` | `true` | ships true. Nothing reaches a real recipient or system. |
| `TEST_EMAIL` | `''` | blank means preview only; set it and sends are redirected there |

## Nodes that need a credential

- `Find earlier requests in Airtable`
- `Send the confirmation`
- `Email the owner a heads-up`
- `Update the earlier request in Airtable`
- `Add the request to Airtable`

## Requirements

- A Typeform account with webhooks
- An Airtable base with a Demo requests table
- A Gmail account

## Customising

- `SIZE_TIERS`, `REGIONS` and `ROUTING` change the cut-offs, country lists and owners.
- `BUSINESS_HOURS`, `WORK_DAYS` and `RESPONSE_SLA_HOURS` set the deadline maths. A tier with no SLA gets no owner alert.
- `REPEAT_WINDOW_DAYS` sets how long a repeat request stays with the same owner.

## Verified

Every scenario below was run by `_kit/simulate.ts`: the real Code-node JavaScript and IF/Switch logic, with service calls replaced by canned responses.

| Scenario | Nodes run | Sends or writes | Ends at |
|---|---|---|---|
| shipped config (preview) | 14 | none | `STOP: preview - nothing sent` |
| enterprise request from Germany on a Friday afternoon, live | 20 | `Send the confirmation`, `Email the owner a heads-up`, `Add the request to Airtable` | `Email the owner a heads-up`, `Add the request to Airtable` |
| repeat request stays with its earlier owner and updates the record | 20 | `Send the confirmation`, `Email the owner a heads-up`, `Update the earlier request in Airtable` | `Email the owner a heads-up`, `Update the earlier request in Airtable` |
| retried delivery of the same event stops | 9 | none | `STOP: duplicate delivery - already recorded` |
| failed lookup is flagged and SMB gets no owner alert | 20 | `Send the confirmation`, `Add the request to Airtable` | `STOP: self-serve tier - no owner alert`, `Add the request to Airtable` |
| disposable email is rejected | 11 | none | `STOP: rejected request` |
