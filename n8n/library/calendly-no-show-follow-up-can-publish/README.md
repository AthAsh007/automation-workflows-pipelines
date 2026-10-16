# Follow up Calendly no-shows with a rebooking email in Gmail

Every two hours, reads Calendly meetings from the last day, finds invitees the host marked as no-show, and sends each person one short rebooking email through Gmail with the right booking link, a cooldown and a per-run cap.

Import `calendly-no-show-follow-up-publish.json` into n8n. It runs on import with no credentials: the shipped `config` takes the built-in sample path and stops on a named `STOP:` node before anything is sent or written.

## Who it's for

Coaches, consultants and sales teams who mark no-shows in Calendly and then forget to follow up. Each missed meeting gets a friendly rebooking email the same day, once.

## How it works

1. Every two hours it lists your Calendly meetings that started in the last 24 hours and ended at least an hour ago, then reads their invitees. Sample invitees are used until Calendly is connected.
2. Only invitees the host marked as no-show in Calendly are kept. Canceled meetings, internal addresses and anyone emailed in the last 30 days are skipped with a reason.
3. A person with two missed meetings in one window gets one email. `DAILY_CAP` limits sends per run.
4. The email names the missed meeting and links to the matching booking page from `REBOOK_LINKS`. Emailed invitees are remembered only on a live run.

## Sections on the canvas

1. **Start and settings.** Runs every two hours so a no-show hears back the same day. Booking links, cooldown and cap live in `config`.
2. **Read recent invitees.** Meetings are listed first, then invitees per meeting, because the no-show mark lives on the invitee. `MIN_HOURS_AFTER` gives the host time to mark it. `Load sample invitees` stands in until `USE_CALENDLY` is true.
3. **Choose and write.** `Pick who to email` lowercases addresses before the duplicate and cooldown checks, so one person with two bookings gets one email. Every skip carries a reason.
4. **Send and remember.** A test send goes to `TEST_EMAIL` and records nothing, so the real person is still emailed later. Only `Live run?` adds addresses to the cooldown list.

## Setup

1. Run it once as imported. It previews against sample invitees and stops at `STOP: preview - nothing sent`.
2. Add a Calendly credential to both Calendly nodes, paste your user URI into `CALENDLY_USER_URI`, and set `USE_CALENDLY = true`.
3. Fill `REBOOK_LINKS` with the booking page for each event type, then connect Gmail.
4. Put your address in `TEST_EMAIL` to receive every email yourself, then set `TEST_RUN = false`.

## Settings in `config`

| Setting | Ships as | What it does |
|---|---|---|
| `USE_CALENDLY` | `false` | set true after adding the Calendly credential and CALENDLY_USER_URI |
| `CALENDLY_USER_URI` | `''` | your user URI, from GET https://api.calendly.com/users/me |
| `LOOKBACK_HOURS` | `24` | meetings that started this far back are checked |
| `MIN_HOURS_AFTER` | `1` | wait this long after the meeting so the host can mark the no-show |
| `REBOOK_LINKS` | `{"Discovery call":"https://calendly.com/` | event type name -> booking page |
| `DEFAULT_REBOOK_URL` | `'https://calendly.com/yourcompany'` | used for event types not listed above |
| `INTERNAL_DOMAINS` | `["yourcompany.example"]` | invitees on these domains are never emailed |
| `COOLDOWN_DAYS` | `30` | no second email to the same address within this many days |
| `DAILY_CAP` | `20` | hard ceiling on emails per run |
| `SENDER_NAME` | `'Maya at Fieldnote'` | sign-off on every email |
| `TEST_RUN` | `true` | ships true. Nothing reaches a real recipient or system. |
| `TEST_EMAIL` | `''` | blank means preview only; set it and sends are redirected there |

## Nodes that need a credential

- `List recent Calendly meetings`
- `Read invitees of each meeting`
- `Email the rebooking link`

## Requirements

- A Calendly account with API access (personal access token or OAuth)
- A Gmail account

## Customising

- `REBOOK_LINKS` maps event type names to booking pages; `DEFAULT_REBOOK_URL` covers the rest.
- `COOLDOWN_DAYS` stops repeat emails to the same person.
- `INTERNAL_DOMAINS` keeps colleagues out.

## Verified

Every scenario below was run by `_kit/simulate.ts`: the real Code-node JavaScript and IF/Switch logic, with service calls replaced by canned responses.

| Scenario | Nodes run | Sends or writes | Ends at |
|---|---|---|---|
| shipped config (preview) | 9 | none | `STOP: preview - nothing sent` |
| live with Calendly | 14 | `Email the rebooking link` | `Remember who was emailed` |
