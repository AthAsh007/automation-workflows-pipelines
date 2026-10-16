# Trello card to SMS

> **Import the JSON.** [`01-trello-card-to-sms.json`](01-trello-card-to-sms.json).
> One file, one config node, runs on n8n Cloud, and demonstrates with **no Trello
> account and no Twilio credential at all** — the SMS is built in full and shown instead of sent.

**Post:** *AI Automation Specialist* — job `022100032834442544029`.

**One slice of a build engagement:** the post asks for a consultant who connects Trello,
SMS and other business tools, tests thoroughly, and trains a team. This workflow is the
**Trello → SMS tool-pair**, done right: config node, preview mode, named STOP nodes,
idempotency-safe structure, and a simulation that traces every branch.

## The flow

A Trello card lands on the watched list. The workflow:

1. **reads the card** — pulls the contact name, phone number, company, budget, timeline,
   and labels from any field: card name, card description text, or a Trello custom field.
   A card without a phone number stops at **STOP: no phone number**.
2. **builds the SMS** from the template in `config` — the same `{{field}}` substitution
   the client edits.
3. **sends it through Twilio** — or, with no credential, stops at
   **STOP: preview — SMS not sent**, showing the exact body and the number it would go to.
4. A refused send lands on **STOP: SMS rejected** with the response on it — visible, not silent.

```text
When a card arrives (webhook) ─┐
Run the demo ── load a demo card ─┐
                              └─→ config
                                  └─ read the card
                                      └─ has a phone number? ─no─→ STOP: no phone number ─→ End
                                                          │yes
                                                      build the SMS
                                                          └─ SMS configured? ─no─→ STOP: preview ─ SMS not sent ─→ End
                                                                              │yes
                                                                [cred] Twilio - send SMS
                                                                     ├─ ok ──→ STOP: SMS sent ─→ End
                                                                     └─ err ─→ STOP: SMS rejected ─→ End
```

## The config node

One `config` Code node — everything a client or team edits is a `const` here:

```js
const TRELLO_KEY       = '';    // Trello API key
const TRELLO_TOKEN     = '';    // Trello token
const TRELLO_BOARD_ID  = '';    // board to watch
const TRELLO_LIST_ID   = '';    // list that triggers the workflow

const TWILIO_ACCOUNT_SID = '';  // blank -> preview, never fail
const TWILIO_AUTH_TOKEN  = '';
const TWILIO_FROM_NUMBER = '+14155238886';

const TRENCH_PHONE = '';        // in DRY_RUN, redirects SMS here for testing
const SMS_TEMPLATE = "Hi {{contact_name}}, ...";  // {{field}} placeholders

const LEAD_LABEL_PREFIX = 'lead'; // only cards with a label starting with this fire
const PHONE_FIELD_IDS   = [];     // Trello custom-field ids for phone, if any

const DRY_RUN = true;           // ships true. Nothing is sent.
```

The safety rules from [`../../docs/CONFIG-NODE.md`](../../docs/CONFIG-NODE.md) are all followed:
- No `$env` — config is in the node, runs on n8n Cloud.
- A blank credential means **skip the step, never fail the run.**
- `DRY_RUN = true` ships in the safest position — the SMS is built and shown, never sent.
- Every `IF` false branch lands on a named `STOP:` node.
- `[cred]` prefix on the Twilio node — the credential is set in n8n, never in the file.

## Run the demo (no credentials, no account)

1. Import `01-trello-card-to-sms.json` — n8n → Workflows → Import from File.
2. Press **Execute Workflow** on the **Run the demo** trigger.
3. Two invented cards trace the full path:
   - **Jane Smith** — has a phone number → **STOP: preview — SMS not sent** → read the exact SMS body.
   - **Enquiry — no phone** → **STOP: no phone number**.

## Setup (~5 minutes, when you want it to send)

1. In `config` — set `TRELLO_KEY`, `TRELLO_TOKEN`, `TRELLO_BOARD_ID`, `TRELLO_LIST_ID` from
   your Trello account. Get them from: Trello → account → API keys, and the board/list
   URL (the long hex string is the id).
2. Set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` from your Twilio console.
3. Point your Trello webhook at `/webhook/trello-card` on your n8n instance. In Trello:
   Power-Ups → Webhooks (or the Butler rule "when a card is created").
4. `DRY_RUN = false` — only then may a run send a real SMS.

## Checking a change

The Code nodes live in `build/js/` and are compiled into the JSON.

```bash
cd build
python build.py       # js/*.js -> ../01-trello-card-to-sms.json
python validate.py    # connections, branches, no $env, one config, ships in preview,
                      # failures visible, yellow start-here note present
node simulate.js      # runs the Code logic against demo cards + edge cases
```

## What we would change for them

- Add a **Trello → Google Sheets** branch (log every SMS outcome for reporting).
- Add **Trello → Slack** (notify the team on STOP: SMS rejected).
- Generalise the trigger to **webhooks from any form or API**, reusing the same
  `read the card` → `build the SMS` → `send` pipeline.
- Replace the single template with a **template table** keyed on card labels
  (different message per inquiry type).
- Add **retry with backoff** and a **dead-letter log** for cards that persistently fail.

The config node and the gate-and-STOP pattern are the foundation — swap the trigger
and the send node, keep the rest.
