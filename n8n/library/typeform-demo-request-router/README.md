# Route Typeform demo requests to Airtable by company size and region

Takes each Typeform demo request from a webhook, reads the answers by field ref, sets a size tier and sales region, picks the owner from a routing table, sends the requester a confirmation that names the next step, and adds the request to Airtable.

Import `typeform-demo-request-router-publish.json` into n8n. It runs on import with no credentials: the shipped `config` takes the built-in sample path and stops on a named `STOP:` node before anything is sent or written.

## Who it's for

Sales and marketing teams that collect demo requests in Typeform and sort them by hand into a shared Airtable base. Each request lands with the right owner within seconds, and the requester hears back straight away.

## How it works

1. Typeform posts each submission to the webhook. A manual run uses a sample submission.
2. Answers are read by field ref, not by position, so reordering the form does not break anything. Company size picks the tier: SMB under 50, Mid-market up to 999, Enterprise from 1,000.
3. Country picks the region (AMER, EMEA, APAC), and `ROUTING` picks the owner for that tier and region. SMB requests go to self-serve with a booking link.
4. Requests with no valid email, or from a disposable domain, are rejected. Personal email addresses are flagged. The confirmation goes out through Gmail and the request is added to Airtable.

## Sections on the canvas

1. **Start and settings.** Typeform posts to the webhook on each submission; `Run manually` replays a sample. Tiers, regions and the routing table all live in `config`.
2. **Read and route.** Answers are matched by field ref, so the form can be reworded without touching the workflow. `Valid request?` rejects missing and disposable emails before anything is sent.
3. **Confirm to the requester.** The email names the next step for that tier, a group demo for SMB or a named owner for larger teams. A test send goes to `TEST_EMAIL` with the real address in the subject.
4. **Record in Airtable.** Only a live run writes to Airtable, and only when `AIRTABLE_BASE_ID` is set. Typecast lets Airtable create new select options such as a new region.

## Setup

1. Run it once from `Run manually`. It routes a sample request and stops at `STOP: preview - nothing sent`.
2. In Typeform, set a ref on each question that matches `FIELD_REFS`, then add the production URL of `Typeform demo request` as a webhook.
3. Add an Airtable token credential to `Add the request to Airtable` and fill `AIRTABLE_BASE_ID`. Connect Gmail.
4. Put your address in `TEST_EMAIL` to receive confirmations yourself, then set `TEST_RUN = false`.

## Settings in `config`

| Setting | Ships as | What it does |
|---|---|---|
| `FIELD_REFS` | `{"first_name":"first_name","last_name":"` | our field -> Typeform question ref |
| `SIZE_TIERS` | `[{"tier":"Enterprise","min":1000},{"tier` | checked top to bottom on the lower bound of the size answer |
| `REGIONS` | `{"AMER":["US","United States","Canada","` | region -> country names as they appear in the form |
| `ROUTING` | `{"Enterprise|AMER":{"owner":"Maya Ortiz"` | 'tier/region' -> owner; 'tier/*' is the fallback for that tier |
| `FREE_EMAIL_DOMAINS` | `["gmail.com","outlook.com","yahoo.com","` | accepted but flagged as personal |
| `BLOCKED_DOMAINS` | `["mailinator.com","tempmail.dev","guerri` | disposable domains; the request is rejected |
| `AIRTABLE_BASE_ID` | `''` | Airtable base id (starts with app); blank skips the write |
| `AIRTABLE_TABLE` | `'Demo requests'` | table that receives each request |
| `SENDER_NAME` | `'The Fieldnote team'` | sign-off on the confirmation |
| `TEST_RUN` | `true` | ships true. Nothing reaches a real recipient or system. |
| `TEST_EMAIL` | `''` | blank means preview only; set it and sends are redirected there |

## Nodes that need a credential

- `Send the confirmation`
- `Add the request to Airtable`

## Requirements

- A Typeform account with webhooks
- An Airtable base with a Demo requests table
- A Gmail account

## Customising

- `SIZE_TIERS` and `REGIONS` change the cut-offs and country lists.
- `ROUTING` maps each tier and region to an owner and meeting link.
- `FIELD_REFS` matches your own question refs.

## Verified

Every scenario below was run by `_kit/simulate.ts`: the real Code-node JavaScript and IF/Switch logic, with service calls replaced by canned responses.

| Scenario | Nodes run | Sends or writes | Ends at |
|---|---|---|---|
| shipped config (preview) | 8 | none | `STOP: preview - nothing sent` |
| enterprise request from Germany, live | 11 | `Send the confirmation`, `Add the request to Airtable` | `Add the request to Airtable` |
| disposable email is rejected | 6 | none | `STOP: rejected request` |
