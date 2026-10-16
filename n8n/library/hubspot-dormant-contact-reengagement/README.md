# Re-engage dormant HubSpot contacts with a three-touch Gmail sequence

Each weekday, finds HubSpot leads with no activity for 120 days, walks each one through a three-email Gmail sequence spaced 0, 5 and 7 days apart, stores the touch number on the contact, and ends the sequence on a reply, an unsubscribe or the last touch.

Import `hubspot-dormant-contact-reengagement-publish.json` into n8n. It runs on import with no credentials: the shipped `config` takes the built-in sample path and stops on a named `STOP:` node before anything is sent or written.

## Who it's for

Small sales and marketing teams with a HubSpot database full of leads nobody has spoken to in months. It works through them a few at a time from your own Gmail, so replies come back to a person, not a marketing tool.

## How it works

1. Every weekday at 09:30 it searches HubSpot for contacts in the chosen lifecycle stages with no activity for `DORMANT_DAYS`, or uses sample contacts until HubSpot is connected.
2. The touch already sent, its date and the sequence status are read from three custom contact properties. Touch 2 waits 5 days after touch 1, touch 3 waits 7 days after touch 2.
3. A reply since the sequence started, or an email opt-out, closes the sequence at once. Fourteen days after touch 3 it is marked completed.
4. Up to `DAILY_CAP` emails go out through Gmail. On a live run each send updates the touch properties and each closed sequence gets its final status.

## Sections on the canvas

1. **Start and settings.** Weekday mornings only, so touches never land on a weekend. The three emails, gaps and the daily cap live in `config`.
2. **Find dormant contacts.** HubSpot filters by lifecycle stage and last activity, and `Plan the next touch` checks lifecycle again in case a contact moved stage. `Load sample contacts` stands in until `USE_HUBSPOT` is true.
3. **Plan touches and close sequences.** Replies and opt-outs are checked before any send, so nobody who answered gets another email. Closed sequences are written back only on a live run.
4. **Send and record the touch.** A test send goes to `TEST_EMAIL` and leaves the contact unchanged, so the real touch still goes later. The touch number is written after the email, never before.

## Setup

1. Run it once as imported. It plans sample touches and stops at `STOP: preview - nothing sent` and `STOP: not live - statuses unchanged`.
2. In HubSpot create contact properties reengage_touch (number), reengage_started and reengage_last_sent (date), and reengage_status (single-line text).
3. Add a HubSpot private app credential to the three HubSpot nodes, set `USE_HUBSPOT = true`, and connect Gmail.
4. Put your address in `TEST_EMAIL` to receive the touches yourself, then set `TEST_RUN = false`.

## Settings in `config`

| Setting | Ships as | What it does |
|---|---|---|
| `USE_HUBSPOT` | `false` | set true after adding the HubSpot credential and creating the reengage_* properties |
| `DORMANT_DAYS` | `120` | no activity for this many days makes a contact dormant |
| `LIFECYCLE_STAGES` | `["lead","marketingqualifiedlead","salesq` | HubSpot lifecycle stage ids that may enter the sequence |
| `TOUCHES` | `[{"gap_days":0,"subject":"Still looking ` | gap_days = days after the previous touch; {first_name} {company} {topic} are filled in |
| `DEFAULT_TOPIC` | `'scheduling'` | used for {topic} when the contact has no interest recorded |
| `COMPLETE_AFTER_DAYS` | `14` | days after the last touch before the sequence is marked completed |
| `DAILY_CAP` | `25` | hard ceiling on emails per run |
| `SENDER_NAME` | `'Maya Ortiz'` | sign-off on every touch |
| `TEST_RUN` | `true` | ships true. Nothing reaches a real recipient or system. |
| `TEST_EMAIL` | `''` | blank means preview only; set it and sends are redirected there |

## Nodes that need a credential

- `Search dormant contacts`
- `Close the sequence in HubSpot`
- `Email the touch`
- `Record the touch on the contact`

## Requirements

- A HubSpot account with a private app (contacts read and write)
- A Gmail account

## Customising

- `TOUCHES` holds the gap, subject and body of each email.
- `LIFECYCLE_STAGES` and `DORMANT_DAYS` decide who enters the sequence.
- `DAILY_CAP` keeps sending volume low enough for a personal mailbox.

## Verified

Every scenario below was run by `_kit/simulate.ts`: the real Code-node JavaScript and IF/Switch logic, with service calls replaced by canned responses.

| Scenario | Nodes run | Sends or writes | Ends at |
|---|---|---|---|
| shipped config (preview) | 12 | none | `STOP: preview - nothing sent`, `STOP: not live - statuses unchanged` |
| live with HubSpot | 15 | `Email the touch`, `Close the sequence in HubSpot`, `Record the touch on the contact` | `Close the sequence in HubSpot`, `Record the touch on the contact` |
