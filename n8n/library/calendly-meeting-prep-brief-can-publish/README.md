# Send prep briefs for new Calendly bookings with HubSpot context by Gmail

When someone books through Calendly, looks up the invitee's contact, company and deals in HubSpot, writes a one-screen prep note with rule-based talking points, and emails it to the host through Gmail.

Import `calendly-meeting-prep-brief-publish.json` into n8n. It runs on import with no credentials: the shipped `config` takes the built-in sample path and stops on a named `STOP:` node before anything is sent or written.

## Who it's for

Account executives and founders who take sales calls through Calendly and open HubSpot five minutes before each one to remember who they are talking to. The prep note arrives in the host's inbox as soon as the meeting is booked.

## How it works

1. A Calendly webhook fires on invitee.created. A manual run uses a sample booking instead. Cancellations and event types not listed in `EVENT_TYPES` are ignored.
2. HubSpot is searched three times: the contact by email, the company by email domain, and deals linked to the contact.
3. Rules turn that into talking points: not in HubSpot yet, existing customer, an open deal in a late stage, a deal lost before, a free email address, and the campaign that brought them in.
4. The note (meeting time in your timezone, their answers, company size, open pipeline) is emailed to the Calendly host.

## Sections on the canvas

1. **Start and settings.** Calendly calls the webhook on every booking; `Run manually` replays a sample one. Event type filter, timezone and late stages are set in `config`.
2. **Read the booking.** `Pick up the booking` works for both triggers and drops cancellations and unlisted event types before any HubSpot call is made.
3. **Look up HubSpot.** The company is found by email domain rather than through the contact, so a person new to HubSpot still gets company context. `Load sample CRM data` stands in until `USE_HUBSPOT` is true.
4. **Write and send the note.** Talking points come from fixed rules, not a model, so the host can trust each line. A test send goes to `TEST_EMAIL` with the host named in the subject.

## Setup

1. Run it once from `Run manually`. It writes a note for a sample booking and stops at `STOP: preview - nothing sent`.
2. Create a HubSpot private app with contacts, companies and deals read scopes, add it to the three HubSpot nodes, and set `USE_HUBSPOT = true`.
3. Activate the workflow and register the production URL of `Calendly booking received` as a Calendly webhook subscription for invitee.created.
4. Connect Gmail. Put your address in `TEST_EMAIL` to receive every note yourself, then set `TEST_RUN = false` to email hosts.

## Settings in `config`

| Setting | Ships as | What it does |
|---|---|---|
| `USE_HUBSPOT` | `false` | set true after adding the HubSpot credential to the three HubSpot nodes |
| `EVENT_TYPES` | `[]` | Calendly event type names that get a note, e.g. ['Discovery call']; empty = all |
| `HOST_TIMEZONE` | `'America/New_York'` | timezone for the meeting time in the note |
| `LATE_STAGES` | `["decisionmakerboughtin","contractsent"]` | HubSpot deal stage ids that count as late-stage |
| `FREE_EMAIL_DOMAINS` | `["gmail.com","outlook.com","yahoo.com","` | domains that are not a company |
| `FALLBACK_HOST_EMAIL` | `'sales@yourcompany.example'` | used when the booking names no host |
| `TEST_RUN` | `true` | ships true. Nothing reaches a real recipient or system. |
| `TEST_EMAIL` | `''` | blank means preview only; set it and sends are redirected there |

## Nodes that need a credential

- `Find the contact in HubSpot`
- `Find the company by domain`
- `Find deals for the contact`
- `Email the note to the host`

## Requirements

- A Calendly plan with webhooks (Standard or above)
- A HubSpot account with a private app token
- A Gmail account

## Customising

- `EVENT_TYPES` limits notes to named event types, such as Discovery call.
- `HOST_TIMEZONE` sets the time shown in each note.
- `LATE_STAGES` lists deal stages that count as late.

## Verified

Every scenario below was run by `_kit/simulate.ts`: the real Code-node JavaScript and IF/Switch logic, with service calls replaced by canned responses.

| Scenario | Nodes run | Sends or writes | Ends at |
|---|---|---|---|
| shipped config (preview) | 10 | none | `STOP: preview - nothing sent` |
| webhook booking, HubSpot on, test send | 13 | `Email the note to the host` | `Email the note to the host` |
| cancellation is ignored | 5 | none | `STOP: not a new booking for a listed event type` |
